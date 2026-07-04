import { getStt } from "./models.js";

// Moonshine transcription of a mono 16 kHz float utterance. Per-utterance
// (VAD-gated) — matches the reference moonshine-web example. Used both for the
// authoritative final transcript and, throttled, for live partial captions.
export async function transcribe(pcm16k: Float32Array): Promise<string> {
  if (pcm16k.length < 16000 * 0.2) return ""; // < 200 ms → nothing worth decoding
  try {
    const asr = await getStt();
    const out: any = await asr(pcm16k);
    return String(out?.text ?? "").trim();
  } catch (e) {
    console.warn("[live] STT failed:", (e as Error).message);
    return "";
  }
}
