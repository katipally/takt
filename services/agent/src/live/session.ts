import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { Product, Manual, SseEvent, MessageBlock, LiveServerMsg } from "@takt/shared";
import { LIVE_TAG, liveClientMsgSchema } from "@takt/shared";
import { createChat, addMessage, listMessages, renameChat } from "@takt/db";
import type { Message } from "@takt/harness";
import type { Emit, TaktTool } from "../tools.js";
import { foldBlock } from "../block-emit.js";
import { LiveTurnRunner } from "./turn-runner.js";

type Frame = { data: string; mime: string };
const HISTORY_TURNS = 20; // recent messages to rehydrate on reconnect

// Some providers (e.g. MiniMax) leak control-token fragments like "[e[" into the
// text stream. Spoken replies never contain square brackets, so scrub them from
// saved text blocks — the live client strips the same noise for display/TTS.
function scrubControlTokens(blocks: MessageBlock[]): void {
  for (const b of blocks) {
    if (b.type === "text") b.text = b.text.replace(/[[\]][a-z0-9~!]{0,3}[[\]]/gi, " ").replace(/[[\]]/g, "").replace(/[ \t]{2,}/g, " ");
  }
}

// Replace the assistant's spoken text in `blocks` with exactly what the client
// says was voiced on a barge-in. Live replies are already plain text (LIVE_RULES),
// so this is a clean swap; other blocks are left untouched.
function truncateSpokenText(blocks: MessageBlock[], spoken: string): void {
  const s = spoken.trim();
  let placed = false;
  for (const b of blocks) {
    if (b.type !== "text") continue;
    if (!placed) { b.text = s; placed = true; } else b.text = "";
  }
  if (!placed && s) blocks.unshift({ type: "text", text: s });
}

// One live call — THIN. The browser runs the whole voice stack (VAD, STT, turn
// detection, TTS) on-device; this server only receives the final user text +
// the freshest camera frame, runs the LLM turn, streams reply text back, and
// PERSISTS the conversation (so a spoken call is saved just like a typed one).
export class LiveSession {
  private runner: LiveTurnRunner;
  private warmAc: AbortController | null = null; // aborts the cache-warm on teardown
  private ac: AbortController | null = null;
  private turnActive = false;
  private queuedText: string | null = null; // an utterance that arrived mid-turn (barge-in)
  private bargeSpoken: string | null = null; // on barge-in, the text the client actually SPOKE
  private cameraOn = false;
  private titled = false; // rename a fresh chat from the first user turn
  private closed = false;
  // The in-flight turn's emit — show_overlay (built once, below) must send
  // through the CURRENT turn's gated emit so a barge-in drops late overlays.
  private currentEmit: Emit | null = null;

  // `look` tool ↔ client hi-res frame handshake.
  private lookPending: { reqId: string; resolve: (f: Frame | null) => void } | null = null;
  private awaitingLookFrame = false;

  constructor(private ws: WebSocket, private product: Product | null, private manuals: Manual[], private chatId: string) {
    const lookTool: TaktTool = {
      name: "look",
      description: "Capture a fresh, higher-resolution frame from the user's camera and see it right now. Use when you need a closer or more current look at what the user is showing you. If the camera is off this returns nothing — then ask the user to turn it on.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        if (!this.cameraOn) return { output: "The camera is off, so I can't see anything right now. Ask the user to turn on their camera." };
        const frame = await this.requestFrame();
        if (!frame) return { output: "Couldn't grab a camera frame (it timed out). Ask the user to check their camera." };
        return { output: "This is what the user's camera is showing right now — talk about it naturally, as what you're both looking at.", images: [frame] };
      },
    };
    // The live "remote expert" surface: pin ONE visual over the user's live view
    // while talking — a rotatable 3D part, a manual figure, a repair clip, or a
    // pointer note anchored on their camera view. Ephemeral: rendered live, never
    // persisted; a new overlay replaces the last; "clear" takes it down.
    const showOverlay: TaktTool = {
      name: "show_overlay",
      description: "Pin a visual over the user's live view while you talk: kind \"model\" (rotatable 3D part), \"figure\" (manual figure/photo), \"video\" (repair clip), or \"note\" (a short label pinned on their camera view — pass anchor {x,y} in 0–1 camera coords to point at something they're showing). Pass the EXACT /assets url that get_media returned (never invent one); note needs only caption. One overlay at a time — a new call replaces the last; kind \"clear\" removes it. ALWAYS say a spoken line before calling this.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["model", "figure", "video", "note", "clear"] },
          url: { type: "string", description: "The exact /assets URL from get_media (model/figure/video kinds)" },
          caption: { type: "string", description: "One short line: what they're looking at / the note text" },
          anchor: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, description: "note only: where to pin on the camera view, 0–1 from top-left" },
        },
        required: ["kind"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const kind = String(args?.kind ?? "");
        if (!["model", "figure", "video", "note", "clear"].includes(kind)) return { output: "kind must be model | figure | video | note | clear.", isError: true };
        const emit = this.currentEmit;
        if (!emit) return { output: "No active turn.", isError: true };
        const overlayId = randomUUID().slice(0, 8);
        if (kind === "clear") { await emit({ type: "live_overlay", overlayId, kind: "clear" }); return { output: "Overlay cleared." }; }
        if (kind === "note") {
          const caption = String(args?.caption ?? "").trim();
          if (!caption) return { output: "A note needs a caption.", isError: true };
          const a = args?.anchor;
          const anchor = a && typeof a.x === "number" && typeof a.y === "number"
            ? { x: Math.min(1, Math.max(0, a.x)), y: Math.min(1, Math.max(0, a.y)) } : undefined;
          await emit({ type: "live_overlay", overlayId, kind: "note", caption, anchor });
          return { output: "Note pinned on their view. Keep talking them through it." };
        }
        // model / figure / video need a real ingested asset — same discipline as
        // the canvas: only /assets URLs, never an invented or external one.
        const url = String(args?.url ?? "").trim();
        if (!/^(https?:\/\/[^/]+)?\/assets\//.test(url)) return { output: "Pass the exact /assets URL that get_media returned — call get_media first.", isError: true };
        const caption = args?.caption ? String(args.caption).slice(0, 120) : undefined;
        await emit({ type: "live_overlay", overlayId, kind: kind as "model" | "figure" | "video", url, caption });
        return { output: `Overlay is up (${kind}). Talk through what they're seeing; show_overlay kind "clear" when done.` };
      },
    };
    this.runner = new LiveTurnRunner(product, manuals, chatId || undefined, [lookTool, showOverlay]);

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) this.onBinary(data);
      else this.onText(data.toString()).catch((e) => console.error("[live] text:", e));
    });
    ws.on("close", () => this.dispose());
    ws.on("error", () => this.dispose());
  }

  async start() {
    // Persist the chat row + rehydrate recent history (so a reconnect mid-call
    // doesn't make the agent forget what was already said).
    if (this.chatId) {
      createChat(this.product?.id ?? null, this.chatId);
      const prior = this.rehydrate();
      if (prior.length) { this.runner.seed(prior); this.titled = true; }
    }
    // Warm the provider's prompt cache in the background so the first spoken
    // turn answers fast. Always signal ready — even on failure — so the client's
    // "Warming up…" indicator never sticks.
    this.warmAc = new AbortController();
    void this.runner.warm(this.warmAc.signal)
      .catch(() => {})
      .finally(() => { if (!this.closed) this.send({ t: "sse", event: { type: "status", text: "ready" } }); });
  }

  /** Stored messages → harness messages (text only — enough for continuity). */
  private rehydrate(): Message[] {
    let rows;
    try { rows = listMessages(this.chatId); } catch { return []; }
    const recent = rows.slice(-HISTORY_TURNS);
    const out: Message[] = [];
    for (const m of recent) {
      if (m.role !== "user" && m.role !== "assistant") continue;
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as any).text).join("").trim();
      if (text) out.push({ role: m.role, text });
    }
    return out;
  }

  // ── inbound ───────────────────────────────────────────────────────────────
  private onBinary(buf: Buffer) {
    // Binary only carries the `look` hi-res JPEG (per-turn frames come inline
    // on user_text, atomically with the transcript).
    if (buf[0] !== LIVE_TAG.FRAME_IN) return;
    if (this.awaitingLookFrame && this.lookPending) {
      const p = this.lookPending;
      this.lookPending = null; this.awaitingLookFrame = false;
      p.resolve({ data: Buffer.from(buf.subarray(1)).toString("base64"), mime: "image/jpeg" });
    }
  }

  private async onText(str: string) {
    let msg;
    try { msg = liveClientMsgSchema.parse(JSON.parse(str)); } catch { return; }
    switch (msg.t) {
      case "user_text": return void this.runTurn(msg.text, msg.frames ?? []);
      case "cancel": if (this.turnActive) this.bargeSpoken = msg.spoken ?? null; return this.interrupt();
      case "control":
        if (msg.action === "camera_on") this.cameraOn = true;
        else if (msg.action === "camera_off") this.cameraOn = false;
        else if (msg.action === "end") this.dispose();
        return;
      case "frame_response":
        if (this.lookPending?.reqId === msg.reqId) this.awaitingLookFrame = true;
        return;
    }
  }

  // ── turn ────────────────────────────────────────────────────────────────
  private async runTurn(text: string, frames: Frame[] = []) {
    if (!text.trim() || this.closed) return;
    // A new utterance during an in-flight turn (classic barge-in: cancel then
    // immediately speak) must NOT be dropped. Queue it — APPEND, so two quick
    // utterances both survive — and the finally below drains them as one turn.
    if (this.turnActive) { this.queuedText = this.queuedText ? `${this.queuedText} ${text}` : text; return; }
    this.turnActive = true;
    const ac = new AbortController();
    this.ac = ac;

    // Accumulate the assistant turn as an ordered block list (mirrors the HTTP
    // /chat handler) so reasoning, tools, and text replay in order on reload.
    const blocks: MessageBlock[] = [];
    const emit = this.blockEmit(blocks, ac.signal);
    this.currentEmit = emit;

    if (this.chatId) {
      addMessage(this.chatId, "user", [{ type: "text", text }], true /* live */);
      // Auto-title a fresh conversation from the first thing the user says.
      if (!this.titled) { this.titled = true; try { renameChat(this.chatId, text.replace(/\s+/g, " ").trim().slice(0, 48) || "Live conversation"); } catch { /* */ } }
    }
    try {
      await this.runner.runTurn(text, frames, emit, ac.signal);
    } catch (e) {
      if (!ac.signal.aborted) console.error("[live] turn:", e);
    } finally {
      // On barge-in, persist only what was actually SPOKEN — the generated text
      // ran ahead of the on-device TTS, so the unspoken tail must NOT be saved.
      if (ac.signal.aborted && this.bargeSpoken != null) truncateSpokenText(blocks, this.bargeSpoken);
      this.bargeSpoken = null;
      scrubControlTokens(blocks);
      // Persist the assistant reply even on barge-in/abort, so reload shows it.
      if (this.chatId && blocks.length) { try { addMessage(this.chatId, "assistant", blocks, true /* live */); } catch { /* */ } }
      this.send({ t: "sse", event: { type: "done" } });
      if (this.currentEmit === emit) this.currentEmit = null;
      if (this.ac === ac) { this.ac = null; this.turnActive = false; }
      const q = this.queuedText; this.queuedText = null;
      if (q && !this.closed) void this.runTurn(q); // drain a barge-in utterance
    }
  }

  /** An Emit that both forwards SSE to the client and records ordered blocks.
   *  The signal gate drops late events after a barge-in aborts the spoken turn. */
  private blockEmit(blocks: MessageBlock[], signal: AbortSignal): Emit {
    return async (e: SseEvent) => {
      if (signal.aborted || this.closed) return; // barge-in → drop late events
      foldBlock(blocks, e);
      this.send({ t: "sse", event: e });
    };
  }

  private interrupt() { this.ac?.abort(); }

  // ── `look` handshake ────────────────────────────────────────────────────
  private requestFrame(): Promise<Frame | null> {
    return new Promise((resolve) => {
      const reqId = randomUUID();
      const timer = setTimeout(() => {
        if (this.lookPending?.reqId === reqId) { this.lookPending = null; this.awaitingLookFrame = false; resolve(null); }
      }, 4000);
      this.lookPending = { reqId, resolve: (f) => { clearTimeout(timer); resolve(f); } };
      this.awaitingLookFrame = false;
      this.send({ t: "need_frame", reqId });
    });
  }

  // ── send / teardown ───────────────────────────────────────────────────────
  private send(m: LiveServerMsg) {
    if (this.closed || this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(m));
  }

  private dispose() {
    if (this.closed) return;
    this.closed = true;
    this.warmAc?.abort();
    this.ac?.abort();
    this.lookPending?.resolve(null);
    try { this.ws.close(); } catch { /* already closing */ }
  }
}
