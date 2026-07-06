import { streamProvider, type Message } from "@takt/harness";
import type { Product, Manual, SseEvent } from "@takt/shared";
import { buildTaktTools, type Emit } from "./tools.js";
import { collectTurn } from "./turn.js";
import { resolveBuild } from "./providers.js";
import { catalogPromptSection } from "@takt/shared";

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

  const sys = `You are Takt's BUILD worker. Another agent is talking to the user; your ONLY job is to compose ONE designed UI surface that answers this brief, then stop. You do not talk to the user and never write prose — you gather what you need and call emit_ui exactly once.

BRIEF: ${brief}

Gather REAL material first when the brief involves a product — reach for the tool that fits:
- A part / fault / procedure / spec and how it connects → \`find_entity\`, then \`get_anchors\` on it to get the EXACT media to show: the \`crop_page_image\` call for a manual figure, the \`/assets/*.glb\` for a 3D part (Model3D), or a video clip. Use \`walk_graph\` to pull related faults/steps.
- A described symptom in plain words → \`search_product\` (semantic). An exact code / part number → \`grep_profile\`. Full concept text → \`read_profile\`.
- A product overview / map → \`product_map\`.
Always embed only a real \`/assets/\` URL a tool returned (crop_page_image, get_anchors) — never invent one. Then call emit_ui with a flat list of catalog nodes${key ? ` and key "${key}"` : ""}. SHOW, DON'T TELL: every surface MUST include at least one real visual — a manual figure cropped to the RELEVANT region (Image), a 3D part (Model3D), a video clip (Video), or a Gallery — chosen for THIS brief. Keep Prose to a sentence or two; carry the answer in visuals + structure (Steps, KeyValue, Table), cite facts inline as [p.NN]. Match the layout to the brief (a how-to → Steps + the cropped figure; a part → Model3D + KeyValue specs + related faults; a comparison → Table/Columns). Use resources efficiently — crop tight to what matters, pull only the relevant part's 3D, don't dump the whole manual. Catalog:
${catalogPromptSection()}
BE DECISIVE: a few tool calls to gather is plenty — one or two find_entity/search calls and the get_anchors/crop for the figures you'll show. Do NOT keep re-searching. As soon as you have enough for a useful surface, call emit_ui — you MUST emit_ui before you run out of steps, so build with what you have rather than gathering more. When the surface is emitted you are done — do not narrate.`;

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
    let emitted = false, nudged = false;
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
        messages.push({ role: "tool", callId: tc.id, name: tc.name, result: res.output, images: res.images, isError: res.isError });
      }
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
