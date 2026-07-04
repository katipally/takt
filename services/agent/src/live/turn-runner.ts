import { streamProvider, type Message } from "@prox/harness";
import type { Product, Manual } from "@prox/shared";
import { buildProxTools, type ProxTool, type Emit } from "../tools.js";
import { collectTurn } from "../turn.js";
import { buildSystemPrompt } from "../prompt.js";
import { resolveChat } from "../providers.js";

const MAX_STEPS = 16;

// Live mode needs the model to answer in short, speakable turns while still
// having its tools (search the manual, draw an artifact on the Canvas, look
// through the camera).
const LIVE_ADDENDUM = `

---
YOU ARE IN LIVE VOICE MODE. The user is talking to you and HEARS your reply as speech.
- Keep replies SHORT and conversational — usually 1–3 spoken sentences. No markdown, headings, bullet lists, code blocks, or long quoted citations in what you say.
- You STILL have your tools. Search the manual before stating specifics. When a picture or interactive answer helps, call emit_artifact / get_page_image / crop_page_image so it appears on the user's Canvas, and say one sentence telling them to look at the panel.
- You can SEE the user's camera when it's on; a recent frame is attached to their message. If you need a closer or fresher look, call the \`look\` tool. If the camera is off and you need to see, ask them to turn it on.
- Say page numbers naturally ("page 18") instead of reading "[p.18]" aloud.`;

// A per-call LLM driver that keeps a growing Message[] across turns (unlike the
// one-shot runAgent) and injects the camera frame(s) onto each user turn. Reuses
// the exact pieces runAgent composes: buildProxTools, collectTurn, streamProvider.
export class LiveTurnRunner {
  private messages: Message[];

  constructor(
    private product: Product,
    private manuals: Manual[],
    private chatId: string | undefined,
    private extraTools: ProxTool[],
  ) {
    this.messages = [{ role: "system", text: buildSystemPrompt(product, manuals) + LIVE_ADDENDUM }];
  }

  async runTurn(userText: string, frames: { data: string; mime: string }[], emit: Emit, signal: AbortSignal): Promise<void> {
    this.messages.push({ role: "user", text: userText, images: frames.length ? frames : undefined });
    const { provider, model, apiKey } = resolveChat();
    if (!model) { await emit({ type: "error", message: "No model selected. Open Settings → Models and pick a model." }); return; }
    if (!apiKey && !provider.keyless) { await emit({ type: "error", message: `No API key for ${provider.name}. Add one in Settings → Models.` }); return; }
    // Build tools with THIS turn's emit so their artifact/page_image events are
    // dropped by the same epoch guard when a barge-in interrupts the turn.
    const tools = [...buildProxTools({ product: this.product, manuals: this.manuals, emit, chatId: this.chatId }), ...this.extraTools];
    const toolDefs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

    for (let step = 0; step < MAX_STEPS; step++) {
      if (signal.aborted) return;
      // effort "low" keeps reasoning models fast; maxTokens must be high enough
      // that reasoning tokens don't consume the whole budget and leave NO spoken
      // text (that emptied GPT-5 Nano replies at 1024).
      const turn = await collectTurn(
        streamProvider(provider, apiKey ?? undefined, { model, messages: this.messages, tools: toolDefs, effort: "low", maxTokens: 4096 }, signal),
        emit,
      );
      this.messages.push({
        role: "assistant",
        text: turn.text,
        reasoning: turn.reasoning || undefined,
        reasoningSignature: turn.reasoningSignature,
        toolCalls: turn.toolCalls.length ? turn.toolCalls : undefined,
      });
      await emit({ type: "usage", contextTokens: turn.usage.input, outputTokens: turn.usage.output, costUsd: 0 });
      if (!turn.toolCalls.length) break;
      for (const tc of turn.toolCalls) {
        if (signal.aborted) return;
        const tool = tools.find((t) => t.name === tc.name);
        if (!tool) { this.messages.push({ role: "tool", callId: tc.id, name: tc.name, result: `Unknown tool "${tc.name}".`, isError: true }); continue; }
        let res;
        try { res = await tool.execute(safeParseArgs(tc.arguments)); }
        catch (e: any) { res = { output: `Error: ${String(e?.message ?? e)}`, isError: true as const }; }
        this.messages.push({ role: "tool", callId: tc.id, name: tc.name, result: res.output, images: res.images, isError: res.isError });
      }
    }
  }
}

function safeParseArgs(s: string): any {
  const t = (s ?? "").trim();
  if (!t) return {};
  try { return JSON.parse(t); } catch { return {}; }
}
