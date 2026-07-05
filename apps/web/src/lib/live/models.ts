// Main-thread facade over the model Web Worker. Downloads happen ONLY when
// loadModels() is called (on the user's click in the pre-call screen), reporting
// an aggregate progress bar. Everything is cached by the browser Cache API, so a
// second visit is instant.
export type LoadProgress = { pct: number; label: string };

let worker: Worker | null = null;
let ready = false;
let turnAvailable = false;
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
const files = new Map<string, { loaded: number; total: number }>();

export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function modelsReady(): boolean { return ready; }

export function loadModels(onProgress: (p: LoadProgress) => void): Promise<void> {
  if (ready) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./models.worker.ts", import.meta.url), { type: "module" });
    worker = w;
    w.onmessage = (e: MessageEvent) => {
      const m = e.data;
      switch (m.type) {
        case "progress": {
          const d = m.data;
          if (d?.file && d.total) {
            files.set(d.file, { loaded: d.loaded ?? 0, total: d.total });
            let load = 0, tot = 0;
            for (const f of files.values()) { load += Math.min(f.loaded, f.total); tot += f.total; }
            onProgress({ pct: tot ? load / tot : 0, label: d.file.split("/").pop() ?? "" });
          }
          break;
        }
        case "ready": ready = true; turnAvailable = !!m.turn; resolve(); break;
        case "result": { const p = pending.get(m.id); if (p) { pending.delete(m.id); p.resolve(m); } break; }
        case "error":
          if (m.id != null) { const p = pending.get(m.id); if (p) { pending.delete(m.id); p.reject(new Error(m.message)); } }
          else reject(new Error(m.message));
          break;
      }
    };
    w.onerror = (e) => reject(new Error(e.message || "model worker failed to load"));
    w.postMessage({ type: "load", device: hasWebGPU() ? "webgpu" : "wasm" });
  });
}

function call<T>(msg: any, transfer?: Transferable[]): Promise<T> {
  if (!worker) return Promise.reject(new Error("models not loaded"));
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ ...msg, id }, transfer ?? []);
  });
}

/** Transcribe a 16 kHz mono utterance → text. */
export async function stt(audio: Float32Array): Promise<string> {
  const m = await call<{ text: string }>({ type: "stt", audio });
  return m.text;
}

/** Synthesize a sentence → Float32 PCM + sample rate. */
export async function tts(text: string): Promise<{ audio: Float32Array; sampleRate: number }> {
  const m = await call<{ audio: Float32Array; sampleRate: number }>({ type: "tts", text });
  return { audio: m.audio, sampleRate: m.sampleRate };
}

/** Whether Smart-Turn v3 loaded (else the engine uses the silence heuristic). */
export function turnModelReady(): boolean { return turnAvailable; }

/** Semantic end-of-turn: is the user actually done? (Smart-Turn v3.) */
export async function turnComplete(audio: Float32Array): Promise<boolean> {
  const m = await call<{ complete: boolean }>({ type: "turn", audio });
  return m.complete;
}

/** Free the worker (WebGPU device + pipelines) — called on live-mode teardown. */
export function disposeModels() {
  try { worker?.postMessage({ type: "dispose" }); } catch { /* */ }
  try { worker?.terminate(); } catch { /* */ }
  worker = null; ready = false;
  files.clear();
  for (const p of pending.values()) p.reject(new Error("models disposed"));
  pending.clear();
}
