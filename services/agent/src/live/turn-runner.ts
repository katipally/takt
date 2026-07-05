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
// Voice-only addendum. The shared PERSONA already lives in buildSystemPrompt, so
// this adds ONLY what's specific to a spoken conversation.
const LIVE_ADDENDUM = `

---
YOU ARE IN LIVE VOICE MODE — a natural spoken conversation, out loud. Every word you write is read aloud by a text-to-speech voice, so:

HOW YOU TALK
- 1–2 SHORT spoken sentences per turn. Never a list, never bullets, never markdown or symbols ("-", "*", "#") — they sound broken out loud.
- If there are several points, say the single most useful one, then offer more ("want me to keep going?"). Let them pull, don't push.
- No preamble, no recap, don't restate their question. Relaxed and natural — an occasional "yeah" / "so" / "honestly" is fine, don't force it. Don't reuse the same opening line turn after turn.
- Only ask a follow-up when you genuinely need the info.

WHEN IT'S ABOUT A PRODUCT
- Lean in: for specs, settings, or steps, search first and answer from the sources; never invent numbers. Don't keep repeating the product's name — they know what they have. Don't announce what you're about to do ("let me check", "one sec") — just do it. Say page numbers naturally ("page 18"), never read "[p.18]" out loud.

TOOLS & CANVAS (use sparingly)
- Only when the user wants something visual or it clearly helps: emit_artifact / get_page_image / crop_page_image show on their Canvas. Most turns are just talk — no tools.
- You can see their camera when it's on (a recent frame is attached). Need a closer look? Call \`look\`. Camera off and you need to see? Ask them to turn it on.`;

// A per-call LLM driver that keeps a growing Message[] across turns (unlike the
// one-shot runAgent) and injects the camera frame(s) onto each user turn. Reuses
// the exact pieces runAgent composes: buildProxTools, collectTurn, streamProvider.
export class LiveTurnRunner {
  private messages: Message[];

  constructor(
    private product: Product | null,
    private manuals: Manual[],
    private chatId: string | undefined,
    private extraTools: ProxTool[],
  ) {
    this.messages = [{ role: "system", text: buildSystemPrompt(product, manuals) + LIVE_ADDENDUM }];
  }

  /** Seed prior conversation (text only) after the system prompt — used on
   *  reconnect so the agent doesn't forget what was already said in the call. */
  seed(history: Message[]) {
    this.messages.splice(1, this.messages.length - 1, ...history);
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

    // Live wants the SMOOTHEST conversation, not the deepest reasoning — so use
    // the LOWEST reasoning the chosen model supports, whatever model that is (no
    // per-model bias): non-reasoning models get none; reasoning models on the
    // OpenAI Responses API get "minimal"; other reasoning models get the lowest
    // effort. Detection is the standard reasoning-model heuristic.
    const reasons = /(^|[-/])(o\d|gpt-5|gpt-6)|reason|think|deepseek-r|r1|qwq|magistral/i.test(model);
    const reasoning = !reasons ? {}
      : provider.supportsResponses ? { reasoningEffort: "minimal" as const }
        : { effort: "low" as const };

    for (let step = 0; step < MAX_STEPS; step++) {
      if (signal.aborted) return;
      // maxTokens must be high enough that reasoning tokens don't consume the
      // whole budget and leave NO spoken text (that emptied GPT-5 Nano at 1024).
      const turn = await collectTurn(
        streamProvider(provider, apiKey ?? undefined, { model, messages: this.messages, tools: toolDefs, ...reasoning, maxTokens: 4096 }, signal),
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
