import sharp from "sharp";

// Adaptive vision. Holds the freshest camera frame(s), dedupes static scenes so
// we don't waste tokens re-sending an unchanged view, skips too-dark frames, and
// escalates capture fps/resolution when there's motion or the agent needs a
// closer look — backing off to a cheap 1 fps baseline when things settle.

export interface Frame { data: string; mime: string } // → harness ImagePart

const DUP_HAMMING = 6; // aHash distance ≤ this ⇒ "same scene", don't re-attach
const MOTION_HAMMING = 10; // frame-to-frame distance above this ⇒ motion
const DARK_LUMA = 28; // mean 0–255 luma below this ⇒ too dark to use

export class VisionController {
  private latest: Buffer | null = null;
  private latestHash = 0n;
  private latestLuma = 255;
  private lastSentHash: bigint | null = null;
  private cameraOn = false;
  private fps = 1;
  private size = 320;
  private dirty = false; // vision command changed → session should re-send it

  setCamera(on: boolean) {
    this.cameraOn = on;
    if (!on) { this.latest = null; this.lastSentHash = null; this.backoff(); }
  }
  isCameraOn() { return this.cameraOn; }
  get tooDark() { return this.cameraOn && this.latest !== null && this.latestLuma < DARK_LUMA; }

  async addFrame(jpeg: Buffer): Promise<void> {
    if (!this.cameraOn) return;
    this.latest = jpeg;
    try {
      const { data } = await sharp(jpeg).greyscale().resize(8, 8, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
      let sum = 0;
      for (const v of data) sum += v;
      const avg = sum / data.length;
      this.latestLuma = avg;
      let h = 0n;
      for (let i = 0; i < 64; i++) if (data[i]! >= avg) h |= 1n << BigInt(i);
      if (this.latestHash && hamming(h, this.latestHash) > MOTION_HAMMING) this.escalate();
      this.latestHash = h;
    } catch { /* keep the raw bytes even if hashing fails */ }
  }

  /** Frame(s) to attach to this LLM turn, or [] when nothing new/usable. */
  freshestFrames(opts: { force?: boolean } = {}): Frame[] {
    if (!this.cameraOn || !this.latest) return [];
    if (this.latestLuma < DARK_LUMA && !opts.force) return [];
    const isNew = this.lastSentHash === null || hamming(this.latestHash, this.lastSentHash) > DUP_HAMMING;
    if (!isNew && !opts.force) return [];
    this.lastSentHash = this.latestHash;
    return [{ data: this.latest.toString("base64"), mime: "image/jpeg" }];
  }

  escalate() { this.set(5, 720); }
  backoff() { this.set(1, 320); }
  private set(fps: number, size: number) {
    if (fps !== this.fps || size !== this.size) { this.fps = fps; this.size = size; this.dirty = true; }
  }
  /** Returns the vision command if it changed since last call, else null. */
  takeCommand(): { fps: number; size: number } | null {
    if (!this.dirty) return null;
    this.dirty = false;
    return { fps: this.fps, size: this.size };
  }
  command() { return { fps: this.fps, size: this.size }; }
}

/** Cheap heuristic: does the user's utterance likely need the camera? */
export function isVisualQuestion(text: string): boolean {
  return /\b(this|these|here|look|see|show(ing)?|what'?s?|which|read|colou?r|holding|screen|picture|camera|point(ing)?)\b/i.test(text);
}

function hamming(a: bigint, b: bigint): number {
  let x = a ^ b, c = 0;
  while (x) { c += Number(x & 1n); x >>= 1n; }
  return c;
}
