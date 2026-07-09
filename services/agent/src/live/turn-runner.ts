import { streamProvider, isReasoningModel, type Message } from "@takt/harness";
import type { Product, Manual } from "@takt/shared";
import { modelVision } from "@takt/shared";
import { buildTaktTools, type TaktTool, type Emit } from "../tools.js";
import { collectTurn } from "../turn.js";
import { safeParseArgs } from "../turn-loop.js";
import { buildLivePrompt } from "../prompt.js";
import { resolveLive } from "../providers.js";

// Lower than chat's 16 ON PURPOSE. Every tool round before the model speaks is
// dead air in a live call — a spoken turn that needs a look-up wants 1–2 tool
// rounds (search, or a `look`) then talk, not a 16-step research spiral. This
// caps the worst case so the agent never goes silent for many rounds mid-call.
// ponytail: fixed cap; make it provider-aware only if a real call needs more.
const MAX_STEPS = 6;

// Tools that don't belong in a spoken call: ask_user blocks the turn forever on a
// UI that isn't there. build_canvas IS allowed in live — a designed page can land
// on the canvas while Takt talks. Everything else (search, page images, look,
// fetch) stays.
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

  async runTurn(userText: string, frames: { data: string; mime: string }[], emit: Emit, signal: AbortSignal, spawnBuild?: (brief: string, ctx?: { facts?: string; figures?: string[] }) => void): Promise<void> {
    const { provider, model, apiKey } = resolveLive();
    if (!model) { await emit({ type: "error", message: "No model selected. Open Settings → Models and pick a model." }); return; }
    if (!apiKey && !provider.keyless) { await emit({ type: "error", message: `No API key for ${provider.name}. Add one in Settings → Models.` }); return; }
    // Only attach the camera frame if the live model can actually see (curated
    // table; unknown/custom models default to attaching). A text-only fast model
    // would otherwise error on an image input.
    const canSee = modelVision(provider.id, model);
    const imgs = canSee && frames.length ? frames : undefined;
    this.messages.push({ role: "user", text: userText, images: imgs });

    // Ground the live build like chat: accumulate the facts + /assets URLs this
    // turn gathered (search_product, crop_page_image, get_media) and hand them to
    // the canvas worker via spawnBuild, so a spoken "let me draw that" produces
    // the SAME grounded, multimodal canvas as a typed question.
    const retrieved: string[] = [];
    const assets = new Set<string>();
    const wrappedSpawn = spawnBuild
      ? (brief: string) => spawnBuild(brief, { facts: retrieved.join("\n---\n").slice(0, 6000), figures: [...assets].filter((u) => !u.includes("/assets/pages/")) })
      : undefined;

    // Build tools with THIS turn's emit so their source/canvas events are dropped
    // by the same epoch guard when a barge-in interrupts. Drop tools that can't
    // work in a spoken call.
    const tools = [...buildTaktTools({ product: this.product, manuals: this.manuals, emit, chatId: this.chatId, spawnBuild: wrappedSpawn, context: "main" }), ...this.extraTools]
      .filter((t) => !LIVE_TOOL_DENY.has(t.name));
    const toolDefs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

    // Live wants the SMOOTHEST conversation, not the deepest reasoning — so use
    // the LOWEST reasoning the chosen model supports, whatever model that is (no
    // per-model bias): non-reasoning models get none; reasoning models on the
    // OpenAI Responses API get "minimal"; other reasoning models get the lowest
    // effort. Detection is the standard reasoning-model heuristic.
    const reasons = isReasoningModel(model);
    const reasoning = !reasons ? {}
      : provider.protocol === "openai" ? { reasoningEffort: "minimal" as const }
        : { effort: "low" as const };

    // Track the assistant text AS it streams, so a barge-in that aborts mid-
    // sentence doesn't lose what we'd started saying (see the catch below).
    let partial = "";
    const track: Emit = (e) => { if (e.type === "text_delta") partial += e.text; return emit(e); };

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        if (signal.aborted) return;
        partial = "";
        // maxTokens must be high enough that reasoning tokens don't consume the
        // whole budget and leave NO spoken text (that emptied GPT-5 Nano at 1024).
        const turn = await collectTurn(
          streamProvider(provider, apiKey ?? undefined, { model, messages: this.messages, tools: toolDefs, ...reasoning, maxTokens: 4096 }, signal),
          track,
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
          if (!res.isError && res.output) {
            for (const m of res.output.matchAll(/\/assets\/[^\s"'?)]+/g)) assets.add(m[0]);
            retrieved.push(res.output);
          }
          this.messages.push({ role: "tool", callId: tc.id, name: tc.name, result: res.output, images: res.images, isError: res.isError });
        }
      }
    } catch (e: any) {
      if (signal.aborted) {
        // Barge-in aborted us mid-sentence: keep what we'd started saying so the
        // user's interruption (and any new info in it) lands with continuity, and
        // history stays user → assistant → user, not two user turns back to back.
        if (partial.trim()) this.messages.push({ role: "assistant", text: partial.trim() });
        return;
      }
      // A REAL turn error (quota, rejected key, network, bad model). SURFACE it —
      // otherwise a live call just goes silent and looks "stuck listening" with no
      // reason (chat already does this; live used to only console.error it).
      const raw = String(e?.message ?? e);
      const msg = /quota|insufficient|billing/i.test(raw)
        ? `${provider.name}: API quota exhausted — add billing, or pick a different live model in Settings → Models.`
        : /invalid api key|authentication|401|403|unauthor|x-api-key|forbidden/i.test(raw)
          ? `${provider.name} rejected the API key — update it in Settings → Models.`
          : `Live model error: ${raw}`;
      await emit({ type: "error", message: msg });
    }
  }
}
