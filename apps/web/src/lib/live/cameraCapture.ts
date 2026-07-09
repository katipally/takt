// Camera → JPEG frames, Gemini-Live style. While the camera is on we sample it at
// ~1fps into a small rolling buffer, so the "current view" is ALWAYS a real, recent
// frame (never a black autofocus grab or a stale one-off). Each turn attaches the
// latest buffered frame; the `look` tool grabs a fresh HIGHER-res frame on demand.
export class CameraCapture {
  private stream?: MediaStream;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private buffer: ArrayBuffer[] = []; // rolling ~1fps frames, newest last
  private timer: ReturnType<typeof setInterval> | null = null;
  private static BUFFER = 6; // keep ~6s of recent frames

  constructor() {
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.canvas = document.createElement("canvas");
  }

  async start(deviceId?: string, facingMode: "user" | "environment" = "environment") {
    const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (deviceId) video.deviceId = { exact: deviceId };
    else video.facingMode = facingMode; // phones: default to the rear camera
    this.stream = await navigator.mediaDevices.getUserMedia({ video });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.startSampling();
  }

  // Sample at ~1fps into the rolling buffer.
  private startSampling() {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.sample(); }, 1000);
    void this.sample(); // seed one immediately
  }
  private async sample() {
    const buf = await this.grab(640, 0.72);
    if (!buf) return;
    this.buffer.push(buf);
    if (this.buffer.length > CameraCapture.BUFFER) this.buffer.shift();
  }

  /** The latest sampled frame (attached to each turn). Falls back to a fresh grab
   *  if the buffer hasn't filled yet. */
  async captureFreshest(): Promise<ArrayBuffer | null> {
    return this.buffer[this.buffer.length - 1] ?? this.grab(640, 0.72);
  }
  /** The last `n` distinct recent frames (oldest→newest) — a bit of temporal
   *  context so the model senses motion, not just a still. */
  recent(n = 2): ArrayBuffer[] {
    return this.buffer.slice(-Math.max(1, n));
  }
  /** A fresh, higher-res grab for the `look` tool (read small labels/text). */
  captureHiRes(size = 1024, q = 0.86): Promise<ArrayBuffer | null> { return this.grab(size, q); }

  private async grab(size: number, q: number): Promise<ArrayBuffer | null> {
    const v = this.video;
    if (!v.videoWidth) return null;
    const scale = Math.min(1, size / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale);
    const h = Math.round(v.videoHeight * scale);
    this.canvas.width = w; this.canvas.height = h;
    this.canvas.getContext("2d")!.drawImage(v, 0, 0, w, h);
    return new Promise((res) => this.canvas.toBlob((b) => (b ? b.arrayBuffer().then(res) : res(null)), "image/jpeg", q));
  }

  getStream() { return this.stream; }
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.buffer = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.video.srcObject = null;
  }
}
