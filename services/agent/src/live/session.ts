import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { WebSocket } from "ws";
import type { Product, Manual, SseEvent, MessageBlock, LiveServerMsg } from "@takt/shared";
import { LIVE_TAG, liveClientMsgSchema } from "@takt/shared";
import { createChat, addMessage, listMessages, renameChat, updateMessage, DATA_DIR } from "@takt/db";
import type { Message } from "@takt/harness";
import type { Emit, TaktTool } from "../tools.js";
import { foldBlock } from "../block-emit.js";
import { runCanvasWorker } from "../canvas-worker.js";
import { pickHero } from "../agent.js";
import { LiveTurnRunner, type SpawnBuild } from "./turn-runner.js";

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
    // while talking — a rotatable 3D part, a manual figure, a repair clip, a
    // pointer note, or AR-style marks DRAWN ON the camera feed (arrows, rings,
    // boxes, paths, labels). Ephemeral: rendered live, never persisted; a new
    // overlay replaces the last; "clear" takes it down.
    const clamp01 = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined);
    const pt = (p: any): { x: number; y: number } | undefined => {
      const x = clamp01(p?.x), y = clamp01(p?.y);
      return x !== undefined && y !== undefined ? { x, y } : undefined;
    };
    const showOverlay: TaktTool = {
      name: "show_overlay",
      description: "Pin a visual over the user's live view while you talk. kind \"model\" (rotatable 3D part) / \"figure\" (manual figure/photo) / \"video\" (repair clip) take the EXACT /assets url get_media returned (never invent one); add anchor {x,y} to pin a model/figure INSIDE their camera feed at that spot. kind \"note\" = a short label pinned at anchor. kind \"marks\" = DRAW on their camera feed: an array of {shape} objects — {shape:\"arrow\", from, to} points AT something (tip at `to`); {shape:\"ring\", at, r} circles it; {shape:\"box\", at, w, h} frames a region; {shape:\"path\", points:[…]} freehand; {shape:\"label\", at, text} a small tag. All coords normalized 0–1 from the top-left of the camera frame you SEE — aim using the latest frame. One overlay at a time — a new call replaces the last; kind \"clear\" removes it. ALWAYS say a spoken line before calling this.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["model", "figure", "video", "note", "marks", "clear"] },
          url: { type: "string", description: "The exact /assets URL from get_media (model/figure/video kinds)" },
          caption: { type: "string", description: "One short line: what they're looking at / the note text" },
          anchor: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, description: "Where on the camera view, 0–1 from top-left (note; optional for model/figure to pin in-feed)" },
          marks: {
            type: "array",
            description: "marks kind only: the shapes to draw on the camera feed (they show together)",
            items: {
              type: "object",
              properties: {
                shape: { type: "string", enum: ["arrow", "ring", "box", "label", "path"] },
                at: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, description: "center (ring/box/label)" },
                from: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, description: "arrow tail" },
                to: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, description: "arrow tip — the thing being pointed at" },
                r: { type: "number", description: "ring radius as a fraction of the view (e.g. 0.08)" },
                w: { type: "number", description: "box width fraction" },
                h: { type: "number", description: "box height fraction" },
                points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } }, description: "path points in order" },
                text: { type: "string", description: "label text (label shape; optional tag on others)" },
              },
              required: ["shape"],
            },
          },
        },
        required: ["kind"],
        additionalProperties: false,
      },
      execute: async (args) => {
        const kind = String(args?.kind ?? "");
        if (!["model", "figure", "video", "note", "marks", "clear"].includes(kind)) return { output: "kind must be model | figure | video | note | marks | clear.", isError: true };
        const emit = this.currentEmit;
        if (!emit) return { output: "No active turn.", isError: true };
        const overlayId = randomUUID().slice(0, 8);
        if (kind === "clear") { await emit({ type: "live_overlay", overlayId, kind: "clear" }); return { output: "Overlay cleared." }; }
        const anchor = pt(args?.anchor);
        const caption = args?.caption ? String(args.caption).slice(0, 120) : undefined;
        // note + marks draw ON the camera feed — meaningless without one.
        if ((kind === "note" || kind === "marks") && !this.cameraOn) {
          return { output: "Their camera is off — marks/notes pin on the live view. Ask them to turn the camera on, or show a figure/model instead.", isError: true };
        }
        if (kind === "note") {
          if (!caption) return { output: "A note needs a caption.", isError: true };
          await emit({ type: "live_overlay", overlayId, kind: "note", caption, anchor });
          return { output: "Note pinned on their view. Keep talking them through it." };
        }
        if (kind === "marks") {
          const raw = Array.isArray(args?.marks) ? args.marks : [];
          const marks = raw.slice(0, 8).flatMap((m: any) => {
            const shape = String(m?.shape ?? "");
            if (!["arrow", "ring", "box", "label", "path"].includes(shape)) return [];
            const mark: Record<string, unknown> = { shape };
            const at = pt(m?.at), from = pt(m?.from), to = pt(m?.to);
            if (at) mark.at = at;
            if (from) mark.from = from;
            if (to) mark.to = to;
            const r = clamp01(m?.r), w = clamp01(m?.w), h = clamp01(m?.h);
            if (r !== undefined) mark.r = r;
            if (w !== undefined) mark.w = w;
            if (h !== undefined) mark.h = h;
            if (Array.isArray(m?.points)) {
              const ps = m.points.map(pt).filter(Boolean);
              if (ps.length >= 2) mark.points = ps;
            }
            if (m?.text) mark.text = String(m.text).slice(0, 60);
            // each shape needs its geometry
            if (shape === "arrow" && !(mark.from && mark.to)) return [];
            if ((shape === "ring" || shape === "box" || shape === "label") && !mark.at) return [];
            if (shape === "path" && !mark.points) return [];
            return [mark];
          });
          if (!marks.length) return { output: "No valid marks — each needs its geometry (arrow: from+to; ring/box/label: at; path: points).", isError: true };
          await emit({ type: "live_overlay", overlayId, kind: "marks", caption, marks: marks as any });
          return { output: `${marks.length} mark(s) drawn on their view. Talk them through what you're pointing at; show_overlay "clear" when done.` };
        }
        // model / figure / video need a real ingested asset — same discipline as
        // the canvas: only /assets URLs, never an invented or external one.
        const url = String(args?.url ?? "").trim();
        if (!/^(https?:\/\/[^/]+)?\/assets\//.test(url)) return { output: "Pass the exact /assets URL that get_media returned — call get_media first.", isError: true };
        const inFeed = anchor && kind !== "video" && this.cameraOn ? anchor : undefined;
        await emit({ type: "live_overlay", overlayId, kind: kind as "model" | "figure" | "video", url, caption, anchor: inFeed });
        return { output: `Overlay is up (${kind}${inFeed ? ", pinned on their camera view" : ""}). Talk through what they're seeing; show_overlay kind "clear" when done.` };
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
    // A canvas the model spawns mid-call runs on a SESSION-stable emit — its
    // own never-aborting signal, so a barge-in that kills the SPOKEN turn never
    // kills the page landing on the stage. The runner threads in the facts +
    // /assets it gathered this turn so the page is grounded like chat's; when
    // the camera is on, the freshest frame rides along so the worker can build
    // the answer AROUND what the user is showing. A build that finishes after
    // the row was persisted re-saves it (blocks were serialized without it).
    let messageId: string | null = null;
    const spawnBuild: SpawnBuild = (brief, ctx) => {
      const frame = frames.length ? this.persistFrame(frames[frames.length - 1]!) : undefined;
      void runCanvasWorker({
        mode: "build", canvasId: randomUUID().slice(0, 8), brief, question: text,
        facts: ctx?.facts, figures: ctx?.figures, hero: pickHero(ctx?.figures ?? []),
        product: this.product, frame,
        emit: this.blockEmit(blocks, new AbortController().signal), signal: new AbortController().signal,
      }).then(() => {
        if (messageId && this.chatId) { try { updateMessage(messageId, blocks); } catch { /* */ } }
      });
    };
    try {
      await this.runner.runTurn(text, frames, emit, ac.signal, spawnBuild);
    } catch (e) {
      if (!ac.signal.aborted) console.error("[live] turn:", e);
    } finally {
      // On barge-in, persist only what was actually SPOKEN — the generated text
      // ran ahead of the on-device TTS, so the unspoken tail must NOT be saved.
      if (ac.signal.aborted && this.bargeSpoken != null) truncateSpokenText(blocks, this.bargeSpoken);
      this.bargeSpoken = null;
      scrubControlTokens(blocks);
      // Persist the assistant reply even on barge-in/abort, so reload shows it.
      if (this.chatId && blocks.length) { try { messageId = addMessage(this.chatId, "assistant", blocks, true /* live */).id; } catch { /* */ } }
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

  // Write a camera frame to disk as a canvas resource and return the /assets
  // URL the build worker can embed (mirrors crop_page_image's scratch→/assets
  // pattern). Returns undefined on any failure — a missing frame just means the
  // worker builds from the product graph alone.
  private persistFrame(frame: Frame): { url: string; image: Frame } | undefined {
    try {
      const rel = `scratch/frames/${this.chatId || "live"}/${randomUUID()}.jpg`;
      const dest = resolve(DATA_DIR, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, Buffer.from(frame.data, "base64"));
      const base = process.env.WEB_PUBLIC_URL ?? "http://localhost:3000";
      return { url: `${base}/assets/${rel}`, image: frame };
    } catch { return undefined; }
  }

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
