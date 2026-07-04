import { getTts } from "./models.js";
import { cleanForSpeech } from "./sentence.js";

const VOICE = process.env.PROX_TTS_VOICE ?? "af_heart";

// Synthesize one sentence to mono 24 kHz float PCM (Kokoro's native rate).
// Returns null for empty/unspeakable text or on failure.
export async function synthSentence(text: string): Promise<Float32Array | null> {
  const clean = cleanForSpeech(text);
  if (!clean) return null;
  try {
    const tts = await getTts();
    const audio: any = await tts.generate(clean, { voice: VOICE });
    return audio.audio as Float32Array; // { audio: Float32Array, sampling_rate: 24000 }
  } catch (e) {
    console.warn("[live] TTS failed:", (e as Error).message);
    return null;
  }
}

/** Float32 [-1,1] → little-endian Int16 PCM for the wire. */
export function floatToPcm16(f32: Float32Array): Int16Array {
  const pcm = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]!));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}
