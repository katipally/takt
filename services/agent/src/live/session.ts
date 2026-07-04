import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { Product, Manual, SseEvent, LiveServerMsg } from "@prox/shared";
import { LIVE_TAG, liveClientMsgSchema } from "@prox/shared";
import type { Emit, ProxTool } from "../tools.js";
import { getStt, getTts, getSilero, getSmartTurn, getTurnProcessor } from "./models.js";
import { SpeechGate } from "./vad.js";
import { transcribe } from "./stt.js";
import { createTurnDetector } from "./endpoint.js";
import { SentenceChunker } from "./sentence.js";
import { synthSentence, floatToPcm16 } from "./tts.js";
import { VisionController, isVisualQuestion, type Frame } from "./vision.js";
import { LiveTurnRunner } from "./turn-runner.js";

const BACKPRESSURE_BYTES = 1_000_000; // pause audio-out if the socket backs up

// One live call. Owns the WebSocket, the VAD→STT→turn→LLM→TTS pipeline, the
// adaptive vision controller, and the epoch-based barge-in. Everything the
// user says or the agent draws flows over the one socket.
export class LiveSession {
  private gate: SpeechGate;
  private vision = new VisionController();
  private turnDetector = createTurnDetector();
  private runner: LiveTurnRunner;

  private epoch = 0; // bumped each turn; stales in-flight emits + audio
  private botSpeaking = false;
  private turnRunning = false;
  private ac: AbortController | null = null;
  private chunker = new SentenceChunker();
  private ttsChain: Promise<void> = Promise.resolve();
  // Utterance carried across a mid-thought pause when Smart Turn says "not done".
  private pending: Float32Array | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  // `look` tool ↔ client frame request handshake.
  private lookPending: { reqId: string; resolve: (f: Frame | null) => void } | null = null;
  private awaitingLookFrame = false;
  private closed = false;

  constructor(private ws: WebSocket, product: Product, manuals: Manual[], chatId: string) {
    const lookTool: ProxTool = {
      name: "look",
      description: "Capture a fresh, higher-resolution frame from the user's camera and see it right now. Use when you need a closer or more current look at what the user is showing you. If the camera is off this returns nothing — then ask the user to turn it on.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => {
        if (!this.vision.isCameraOn()) return { output: "The camera is off, so I can't see anything right now. Ask the user to turn on their camera." };
        this.vision.escalate();
        this.sendVisionCommand();
        const frame = await this.requestFrame();
        if (!frame) return { output: "Couldn't grab a camera frame (it timed out). Ask the user to check their camera." };
        if (this.vision.tooDark) return { output: "The camera view is too dark to make out. Ask the user to improve the lighting.", images: [frame] };
        return { output: "Here is the user's current camera view.", images: [frame] };
      },
    };
    this.runner = new LiveTurnRunner(product, manuals, chatId, [lookTool]);

    this.gate = new SpeechGate({
      onSpeechStart: () => this.onSpeechStart(),
      onSpeechEnd: (u) => { void this.onSpeechEnd(u); },
      // Barge-in needs sustained speech (~250 ms) to beat TTS echo; idle listening reacts fast.
      startFrames: () => (this.botSpeaking ? 8 : 2),
    });

    ws.on("message", (data: Buffer, isBinary: boolean) => {
      if (isBinary) this.onBinary(data).catch((e) => console.error("[live] binary:", e));
      else this.onText(data.toString()).catch((e) => console.error("[live] text:", e));
    });
    ws.on("close", () => this.dispose());
    ws.on("error", () => this.dispose());
  }

  async start() {
    this.sendState("warming");
    console.log("[live] warming models (first run downloads models, then cached)…");
    const warm: Promise<unknown>[] = [getStt(), getTts(), getSilero()];
    if ((process.env.PROX_TURN ?? "smart") !== "silence") warm.push(getSmartTurn(), getTurnProcessor());
    await Promise.allSettled(warm);
    console.log("[live] models ready");
    if (!this.closed) this.sendState("idle");
  }

  // ── inbound ───────────────────────────────────────────────────────────────
  private async onBinary(buf: Buffer) {
    const tag = buf[0];
    const payload = buf.subarray(1);
    if (tag === LIVE_TAG.AUDIO_IN) {
      // The 1-byte tag puts PCM at an odd byte offset, which Int16Array rejects.
      // A DataView reads unaligned little-endian Int16 fine.
      const n = payload.length >> 1;
      const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      const f32 = new Float32Array(n);
      for (let i = 0; i < n; i++) f32[i] = dv.getInt16(i * 2, true) / 32768;
      await this.gate.feed(f32);
    } else if (tag === LIVE_TAG.FRAME_IN) {
      const jpeg = Buffer.from(payload);
      if (this.awaitingLookFrame && this.lookPending) {
        await this.vision.addFrame(jpeg);
        const p = this.lookPending;
        this.lookPending = null; this.awaitingLookFrame = false;
        p.resolve({ data: jpeg.toString("base64"), mime: "image/jpeg" });
        return;
      }
      await this.vision.addFrame(jpeg);
      const cmd = this.vision.takeCommand();
      if (cmd) this.send({ t: "vision", fps: cmd.fps, size: cmd.size });
    }
  }

  private async onText(str: string) {
    let msg;
    try { msg = liveClientMsgSchema.parse(JSON.parse(str)); } catch { return; }
    if (msg.t === "control") {
      if (msg.action === "camera_on") { this.vision.setCamera(true); this.sendVisionCommand(); }
      else if (msg.action === "camera_off") this.vision.setCamera(false);
      else if (msg.action === "mute") this.gate.reset();
      else if (msg.action === "end") this.dispose();
    } else if (msg.t === "frame_response") {
      if (this.lookPending?.reqId === msg.reqId) this.awaitingLookFrame = true;
    }
  }

  // ── turn lifecycle ──────────────────────────────────────────────────────────
  private onSpeechStart() {
    if (this.botSpeaking) this.interrupt(); // barge-in
    this.clearPendingFlush(); // user resumed → don't force-flush the held utterance
    this.sendState("listening");
  }

  // Speech stopped. Combine with any held utterance and ask the turn detector
  // whether the user is actually done — if not (Smart Turn), hold and wait for
  // them to continue instead of endpointing on the pause.
  private async onSpeechEnd(utterance: Float32Array) {
    if (this.turnRunning) return; // a turn is already mid-flight
    const combined = this.pending ? concatF32(this.pending, utterance) : utterance;
    if (combined.length < 16000 * 0.3) { this.pending = null; this.sendState("idle"); return; }

    const complete = await this.turnDetector.isComplete(combined);
    if (this.turnRunning || this.botSpeaking) return; // state changed while awaiting
    if (!complete) {
      this.pending = combined;
      this.schedulePendingFlush(); // safety: don't hold forever if they never resume
      this.sendState("idle");
      return;
    }
    this.clearPendingFlush();
    this.pending = null;
    await this.startTurn(combined);
  }

  private schedulePendingFlush() {
    this.clearPendingFlush();
    this.pendingTimer = setTimeout(() => {
      const p = this.pending; this.pending = null; this.pendingTimer = null;
      if (p && !this.turnRunning && !this.botSpeaking) void this.startTurn(p);
    }, 4000);
  }
  private clearPendingFlush() { if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; } }

  private async startTurn(utterance: Float32Array) {
    this.turnRunning = true;
    this.sendState("thinking");
    const text = await transcribe(utterance);
    if (!text) { this.turnRunning = false; this.sendState("idle"); return; }
    this.send({ t: "caption", role: "user", text, final: true });

    if (this.vision.isCameraOn() && isVisualQuestion(text)) { this.vision.escalate(); this.sendVisionCommand(); }
    const frames = this.vision.freshestFrames();

    const turnEpoch = ++this.epoch;
    this.ac = new AbortController();
    this.botSpeaking = true;
    this.chunker = new SentenceChunker();
    this.ttsChain = Promise.resolve();

    const emit: Emit = async (e: SseEvent) => {
      if (this.epoch !== turnEpoch) return; // stale (barge-in) → drop
      this.send({ t: "sse", event: e });
      if (e.type === "text_delta") this.feedSpeech(e.text, turnEpoch);
    };

    try {
      await this.runner.runTurn(text, frames, emit, this.ac.signal);
    } catch (e) {
      if (this.epoch === turnEpoch) console.error("[live] turn:", e);
    }

    if (this.epoch === turnEpoch) {
      const tail = this.chunker.flush();
      if (tail) this.feedSpeech(tail, turnEpoch, true);
      await this.ttsChain; // let the last audio finish going out
      this.send({ t: "sse", event: { type: "done" } });
      this.botSpeaking = false;
      this.vision.backoff(); this.sendVisionCommand();
      this.sendState("idle");
    }
    this.turnRunning = false;
  }

  // Cancel the in-flight turn and tell the client to drop its queued audio.
  private interrupt() {
    this.ac?.abort();
    this.ac = null;
    this.botSpeaking = false;
    this.turnRunning = false;
    this.pending = null;
    this.clearPendingFlush();
    // Drop client audio whose epoch ≤ the current turn; the next turn is epoch+1.
    this.send({ t: "flush", epoch: this.epoch + 1 });
  }

  // ── TTS ──────────────────────────────────────────────────────────────────
  private feedSpeech(text: string, epoch: number, flush = false) {
    const sentences = flush ? (text ? [text] : []) : this.chunker.push(text);
    for (const s of sentences) this.enqueueSpeak(s, epoch);
  }

  private enqueueSpeak(sentence: string, epoch: number) {
    this.ttsChain = this.ttsChain.then(async () => {
      if (this.epoch !== epoch || this.closed) return;
      const f32 = await synthSentence(sentence);
      if (!f32 || this.epoch !== epoch || this.closed) return;
      this.send({ t: "caption", role: "agent", text: sentence, final: false });
      this.sendState("speaking");
      await this.sendAudio(f32, epoch);
    }).catch(() => {});
  }

  private async sendAudio(f32: Float32Array, epoch: number) {
    await this.drain();
    if (this.epoch !== epoch || this.closed || this.ws.readyState !== this.ws.OPEN) return;
    const pcm = floatToPcm16(f32);
    const header = Buffer.alloc(5);
    header[0] = LIVE_TAG.AUDIO_OUT;
    header.writeUInt32LE(epoch, 1);
    const body = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    this.ws.send(Buffer.concat([header, body]));
  }

  private drain(): Promise<void> {
    return new Promise((res) => {
      const check = () => {
        if (this.closed || this.ws.readyState !== this.ws.OPEN || this.ws.bufferedAmount < BACKPRESSURE_BYTES) res();
        else setTimeout(check, 20);
      };
      check();
    });
  }

  // ── vision `look` handshake ────────────────────────────────────────────────
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

  // ── send helpers ───────────────────────────────────────────────────────────
  private send(m: LiveServerMsg) {
    if (this.closed || this.ws.readyState !== this.ws.OPEN) return;
    this.ws.send(JSON.stringify(m));
  }
  private sendState(phase: "warming" | "idle" | "listening" | "thinking" | "speaking") { this.send({ t: "state", phase }); }
  private sendVisionCommand() { const c = this.vision.command(); this.send({ t: "vision", fps: c.fps, size: c.size }); }

  private dispose() {
    if (this.closed) return;
    this.closed = true;
    this.ac?.abort();
    this.clearPendingFlush();
    this.lookPending?.resolve(null);
    try { this.ws.close(); } catch { /* already closing */ }
  }
}

function concatF32(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a); out.set(b, a.length);
  return out;
}
