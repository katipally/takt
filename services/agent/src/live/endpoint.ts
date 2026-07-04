import { getSmartTurn, getTurnProcessor, ort } from "./models.js";

// Turn detection lives behind this interface so we can swap the heuristic for a
// semantic model without touching the session.
export interface TurnDetector {
  /** Given the just-ended utterance, is the user's turn actually complete? */
  isComplete(utterance: Float32Array): Promise<boolean> | boolean;
}

// The SpeechGate's silence hangover already decides "stopped talking"; this just
// rejects sub-turn blips (a cough, a single word of noise).
export class SilenceHeuristic implements TurnDetector {
  isComplete(utterance: Float32Array): boolean {
    return utterance.length >= 16000 * 0.3; // ≥ 300 ms of speech
  }
}

// Smart Turn v3 (pipecat): a Whisper-tiny encoder that reads the *meaning* of the
// utterance and predicts whether the speaker is done — so it can hold the turn
// through a mid-sentence pause instead of endpointing on silence alone.
// Preprocessing mirrors pipecat's inference.py: keep the LAST 8 s (pad zeros at
// the front), Whisper log-mel, and the ONNX output IS a sigmoid probability.
export class SmartTurnV3 implements TurnDetector {
  async isComplete(utterance: Float32Array): Promise<boolean> {
    if (utterance.length < 16000 * 0.3) return false; // blip → not a turn
    const [session, proc] = await Promise.all([getSmartTurn(), getTurnProcessor()]);
    if (!session || !proc) return utterance.length >= 16000 * 0.3; // fall back to length
    try {
      const feats = await features(proc, utterance);
      const res: any = await session.run({ input_features: feats });
      return (res.logits.data[0] as number) > 0.5;
    } catch (e) {
      console.warn("[live] Smart Turn inference failed:", (e as Error).message);
      return true; // don't get stuck — treat as complete
    }
  }
}

const N8 = 8 * 16000; // 8 s at 16 kHz

async function features(proc: any, audio: Float32Array): Promise<ort.Tensor> {
  // Keep the last 8 s, padding zeros at the FRONT (recent speech at the end).
  const a = new Float32Array(N8);
  if (audio.length >= N8) a.set(audio.subarray(audio.length - N8));
  else a.set(audio, N8 - audio.length);
  const r: any = await proc(a, { sampling_rate: 16000 });
  const f = r.input_features; // [1, 80, T]
  const data = f.data as Float32Array;
  const T = f.dims[2];
  const out = new Float32Array(80 * 800);
  for (let m = 0; m < 80; m++) for (let x = 0; x < 800; x++) out[m * 800 + x] = data[m * T + x]!;
  return new ort.Tensor("float32", out, [1, 80, 800]);
}

/** Pick the turn detector: Smart Turn by default, or the silence heuristic. */
export function createTurnDetector(): TurnDetector {
  return (process.env.PROX_TURN ?? "smart") === "silence" ? new SilenceHeuristic() : new SmartTurnV3();
}
