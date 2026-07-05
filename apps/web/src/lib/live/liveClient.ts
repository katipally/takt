import type { SseEvent } from "@prox/shared";

// Browser side of the /live WebSocket. Same-origin (the web server proxies it to
// the agent). THIN protocol: we send final user text + camera frames + a cancel
// signal, and receive the LLM's reply as chat SSE events. No audio on the wire —
// the browser runs the voice models on-device.
const TAG_FRAME_IN = 0x02;

export interface LiveHandlers {
  onOpen?: () => void;
  onClose?: () => void;
  onReconnecting?: () => void;
  onSse?: (e: SseEvent) => void;
  onNeedFrame?: (reqId: string) => void;
  onError?: (message: string) => void;
}

export class LiveClient {
  private ws: WebSocket | null = null;
  private slug = "";
  private chatId = "";
  private closedByUser = false;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private static MAX_RECONNECT = 4;
  constructor(private h: LiveHandlers) {}

  connect(productSlug: string, chatId: string) {
    this.slug = productSlug; this.chatId = chatId;
    this.closedByUser = false;
    this.open();
  }

  private open() {
    const base = process.env.NEXT_PUBLIC_LIVE_WS_URL
      || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
    const ws = new WebSocket(`${base}/live?product=${encodeURIComponent(this.slug)}&chat=${encodeURIComponent(this.chatId)}`);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => { this.attempts = 0; this.h.onOpen?.(); };
    ws.onclose = () => {
      if (this.closedByUser) { this.h.onClose?.(); return; }
      // Unexpected drop → reconnect a few times. The server rehydrates the
      // conversation from the DB, so the agent keeps its context across the drop.
      if (this.attempts < LiveClient.MAX_RECONNECT) {
        this.h.onReconnecting?.();
        const delay = Math.min(2000, 300 * 2 ** this.attempts++);
        this.reconnectTimer = setTimeout(() => this.open(), delay);
      } else {
        this.h.onError?.("Lost connection. Please try again.");
        this.h.onClose?.();
      }
    };
    ws.onerror = () => { /* onclose follows; reconnect handles it */ };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string") return; // server sends no binary now
      let m: any;
      try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.t) {
        case "sse": return this.h.onSse?.(m.event);
        case "need_frame": return this.h.onNeedFrame?.(m.reqId);
        case "error": return this.h.onError?.(m.message);
      }
    };
    this.ws = ws;
  }

  private sendJson(m: unknown) { if (this.ready) this.ws!.send(JSON.stringify(m)); }
  userText(text: string) { this.sendJson({ t: "user_text", text }); }
  cancel() { this.sendJson({ t: "cancel" }); }
  control(action: "camera_on" | "camera_off" | "end") { this.sendJson({ t: "control", action }); }
  frameResponse(reqId: string) { this.sendJson({ t: "frame_response", reqId }); }

  sendFrame(jpeg: ArrayBuffer) {
    if (!this.ready) return;
    const out = new Uint8Array(jpeg.byteLength + 1);
    out[0] = TAG_FRAME_IN;
    out.set(new Uint8Array(jpeg), 1);
    this.ws!.send(out.buffer);
  }

  get ready() { return this.ws?.readyState === WebSocket.OPEN; }
  close() {
    this.closedByUser = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.control("end");
    try { this.ws?.close(); } catch { /* */ }
    this.ws = null;
  }
}
