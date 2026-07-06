import { streamProvider, type Message } from "@takt/harness";
import type { Product, Manual, SseEvent } from "@takt/shared";
import { buildTaktTools, type Emit } from "./tools.js";
import { collectTurn } from "./turn.js";
import { resolveBuild } from "./providers.js";
import { validateSurface, surfacePartId } from "@takt/shared";
import { DESIGN_GUIDE } from "./prompt.js";

const MAX_STEPS = 20;

// The BUILD subagent. Runs as an independent instance (its own model, message
// list, and loop) so the main agent can keep talking while this gathers sources
// and composes ONE emit_ui surface. It never speaks — its text/reasoning are
// dropped; only tool activity (tagged lane:"build"), page images, and the final
// ui_surface reach the client. Delegated to by the main agent's delegate_build.
export async function runBuildSubagent(opts: {
  brief: string;
  key?: string;
  product: Product | null;
  manuals: Manual[];
  context: { role: "user" | "assistant"; text: string }[];
  emit: Emit;
  signal: AbortSignal;
}): Promise<void> {
  const { brief, key, product, manuals, context, emit, signal } = opts;
  const { provider, model, apiKey, effort } = resolveBuild();
  if (!model) return;

  // Build-lane emit: forward progress + the surface, but never prose.
  const buildEmit: Emit = async (e: SseEvent) => {
    if (e.type === "text_delta" || e.type === "reasoning_delta" || e.type === "done" || e.type === "title" || e.type === "usage") return;
    if (e.type === "tool_start") return emit({ ...e, lane: "build" });
    return emit(e);
  };

  const tools = buildTaktTools({ product, manuals, emit: buildEmit, chatId: undefined })
    .filter((t) => t.name !== "ask_user" && t.name !== "delegate_build");
  const toolDefs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

  const sys = `You are Takt's BUILD worker. Another agent is talking to the user; your ONLY job is to compose ONE designed PAGE that answers this brief, then stop. You never write prose to the user — you gather what you need and call emit_ui exactly once with a single \`Page\` node.

BRIEF: ${brief}

Gather REAL material first when the brief involves a product — reach for the tool that fits:
- A part / fault / procedure / spec and how it connects → \`find_entity\`, then \`get_anchors\` on it to get the EXACT media to show: the \`crop_page_image\` call for a manual figure, the \`/assets/*.glb\` for a 3D part, or a video clip. Use \`walk_graph\` to pull related faults/steps.
- A described symptom in plain words → \`search_product\` (semantic). An exact code / part number → \`grep_profile\`. Full concept text → \`read_profile\`.
- A product overview / map → \`product_map\`.
Always embed only a real \`/assets/\` URL a tool returned — never invent one. NEVER embed a whole manual page (a \`/assets/pages/…\` URL) — always \`crop_page_image\` to the exact region (the table, the diagram, the labeled part); whole pages have headers/margins/whitespace and read like a screenshot.

Then call emit_ui ONCE with a surface whose root is a single \`Page\` node${key ? ` and key "${key}"` : ""}: \`{ "root":"pg", "nodes":[{ "id":"pg", "type":"Page", "props":{ "html":"…", "css":"…" } }] }\`.
${DESIGN_GUIDE}
SHOW, DON'T TELL: the page MUST include at least one real visual island — a cropped manual figure (\`<takt-figure src="…" caption="…">\`), a 3D part (\`<takt-model src="…">\` — ALWAYS include it when get_anchors returns a mesh_node; a rotatable part beats a photo), or a video clip (\`<takt-video src="…">\`) — chosen for THIS brief. Carry the answer in visuals + structure (a \`.takt-grid\`, an \`<ol>\` of steps, a spec \`<table>\`, \`.takt-stat\` tiles), keep prose tight, cite facts with \`<takt-cite page="NN">\`. Crop tight, pull only the relevant part's 3D, don't dump the whole manual.
BE DECISIVE: a few tool calls to gather is plenty — one or two find_entity/search calls and the get_anchors/crop for the figures you'll show. Do NOT keep re-searching. As soon as you have enough, call emit_ui — you MUST emit_ui before you run out of steps, so build with what you have. When the surface is emitted you are done — do not narrate.`;

  const messages: Message[] = [
    { role: "system", text: sys },
    ...context.slice(-6).map((m) => ({ role: m.role, text: m.text })),
    { role: "user", text: `Build the surface for: ${brief}` },
  ];

  try {
    await emit({ type: "status", text: "Designing a visual…" });
    // Deterministic anti-dithering guard: weaker models over-gather and never
    // commit to emit_ui. After GATHER_BUDGET steps, restrict the toolset to
    // emit_ui ONLY (and nudge) so the worker MUST build with what it has.
    const GATHER_BUDGET = 8;
    const emitOnly = toolDefs.filter((t) => t.name === "emit_ui");
    let emitted = false, nudged = false, lastGood = "";
    for (let step = 0; step < MAX_STEPS && !emitted; step++) {
      if (signal.aborted) return;
      const force = step >= GATHER_BUDGET;
      if (force && !nudged) {
        messages.push({ role: "user", text: "You've gathered enough. Call emit_ui NOW and build the surface from the material you already have — do not call any other tool." });
        nudged = true;
      }
      const turn = await collectTurn(
        streamProvider(provider, apiKey ?? undefined, { model, messages, tools: force ? emitOnly : toolDefs, effort, maxTokens: 8192 }, signal),
        buildEmit,
      );
      messages.push({ role: "assistant", text: turn.text, reasoning: turn.reasoning || undefined, reasoningSignature: turn.reasoningSignature, toolCalls: turn.toolCalls.length ? turn.toolCalls : undefined });
      if (!turn.toolCalls.length) { if (force) continue; break; } // when forcing, keep looping until it emits
      for (const tc of turn.toolCalls) {
        if (signal.aborted) return;
        const tool = tools.find((t) => t.name === tc.name);
        if (!tool) { messages.push({ role: "tool", callId: tc.id, name: tc.name, result: `Unknown tool "${tc.name}".`, isError: true }); continue; }
        let res;
        try { res = await tool.execute(safeParse(tc.arguments)); }
        catch (e: any) { res = { output: `Error: ${String(e?.message ?? e)}`, isError: true as const }; }
        if (tc.name === "emit_ui" && !res.isError) emitted = true;
        else if (!res.isError && (res.output?.length ?? 0) > lastGood.length) lastGood = res.output;
        messages.push({ role: "tool", callId: tc.id, name: tc.name, result: res.output, images: res.images, isError: res.isError });
      }
    }
    // Guaranteed fallback: if the worker never produced a valid surface (a rare
    // model flake), emit a minimal grounded Prose surface from the best material
    // it gathered — so the canvas never ends up empty.
    if (!emitted && !signal.aborted) {
      const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
      const md = (lastGood || `Here's what I found for: ${brief}`).replace(/```[\s\S]*?```/g, "").slice(0, 1400).trim();
      const html = `<p class="takt-eyebrow">Summary</p><h1>${esc(brief.slice(0, 80))}</h1><p class="takt-lead">${esc(md || "No details available.")}</p>`;
      const fb = { id: "fallback", ...(key ? { key } : {}), title: brief.slice(0, 64), root: "pg", nodes: [
        { id: "pg", type: "Page", props: { html } },
      ] };
      const v = validateSurface(fb);
      if (v.ok) await buildEmit({ type: "ui_surface", partId: surfacePartId(v.surface), surface: v.surface });
    }
  } catch {
    // A failed build is non-fatal — the main agent already answered in prose.
  } finally {
    await emit({ type: "status", text: null });
  }
}

function safeParse(s: string): any {
  const t = (s ?? "").trim();
  if (!t) return {};
  try { return JSON.parse(t); } catch { return {}; }
}
