import type { SseEvent } from "@prox/shared";

// Browser side of the /live WebSocket. Same-origin connection (the web server
// proxies it to the agent); binary tag byte matches services/agent live-events.
const TAG_AUDIO_IN = 0x01;
const TAG_FRAME_IN = 0x02;
const TAG_AUDIO_OUT = 0x10;

export interface LiveHandlers {
  onOpen?: () => void;
  onClose?: () => void;
  onState?: (phase: string) => void;
  onCaption?: (role: "user" | "agent", text: string, final: boolean) => void;
  onAudio?: (pcm: Int16Array, epoch: number) => void;
  onFlush?: (epoch: number) => void;
  onVision?: (fps: number, size: number) => void;
  onNeedFrame?: (reqId: string) => void;
  onSse?: (e: SseEvent) => void;
  onError?: (message: string) => void;
}

export class LiveClient {
  private ws: WebSocket | null = null;
  constructor(private h: LiveHandlers) {}

  connect(productSlug: string, chatId: string) {
    // Dev connects straight to the agent (NEXT_PUBLIC_LIVE_WS_URL); prod uses the
    // same-origin /live proxied by the custom web server (HF single public port).
    const base = process.env.NEXT_PUBLIC_LIVE_WS_URL
      || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
    const ws = new WebSocket(`${base}/live?product=${encodeURIComponent(productSlug)}&chat=${encodeURIComponent(chatId)}`);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => this.h.onOpen?.();
    ws.onclose = () => this.h.onClose?.();
    ws.onerror = () => this.h.onError?.("connection error");
    ws.onmessage = (ev) => this.onMessage(ev);
    this.ws = ws;
  }

  private onMessage(ev: MessageEvent) {
    if (typeof ev.data === "string") {
      let m: any;
      try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.t) {
        case "state": return this.h.onState?.(m.phase);
        case "caption": return this.h.onCaption?.(m.role, m.text, m.final);
        case "flush": return this.h.onFlush?.(m.epoch);
        case "vision": return this.h.onVision?.(m.fps, m.size);
        case "need_frame": return this.h.onNeedFrame?.(m.reqId);
        case "sse": return this.h.onSse?.(m.event);
        case "error": return this.h.onError?.(m.message);
      }
    } else {
      const dv = new DataView(ev.data);
      if (dv.getUint8(0) === TAG_AUDIO_OUT) {
        const epoch = dv.getUint32(1, true);
        const pcm = new Int16Array(ev.data.slice(5)); // copy → aligned
        this.h.onAudio?.(pcm, epoch);
      }
    }
  }

  private sendBinary(tag: number, payload: ArrayBuffer) {
    if (!this.ready) return;
    const out = new Uint8Array(payload.byteLength + 1);
    out[0] = tag;
    out.set(new Uint8Array(payload), 1);
    this.ws!.send(out.buffer);
  }
  sendPcm(int16: ArrayBuffer) { this.sendBinary(TAG_AUDIO_IN, int16); }
  sendFrame(jpeg: ArrayBuffer) { this.sendBinary(TAG_FRAME_IN, jpeg); }

  private sendJson(m: unknown) { if (this.ready) this.ws!.send(JSON.stringify(m)); }
  control(action: "mute" | "unmute" | "camera_on" | "camera_off" | "end") { this.sendJson({ t: "control", action }); }
  frameResponse(reqId: string) { this.sendJson({ t: "frame_response", reqId }); }

  get ready() { return this.ws?.readyState === WebSocket.OPEN; }
  close() { this.control("end"); try { this.ws?.close(); } catch { /* */ } this.ws = null; }
}
