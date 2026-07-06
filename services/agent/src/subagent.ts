import { streamProvider, type Message } from "@takt/harness";
import type { Product, Manual, SseEvent } from "@takt/shared";
import { buildTaktTools, type Emit } from "./tools.js";
import { collectTurn } from "./turn.js";
import { resolveBuild } from "./providers.js";
import { catalogPromptSection } from "@takt/shared";

const MAX_STEPS = 12;

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

Use the tools to gather REAL material first when the brief involves a product: search the Profile (list_profile → grep_profile → read_profile) for exact facts, and crop_page_image for any figure you show (embed the returned /assets/ URL — never invent one). Then call emit_ui with a flat list of catalog nodes${key ? ` and key "${key}"` : ""}. Prefer rich, multimodal surfaces: real cropped images, charts, tables, diagrams, steps. Catalog:
${catalogPromptSection()}
Cite product facts inline as [p.NN]. When the surface is emitted you are done — do not narrate.`;

  const messages: Message[] = [
    { role: "system", text: sys },
    ...context.slice(-6).map((m) => ({ role: m.role, text: m.text })),
    { role: "user", text: `Build the surface for: ${brief}` },
  ];

  try {
    await emit({ type: "status", text: "Designing a visual…" });
    for (let step = 0; step < MAX_STEPS; step++) {
      if (signal.aborted) return;
      const turn = await collectTurn(
        streamProvider(provider, apiKey ?? undefined, { model, messages, tools: toolDefs, effort, maxTokens: 8192 }, signal),
        buildEmit,
      );
      messages.push({ role: "assistant", text: turn.text, reasoning: turn.reasoning || undefined, reasoningSignature: turn.reasoningSignature, toolCalls: turn.toolCalls.length ? turn.toolCalls : undefined });
      if (!turn.toolCalls.length) break;
      let emitted = false;
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
      if (emitted) break; // surface delivered — stop
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
