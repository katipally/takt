// Camera → JPEG frames at an adaptive rate. The server tells us the fps/size
// (baseline ~1 fps @ 320px, escalated to ~5 fps @ 720px when it needs detail),
// and can request one hi-res grab for the `look` tool.
export class CameraCapture {
  private stream?: MediaStream;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private timer?: ReturnType<typeof setInterval>;
  private fps = 1;
  private size = 320;
  private onFrame?: (jpeg: ArrayBuffer) => void;

  constructor() {
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.canvas = document.createElement("canvas");
  }

  async start(onFrame: (jpeg: ArrayBuffer) => void, deviceId?: string) {
    const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (deviceId) video.deviceId = { exact: deviceId };
    this.stream = await navigator.mediaDevices.getUserMedia({ video });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.onFrame = onFrame;
    this.schedule();
  }

  setVision(fps: number, size: number) {
    if (fps === this.fps && size === this.size) return;
    this.fps = fps; this.size = size;
    this.schedule();
  }

  private schedule() {
    clearInterval(this.timer);
    if (!this.onFrame) return;
    this.timer = setInterval(() => { void this.grab(this.size, 0.6).then((b) => b && this.onFrame?.(b)); }, Math.max(120, 1000 / this.fps));
  }

  /** One higher-res grab for the `look` tool. */
  captureOne(size = 720): Promise<ArrayBuffer | null> { return this.grab(size, 0.85); }

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
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }
}
