import { streamProvider, isReasoningModel, modelVisionMeta, type Message } from "@takt/harness";
import type { Product, Manual } from "@takt/shared";
import { modelVision } from "@takt/shared";
import { searchChunks, searchEntities } from "@takt/profile";
import { buildTaktTools, type TaktTool, type Emit } from "../tools.js";
import { collectTurn } from "../turn.js";
import { safeParseArgs } from "../turn-loop.js";
import { buildLivePrompt } from "../prompt.js";
import { resolveLive } from "../providers.js";
import { makeThinkFilter, stripThink } from "./think-filter.js";

// Lower than chat's step cap ON PURPOSE. Every tool round before the model
// speaks is dead air in a live call — a spoken turn that needs a look-up wants
// 1–2 tool rounds (search, a `look`, a show_overlay) then talk, not a research
// spiral. This caps the worst case so the agent never goes silent for long.
// ponytail: fixed cap; make it provider-aware only if a real call needs more.
const MAX_STEPS = 6;

// Tools that don't belong in a spoken call: ask_user blocks the turn forever on
// a UI that isn't there; select_canvas drives a pointer interaction voice can't.
// build_canvas IS allowed — a designed page can land on the stage while Takt
// talks (fire-and-forget; see spawnBuild) — and read_canvas lets it discuss it.
const LIVE_TOOL_DENY = new Set(["ask_user", "select_canvas", "edit_canvas"]);

/** Session-provided background canvas build (never blocks the spoken turn). */
export type SpawnBuild = (brief: string, ctx?: { facts?: string; figures?: string[] }) => void;

// The literal camera state for THIS turn, so the model states it correctly
// instead of inferring it from whether an image happened to attach. `canSee` =
// the model can process images at all; `cameraOn` = the user's camera is on;
// `hasFrame` = a frame is attached to this turn.
function cameraStatusNote(canSee: boolean, cameraOn: boolean, hasFrame: boolean): string {
  if (!canSee) return "[Camera: the current live model can't view images, so you cannot see the user's camera. Never say you can see it — if they want you to look at something, tell them to switch to a vision-capable model in settings.]";
  if (!cameraOn) return "[Camera: OFF right now — you cannot see the user. Don't claim to. If you need to look at something, ask them to turn their camera on. marks/notes/look won't work until it's on.]";
  if (hasFrame) return "[Camera: ON — the image attached to this turn is the user's live view this moment. React to what's actually there; call look for a sharper/closer frame.]";
  return "[Camera: ON, but no fresh frame arrived this turn — call look to grab the current view before you describe or mark anything.]";
}

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

  private buildTools(emit: Emit, compose?: (brief: string) => Promise<boolean>): TaktTool[] {
    return [...buildTaktTools({ product: this.product, manuals: this.manuals, emit, chatId: this.chatId, context: "main", compose }), ...this.extraTools]
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

  async runTurn(userText: string, frames: { data: string; mime: string }[], cameraOn: boolean, emit: Emit, signal: AbortSignal, spawnBuild?: SpawnBuild): Promise<void> {
    const { provider, model, apiKey } = resolveLive();
    if (!model) { await emit({ type: "error", message: "No model selected. Open Settings → Models and pick a model." }); return; }
    if (!apiKey && !provider.keyless) { await emit({ type: "error", message: `No API key for ${provider.name}. Add one in Settings → Models.` }); return; }
    // Can this model see images? models.dev metadata is the source of truth
    // (MiniMax-M3 is text/image/video; the M2.x line is text-only) — fall back to
    // the offline heuristic only when the model isn't in the catalog. Attaching an
    // image to a text-only model would 400.
    const canSee = (await modelVisionMeta(provider.catalogId, model)) ?? modelVision(provider.id, model);
    const imgs = canSee && frames.length ? frames : undefined;
    // Ground EVERY product-scoped turn server-side: retrieve the top manual
    // passages for what they said and put them IN the turn, so the exact value
    // (215 °C, not "usually ~200") is in context even when a latency-tuned model
    // skips the search tool — fast models fabricate plausible cites otherwise.
    // A few ms of local SQLite; tools remain for anything deeper.
    // Per-turn context appended to the user's words (annotations the model reads
    // but that never persist to the visible transcript — the session saves the
    // raw text). Order: manual facts, then camera status.
    const notes: string[] = [];
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
          notes.push(`[Manual facts matched to this question — answer with these EXACT values and cite the page; if they don't cover it, search_product / find_entity for more:\n${[...entLines, ...chunkLines].join("\n")}]`);
        }
      } catch { /* retrieval is an enhancement — never blocks the turn */ }
    }
    // Tell the model the REAL camera state every turn, so it never guesses (the
    // guessing is what flip-flops between "I can see you" and "camera's off").
    notes.push(cameraStatusNote(canSee, cameraOn, !!imgs?.length));
    const text = notes.length ? `${userText}\n\n${notes.join("\n\n")}` : userText;
    this.messages.push({ role: "user", text, images: imgs });
    // Keep camera frames only on the 2 most recent user turns — the model "sees
    // live" from the current view, and a long call doesn't balloon with every past
    // frame (cost + latency). Older turns keep their text.
    const withImgs = this.messages.filter((m) => m.role === "user" && m.images?.length);
    for (const m of withImgs.slice(0, -2)) if (m.role === "user") m.images = undefined;

    // Ground the live build like chat: accumulate the facts + /assets URLs this
    // turn gathered (search_product, get_media, explore_entity…) and hand them
    // to the canvas worker via spawnBuild, so a spoken "walk me through it"
    // produces the SAME grounded, multimodal page as a typed question. The
    // build is fire-and-forget — compose returns immediately so the voice
    // never goes silent while the page paints in the background.
    const retrieved: string[] = [];
    const assets = new Set<string>();
    const compose = spawnBuild
      ? async (brief: string) => { spawnBuild(brief, { facts: retrieved.join("\n---\n").slice(0, 8000), figures: [...assets].filter((u) => !u.includes("/assets/pages/")) }); return true; }
      : undefined;

    // Build tools with THIS turn's emit so their events are dropped by the same
    // epoch guard when a barge-in interrupts.
    const tools = this.buildTools(emit, compose);
    const toolDefs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

    // Live wants INSTANT answers — thinking is OFF, full stop. Passing no
    // effort keeps Anthropic's thinking block omitted AND keeps MiniMax-M3's
    // reasoning disabled (the compat endpoint only turns it on when an effort
    // is sent — sending one is what leaked <think> into the spoken stream).
    // OpenAI reasoning models can't fully disable it, so ask for "minimal".
    const reasoning = isReasoningModel(model) && provider.protocol === "openai"
      ? { reasoningEffort: "minimal" as const } : {};

    // Track the assistant text AS it streams, so a barge-in that aborts mid-
    // sentence doesn't lose what we'd started saying (see the catch below).
    // Two live-only gates ride the same wrapper:
    //  • text deltas pass through the <think> scrubber (MiniMax M2.x reasons
    //    inline in the text channel, always-on) — never voice a thought;
    //  • reasoning deltas are dropped entirely — a spoken call narrates its
    //    WORK via tool cues, not a reasoning transcript.
    let partial = "";
    let thinkFilter = makeThinkFilter();
    const track: Emit = (e) => {
      if (e.type === "reasoning_delta") return;
      if (e.type === "text_delta") {
        const clean = thinkFilter(e.text);
        if (!clean) return;
        partial += clean;
        return emit({ type: "text_delta", text: clean });
      }
      return emit(e);
    };

    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        if (signal.aborted) return;
        partial = "";
        thinkFilter = makeThinkFilter(); // each step is a fresh provider stream
        // maxTokens must be high enough that reasoning tokens don't consume the
        // whole budget and leave NO spoken text (that emptied GPT-5 Nano at 1024).
        const turn = await collectTurn(
          streamProvider(provider, apiKey ?? undefined, { model, messages: this.messages, tools: toolDefs, ...reasoning, maxTokens: 4096 }, signal),
          track,
        );
        this.messages.push({
          role: "assistant",
          text: stripThink(turn.text), // inline <think> never enters history either
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
