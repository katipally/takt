import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pipeline, AutoProcessor } from "@huggingface/transformers";
import { KokoroTTS } from "kokoro-js";
import * as ort from "onnxruntime-node";
import { DATA_DIR } from "@prox/db";

// Lazy singletons for the local live-mode models, mirroring packages/embed's
// cached-promise + warm() pattern. Everything runs CPU-only via transformers.js
// (ONNX) so it deploys to a plain HF Space. Model ids are env-overridable.

const STT_MODEL = process.env.PROX_STT_MODEL ?? "onnx-community/moonshine-base-ONNX";
const TTS_MODEL = process.env.PROX_TTS_MODEL ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
const TTS_DTYPE = process.env.PROX_TTS_DTYPE ?? "q8";
// Silero VAD v5 (16 kHz, single small ONNX). Downloaded once, cached to disk.
// NOTE: pinned CDN copy — the snakers4 `master` raw file is a different export
// that scores all frames as non-speech with this input layout.
const SILERO_URL = process.env.PROX_VAD_URL
  ?? "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.24/dist/silero_vad_v5.onnx";
// Smart Turn v3 (semantic end-of-turn). Whisper-tiny encoder + linear head; the
// input is a Whisper log-mel, produced by the whisper-tiny feature extractor.
const SMART_TURN_URL = process.env.PROX_TURN_URL
  ?? "https://huggingface.co/pipecat-ai/smart-turn-v3/resolve/main/smart-turn-v3.2-cpu.onnx";
const TURN_PROCESSOR = process.env.PROX_TURN_PROCESSOR ?? "onnx-community/whisper-tiny.en";

let sttPromise: Promise<any> | null = null;
let ttsPromise: Promise<any> | null = null;
let sileroPromise: Promise<ort.InferenceSession | null> | null = null;
let smartTurnPromise: Promise<ort.InferenceSession | null> | null = null;
let turnProcPromise: Promise<any> | null = null;

// One clean line per file when it finishes downloading — no progress-bar spam
// flooding the terminal on first run.
const downloaded = new Set<string>();
const progress_callback = (p: any) => {
  if (p?.status === "done" && p.file && !downloaded.has(p.file)) {
    downloaded.add(p.file);
    console.log(`[live] downloaded ${p.name ?? ""}/${p.file}`);
  }
};

/** Moonshine ASR pipeline (full-utterance transcription). */
export function getStt(): Promise<any> {
  return (sttPromise ??= pipeline("automatic-speech-recognition", STT_MODEL, { progress_callback }));
}

/** Kokoro-82M TTS. */
export function getTts(): Promise<any> {
  return (ttsPromise ??= KokoroTTS.from_pretrained(TTS_MODEL, { dtype: TTS_DTYPE as any, device: "cpu", progress_callback } as any));
}

/** Silero VAD session, or null if it couldn't load (→ energy-VAD fallback). */
export function getSilero(): Promise<ort.InferenceSession | null> {
  return (sileroPromise ??= loadSilero());
}

async function loadSilero(): Promise<ort.InferenceSession | null> {
  return loadOnnxCached(SILERO_URL, "silero_vad.onnx", "Silero VAD", "energy VAD");
}

/** Smart Turn v3 ONNX session, or null (→ silence-heuristic fallback). */
export function getSmartTurn(): Promise<ort.InferenceSession | null> {
  return (smartTurnPromise ??= loadOnnxCached(SMART_TURN_URL, "smart-turn-v3.onnx", "Smart Turn", "silence heuristic"));
}

/** Whisper feature extractor that turns audio into Smart Turn's input_features. */
export function getTurnProcessor(): Promise<any> {
  return (turnProcPromise ??= AutoProcessor.from_pretrained(TURN_PROCESSOR, { progress_callback } as any));
}

// Download an ONNX once to the data dir, cache it, and open a session.
async function loadOnnxCached(url: string, file: string, name: string, fallback: string): Promise<ort.InferenceSession | null> {
  try {
    const path = resolve(DATA_DIR, "live-models", file);
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download ${res.status}`);
      writeFileSync(path, Buffer.from(await res.arrayBuffer()));
    }
    return await ort.InferenceSession.create(path);
  } catch (e) {
    console.warn(`[live] ${name} unavailable, using ${fallback}:`, (e as Error).message);
    return null;
  }
}

/** Download + init every model once at boot so no user pays the cold start. */
export async function warmLiveModels(): Promise<void> {
  await Promise.allSettled([getStt(), getTts(), getSilero()]);
}

export { ort };
