import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { WebSocket } from "ws";
import type { Product, Manual, SseEvent, MessageBlock, LiveServerMsg } from "@takt/shared";
import { LIVE_TAG, liveClientMsgSchema } from "@takt/shared";
import { createChat, addMessage, listMessages, updateMessage, DATA_DIR } from "@takt/db";
import type { Message } from "@takt/harness";
import { randomUUID as uuid } from "node:crypto";
import type { Emit, TaktTool } from "../tools.js";
import { foldBlock } from "../block-emit.js";
import { runCanvasWorker } from "../canvas-worker.js";
import { LiveTurnRunner } from "./turn-runner.js";

type Frame = { data: string; mime: string };
const HISTORY_TURNS = 20; // recent messages to rehydrate on reconnect

// Replace the assistant's spoken text in `blocks` with exactly what the client
// says was voiced on a barge-in. Live replies are already plain text (LIVE_RULES),
// so this is a clean swap; page images / surfaces are left untouched.
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
  private ac: AbortController | null = null;
  private turnActive = false;
  private queuedText: string | null = null; // an utterance that arrived mid-turn (barge-in)
  private bargeSpoken: string | null = null; // on barge-in, the text the client actually SPOKE (persist only that)
  private cameraOn = false;
  private lastFrame: Frame | null = null; // freshest camera frame, attached per turn
  private closed = false;

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
    this.runner = new LiveTurnRunner(product, manuals, chatId || undefined, [lookTool]);

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) this.onBinary(data);
      else this.onText(data.toString()).catch((e) => console.error("[live] text:", e));
    });
    ws.on("close", () => this.dispose());
    ws.on("error", () => this.dispose());
  }

  async start() {
    // Persist the chat row + rehydrate recent history (so a reconnect mid-call
    // doesn't make the agent forget what was already said). No model warming —
    // the browser owns the voice models now.
    if (this.chatId) {
      createChat(this.product?.id ?? null, this.chatId);
      const prior = this.rehydrate();
      if (prior.length) this.runner.seed(prior);
    }
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
    if (buf[0] !== LIVE_TAG.FRAME_IN) return;
    const jpeg = Buffer.from(buf.subarray(1));
    const frame: Frame = { data: jpeg.toString("base64"), mime: "image/jpeg" };
    if (this.awaitingLookFrame && this.lookPending) {
      const p = this.lookPending;
      this.lookPending = null; this.awaitingLookFrame = false;
      p.resolve(frame);
      return;
    }
    this.lastFrame = frame; // freshest-per-turn camera frame
  }

  private async onText(str: string) {
    let msg;
    try { msg = liveClientMsgSchema.parse(JSON.parse(str)); } catch { return; }
    switch (msg.t) {
      case "user_text": return void this.runTurn(msg.text);
      case "cancel": if (this.turnActive) this.bargeSpoken = msg.spoken ?? null; return this.interrupt();
      case "control":
        if (msg.action === "camera_on") this.cameraOn = true;
        else if (msg.action === "camera_off") { this.cameraOn = false; this.lastFrame = null; }
        else if (msg.action === "end") this.dispose();
        return;
      case "frame_response":
        if (this.lookPending?.reqId === msg.reqId) this.awaitingLookFrame = true;
        return;
    }
  }

  // ── turn ────────────────────────────────────────────────────────────────
  private async runTurn(text: string) {
    if (!text.trim() || this.closed) return;
    // A new utterance during an in-flight turn (classic barge-in: cancel then
    // immediately speak) must NOT be dropped. Queue it — APPEND, so two quick
    // utterances both survive (the user adding new info mid-answer) — and the
    // finally below drains them as one turn once this turn finishes tearing down.
    if (this.turnActive) { this.queuedText = this.queuedText ? `${this.queuedText} ${text}` : text; return; }
    this.turnActive = true;
    const ac = new AbortController();
    this.ac = ac;
    const frames = this.cameraOn && this.lastFrame ? [this.lastFrame] : [];

    // Accumulate the assistant turn as an ordered block list (mirrors the HTTP
    // /chat handler) so reasoning, tools, text, and artifacts replay in order.
    const blocks: MessageBlock[] = [];
    const emit = this.blockEmit(blocks, ac.signal);

    if (this.chatId) addMessage(this.chatId, "user", [{ type: "text", text }], true /* live */);
    // Background builds delegated this turn use a SESSION-stable emit — the
    // blockEmit guarded by a never-aborting signal, so it only stops when the
    // whole session closes (not on a barge-in that aborts the spoken turn). The
    // surface still lands on the stage while the main agent keeps talking.
    // When the camera is on, hand the worker the freshest frame (persisted as an
    // artifact resource) so it builds the answer AROUND what the user is showing
    // — the frame embedded and annotated with arrows/labels.
    // The assistant row id, set once persisted (below). A background build that
    // finishes AFTER that re-saves the row so its late-landing surface isn't lost
    // on reload (blocks was already serialized before the surface arrived).
    let messageId: string | null = null;
    const spawnBuild = (brief: string, ctx?: { facts?: string; figures?: string[] }) => {
      const frame = this.cameraOn && this.lastFrame ? this.persistFrame(this.lastFrame) : undefined;
      // Session-stable signal (never aborts on barge-in) so a delegated canvas
      // still lands while the spoken turn is interrupted. Facts + figures gathered
      // in the live turn are threaded in so the canvas is grounded like chat's.
      void runCanvasWorker({
        mode: "build", canvasId: uuid().slice(0, 8), brief, question: brief,
        facts: ctx?.facts, figures: ctx?.figures,
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
      // On barge-in, persist only what was actually SPOKEN — the generated text ran
      // ahead of the on-device TTS, so the unspoken tail must NOT be saved as if it
      // was said (the client sends its spoken cutoff with the cancel).
      if (ac.signal.aborted && this.bargeSpoken != null) truncateSpokenText(blocks, this.bargeSpoken);
      this.bargeSpoken = null;
      // Persist the assistant reply even on barge-in/abort, so reload shows it.
      if (this.chatId && blocks.length) { try { messageId = addMessage(this.chatId, "assistant", blocks, true /* live */).id; } catch { /* */ } }
      this.send({ t: "sse", event: { type: "done" } });
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

  // Write a camera frame to disk as an artifact resource and return the /assets
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
    this.ac?.abort();
    this.lookPending?.resolve(null);
    try { this.ws.close(); } catch { /* already closing */ }
  }
}
