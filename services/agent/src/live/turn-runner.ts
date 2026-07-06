import { streamProvider, type Message } from "@takt/harness";
import type { Product, Manual } from "@takt/shared";
import { liveModelVision } from "@takt/shared";
import { buildTaktTools, type TaktTool, type Emit } from "../tools.js";
import { collectTurn } from "../turn.js";
import { buildLivePrompt } from "../prompt.js";
import { resolveLive } from "../providers.js";

const MAX_STEPS = 16;

// Tools that don't belong in a spoken call: ask_user blocks the turn forever on a
// UI that isn't there. emit_ui IS allowed in live — a designed surface can land on
// the stage while Takt talks. Everything else (search, page images, look, fetch)
// stays.
const LIVE_TOOL_DENY = new Set(["ask_user"]);

// A per-call LLM driver that keeps a growing Message[] across turns (unlike the
// one-shot runAgent) and injects the camera frame(s) onto each user turn. Reuses
// the exact pieces runAgent composes: buildTaktTools, collectTurn, streamProvider.
export class LiveTurnRunner {
  private messages: Message[];

  constructor(
    private product: Product | null,
    private manuals: Manual[],
    private chatId: string | undefined,
    private extraTools: TaktTool[],
  ) {
    this.messages = [{ role: "system", text: buildLivePrompt(product, manuals) }];
  }

  /** Seed prior conversation (text only) after the system prompt — used on
   *  reconnect so the agent doesn't forget what was already said in the call. */
  seed(history: Message[]) {
    this.messages.splice(1, this.messages.length - 1, ...history);
  }

  async runTurn(userText: string, frames: { data: string; mime: string }[], emit: Emit, signal: AbortSignal): Promise<void> {
    const { provider, model, apiKey } = resolveLive();
    if (!model) { await emit({ type: "error", message: "No model selected. Open Settings → Models and pick a model." }); return; }
    if (!apiKey && !provider.keyless) { await emit({ type: "error", message: `No API key for ${provider.name}. Add one in Settings → Models.` }); return; }
    // Only attach the camera frame if the live model can actually see (curated
    // table; unknown/custom models default to attaching). A text-only fast model
    // (e.g. Cerebras/DeepSeek) would otherwise error on an image input.
    const canSee = liveModelVision(provider.id, model) ?? true;
    const imgs = canSee && frames.length ? frames : undefined;
    this.messages.push({ role: "user", text: userText, images: imgs });
    // Build tools with THIS turn's emit so their artifact/page_image events are
    // dropped by the same epoch guard when a barge-in interrupts the turn. Drop
    // the tools that can't work in a spoken call.
    const tools = [...buildTaktTools({ product: this.product, manuals: this.manuals, emit, chatId: this.chatId }), ...this.extraTools]
      .filter((t) => !LIVE_TOOL_DENY.has(t.name));
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
