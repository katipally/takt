// Camera → JPEG frames ON DEMAND. The thick client attaches ONE freshest frame
// per turn (always, when the camera is on — no dark/dedup gating), plus a hi-res
// grab for the `look` tool. No interval, no server-driven fps.
export class CameraCapture {
  private stream?: MediaStream;
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;

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
  }

  /** The freshest frame, attached to each turn (~512px, moderate quality). */
  captureFreshest(size = 512, q = 0.7): Promise<ArrayBuffer | null> { return this.grab(size, q); }
  /** One higher-res grab for the `look` tool. */
  captureOne(size = 768, q = 0.85): Promise<ArrayBuffer | null> { return this.grab(size, q); }

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
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.video.srcObject = null;
  }
}
