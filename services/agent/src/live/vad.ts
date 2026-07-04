import { getSilero, ort } from "./models.js";

// Voice-activity gate. Feeds mono 16 kHz float audio in 512-sample (32 ms)
// frames through a VAD model, applies start/stop hysteresis + a silence
// hangover, and hands the accumulated utterance PCM to the session on
// speech-end. Silero is primary; a pure-JS energy VAD is the fallback so the
// pipeline always runs (and is unit-testable without downloading weights).

const FRAME = 512; // samples @ 16 kHz = 32 ms

interface VadModel {
  score(frame: Float32Array): Promise<number> | number;
  reset(): void;
}

class SileroVad implements VadModel {
  private state = new Float32Array(2 * 128); // [2,1,128]
  constructor(private session: ort.InferenceSession) {}
  reset() { this.state = new Float32Array(2 * 128); }
  async score(frame: Float32Array): Promise<number> {
    const input = new ort.Tensor("float32", frame, [1, frame.length]);
    const state = new ort.Tensor("float32", this.state, [2, 1, 128]);
    const sr = new ort.Tensor("int64", BigInt64Array.from([16000n])); // shape [1]
    const res: any = await this.session.run({ input, state, sr });
    // v5 outputs are named 'output' (prob) and 'stateN' (recurrent state).
    const probT = res.output ?? res[this.session.outputNames[0]!];
    const stateT = res.stateN ?? res[this.session.outputNames[1]!];
    this.state = Float32Array.from(stateT.data as Float32Array); // copy → own buffer
    return (probT.data as Float32Array)[0]!;
  }
}

// Energy VAD: RMS against an adaptive noise floor. Not SOTA, but reliable and
// zero-dependency. ponytail: fallback + the testable path; Silero is the upgrade.
class EnergyVad implements VadModel {
  private floor = 0.0015;
  reset() { this.floor = 0.0015; }
  score(frame: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
    const rms = Math.sqrt(sum / frame.length);
    // Track the quietest recent level as noise floor; speech = well above it.
    if (rms < this.floor) this.floor = this.floor * 0.9 + rms * 0.1;
    return rms > Math.max(0.01, this.floor * 6) ? Math.min(1, rms * 10) : 0;
  }
}

export interface SpeechGateOpts {
  onSpeechStart?: () => void;
  /** utterance = the accumulated 16 kHz float PCM for the just-ended speech. */
  onSpeechEnd?: (utterance: Float32Array) => void;
  /** while true, require a longer sustained speech to fire start (barge-in). */
  startFrames?: () => number;
  threshold?: number;
}

export class SpeechGate {
  private model: VadModel | null = null;
  private ready: Promise<void>;
  private carry = new Float32Array(0); // leftover < one frame
  private speaking = false;
  private aboveRun = 0;
  private hangoverLeft = 0;
  private utter: Float32Array[] = [];
  private static HANGOVER_FRAMES = 8; // ~256 ms trailing silence ends the turn

  constructor(private opts: SpeechGateOpts = {}) {
    this.ready = this.init();
  }
  private async init() {
    const s = await getSilero();
    this.model = s ? new SileroVad(s) : new EnergyVad();
  }

  reset() {
    this.speaking = false; this.aboveRun = 0; this.hangoverLeft = 0;
    this.utter = []; this.carry = new Float32Array(0);
    this.model?.reset();
  }

  /** Feed arbitrary-length mono 16 kHz float audio; frames internally. */
  async feed(pcm: Float32Array): Promise<void> {
    await this.ready;
    if (!this.model) return;
    // Prepend carry-over so we always score whole 512-sample frames.
    let buf: Float32Array;
    if (this.carry.length) {
      buf = new Float32Array(this.carry.length + pcm.length);
      buf.set(this.carry); buf.set(pcm, this.carry.length);
    } else buf = pcm;

    let off = 0;
    for (; off + FRAME <= buf.length; off += FRAME) {
      await this.step(buf.subarray(off, off + FRAME));
    }
    this.carry = buf.slice(off);
  }

  private async step(frame: Float32Array) {
    const thr = this.opts.threshold ?? 0.5;
    const prob = await this.model!.score(frame);
    const isSpeech = prob >= thr;
    const need = this.opts.startFrames?.() ?? 2;

    if (isSpeech) {
      this.aboveRun++;
      this.hangoverLeft = SpeechGate.HANGOVER_FRAMES;
      if (!this.speaking && this.aboveRun >= need) {
        this.speaking = true;
        this.utter = [];
        this.opts.onSpeechStart?.();
      }
    } else {
      this.aboveRun = 0;
    }

    if (this.speaking) {
      this.utter.push(frame.slice());
      if (!isSpeech) {
        this.hangoverLeft--;
        if (this.hangoverLeft <= 0) {
          this.speaking = false;
          const utterance = concat(this.utter);
          this.utter = [];
          this.opts.onSpeechEnd?.(utterance);
        }
      }
    }
  }
}

function concat(chunks: Float32Array[]): Float32Array {
  let n = 0; for (const c of chunks) n += c.length;
  const out = new Float32Array(n);
  let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
