import { streamProvider, isReasoningModel, type Message, type Effort } from "@takt/harness";
import type { Product, Manual } from "@takt/shared";
import { modelVision } from "@takt/shared";
import { searchChunks, searchEntities } from "@takt/profile";
import { buildTaktTools, type TaktTool, type Emit } from "../tools.js";
import { collectTurn } from "../turn.js";
import { safeParseArgs } from "../turn-loop.js";
import { buildLivePrompt } from "../prompt.js";
import { resolveLive } from "../providers.js";

// Lower than chat's step cap ON PURPOSE. Every tool round before the model
// speaks is dead air in a live call — a spoken turn that needs a look-up wants
// 1–2 tool rounds (search, a `look`, a show_overlay) then talk, not a research
// spiral. This caps the worst case so the agent never goes silent for long.
// ponytail: fixed cap; make it provider-aware only if a real call needs more.
const MAX_STEPS = 6;

// Tools that don't belong in a spoken call: ask_user blocks the turn forever on
// a UI that isn't there; the canvas tools reference a document surface live mode
// doesn't show (overlays replace it — see show_overlay in session.ts).
const LIVE_TOOL_DENY = new Set(["ask_user", "read_canvas", "select_canvas"]);

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

  /** Prime the provider's prompt cache (system + tools) with a tiny request the
   *  moment the session opens, so the FIRST real spoken turn is a cache HIT
   *  instead of a cold prefill (the biggest first-token latency lever). Best
   *  effort: if it fails the first turn just pays the normal cold price. */
  async warm(signal: AbortSignal): Promise<void> {
    let resolved;
    try { resolved = resolveLive(); } catch { return; }
    const { provider, model, apiKey } = resolved;
    if (!model || (!apiKey && !provider.keyless)) return;
    const tools = this.buildTools(async () => {});
    const toolDefs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
    try {
      // maxTokens:1 — we only want the prefill (cache write); the output is discarded.
      const gen = streamProvider(provider, apiKey ?? undefined, { model, messages: this.messages, tools: toolDefs, maxTokens: 1 }, signal);
      for await (const ev of gen) { void ev; if (signal.aborted) break; }
    } catch { /* cold first turn is the fallback */ }
  }

  private buildTools(emit: Emit): TaktTool[] {
    return [...buildTaktTools({ product: this.product, manuals: this.manuals, emit, chatId: this.chatId, context: "main" }), ...this.extraTools]
      .filter((t) => !LIVE_TOOL_DENY.has(t.name));
  }

  // Bound the per-call history so a long conversation doesn't grow `messages`
  // unboundedly. Cut only at a USER boundary so an assistant tool_use is never
  // separated from its tool_result (providers 400 on an orphaned pair).
  private capHistory() {
    const CAP = 40, KEEP = 30;
    if (this.messages.length <= CAP) return;
    let cut = this.messages.length - KEEP;
    while (cut < this.messages.length && this.messages[cut]!.role !== "user") cut++;
    if (cut > 1 && cut < this.messages.length) this.messages.splice(1, cut - 1);
  }

  async runTurn(userText: string, frames: { data: string; mime: string }[], emit: Emit, signal: AbortSignal): Promise<void> {
    const { provider, model, apiKey, effort } = resolveLive();
    if (!model) { await emit({ type: "error", message: "No model selected. Open Settings → Models and pick a model." }); return; }
    if (!apiKey && !provider.keyless) { await emit({ type: "error", message: `No API key for ${provider.name}. Add one in Settings → Models.` }); return; }
    // Only attach the camera frame if the live model can actually see (curated
    // table; unknown/custom models default to attaching). A text-only fast model
    // would otherwise error on an image input.
    const canSee = modelVision(provider.id, model);
    const imgs = canSee && frames.length ? frames : undefined;
    // Ground EVERY product-scoped turn server-side: retrieve the top manual
    // passages for what they said and put them IN the turn, so the exact value
    // (215 °C, not "usually ~200") is in context even when a latency-tuned model
    // skips the search tool — fast models fabricate plausible cites otherwise.
    // A few ms of local SQLite; tools remain for anything deeper.
    let text = userText;
    // Skip injection on conversational turns ("thanks, sounds good") — matched
    // facts there are noise a latency-tuned model happily recites as an answer.
    // A turn earns injection only if it has a substantive word left after
    // stripping smalltalk; word count alone let "thanks sounds good" through.
    const SMALLTALK = new Set(["thanks", "thank", "you", "sounds", "good", "great", "cool", "nice", "okay", "yes", "yeah", "yep", "sure", "bye", "hello", "hey", "please", "that", "this", "the", "and", "for", "got", "it's", "was", "perfect", "awesome", "alright", "right"]);
    const substantive = (userText.toLowerCase().match(/[a-z0-9°-]+/g) ?? []).filter((w) => w.length >= 3 && !SMALLTALK.has(w));
    if (this.product && substantive.length) {
      try {
        // Entities FIRST: the vision pass read exact values (215 °C) off pages
        // whose text defers to an online table — the graph is the authority.
        const [ents, hits] = await Promise.all([
          searchEntities(this.product.id, userText, 4),
          searchChunks(this.product.id, userText, 3),
        ]);
        const entLines = ents
          .filter((e) => (e.attrs as Record<string, unknown> | null)?.value != null || e.summary)
          .map((e) => {
            const a = e.attrs as Record<string, unknown> | null;
            const val = a?.value != null ? ` = ${a.value}${a.unit ? ` ${a.unit}` : ""}` : "";
            return `- [${e.type}] ${e.name}${val}${e.page ? ` (p.${e.page})` : ""}${e.summary ? ` — ${e.summary.replace(/\s+/g, " ").slice(0, 90)}` : ""}`;
          });
        const chunkLines = hits.map((c) => `[p.${c.page ?? "?"}] ${c.text.replace(/\s+/g, " ").slice(0, 400)}`);
        if (entLines.length || chunkLines.length) {
          text = `${userText}\n\n[Manual facts matched to this question — answer with these EXACT values and cite the page; if they don't cover it, search_product / find_entity for more:\n${[...entLines, ...chunkLines].join("\n")}]`;
        }
      } catch { /* retrieval is an enhancement — never blocks the turn */ }
    }
    this.messages.push({ role: "user", text, images: imgs });
    // Keep camera frames only on the 2 most recent user turns — the model "sees
    // live" from the current view, and a long call doesn't balloon with every past
    // frame (cost + latency). Older turns keep their text.
    const withImgs = this.messages.filter((m) => m.role === "user" && m.images?.length);
    for (const m of withImgs.slice(0, -2)) if (m.role === "user") m.images = undefined;

    // Build tools with THIS turn's emit so their events are dropped by the same
    // epoch guard when a barge-in interrupts.
    const tools = this.buildTools(emit);
    const toolDefs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

    // Live wants the SMOOTHEST conversation, not the deepest reasoning — the
    // LOWEST reasoning the chosen model supports, unless the user raised
    // `liveEffort` in Settings: non-reasoning models get none; reasoning models
    // on the OpenAI Responses API get "minimal"; others get the lowest effort.
    const reasons = isReasoningModel(model);
    const reasoning = !reasons ? {}
      : effort ? (provider.protocol === "openai" ? { reasoningEffort: effort as string } : { effort: effort as Effort })
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
        // Run this step's tool calls CONCURRENTLY — serialized look-ups are extra
        // dead air in a call. Results are pushed in the original call order
        // (providers pair each result to its call by id).
        const runOne = async (tc: (typeof turn.toolCalls)[number]) => {
          const tool = tools.find((t) => t.name === tc.name);
          if (!tool) return { tc, res: { output: `Unknown tool "${tc.name}".`, isError: true as const } };
          try { return { tc, res: await tool.execute(safeParseArgs(tc.arguments)) }; }
          catch (e: any) { return { tc, res: { output: `Error: ${String(e?.message ?? e)}`, isError: true as const } }; }
        };
        const results = await Promise.all(turn.toolCalls.map(runOne));
        if (signal.aborted) return;
        for (const { tc, res } of results) {
          this.messages.push({ role: "tool", callId: tc.id, name: tc.name, result: res.output, images: res.images, isError: res.isError });
        }
      }
    } catch (e: any) {
      if (signal.aborted) {
        // Barge-in aborted us mid-sentence: keep what we'd started saying so the
        // user's interruption lands with continuity, and history stays
        // user → assistant → user, not two user turns back to back.
        if (partial.trim()) this.messages.push({ role: "assistant", text: partial.trim() });
        return;
      }
      // A REAL turn error (quota, rejected key, network, bad model). SURFACE it —
      // otherwise a live call just goes silent and looks "stuck listening".
      const raw = String(e?.message ?? e);
      const msg = /quota|insufficient|billing/i.test(raw)
        ? `${provider.name}: API quota exhausted — add billing, or pick a different live model in Settings → Models.`
        : /invalid api key|authentication|401|403|unauthor|x-api-key|forbidden/i.test(raw)
          ? `${provider.name} rejected the API key — update it in Settings → Models.`
          : `Live model error: ${raw}`;
      await emit({ type: "error", message: msg });
    }
    this.capHistory();
  }
}
