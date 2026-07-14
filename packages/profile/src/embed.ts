import type { GraphInput } from "@takt/db";

// Local embeddings via @huggingface/transformers (onnxruntime) — no hosted
// service, no key. Lazy-loaded and cached. If the dependency/model is
// unavailable, the layer degrades to null and callers fall back to lexical
// scoring — semantic search is an enhancement, never required. Vectors live
// as BLOBs on the KG rows themselves (entities/chunks/media in SQLite).

// Must match .env.example's TAKT_EMBED_MODEL — the ingest-time and query-time
// embedder MUST be the same model or the vectors are meaningless. Both are 384-dim.
const MODEL = process.env.TAKT_EMBED_MODEL ?? "Xenova/bge-small-en-v1.5"; // 384-dim
export const EMBED_DIM = 384;

let extractorPromise: Promise<((t: string) => Promise<Float32Array>) | null> | null = null;

/** Returns embed(text)→vector, or null if embeddings are unavailable. Cached. */
export async function getEmbedder(): Promise<((t: string) => Promise<Float32Array>) | null> {
  if (extractorPromise) return extractorPromise;
  extractorPromise = (async () => {
    try {
      const { pipeline } = await import("@huggingface/transformers" as string);
      const pipe = await pipeline("feature-extraction", MODEL);
      return async (text: string) => {
        const out = await pipe(text, { pooling: "mean", normalize: true });
        return new Float32Array(out.data as Float32Array);
      };
    } catch (e) {
      console.warn(`[index] embeddings unavailable (${(e as Error).message}); semantic search falls back to lexical.`);
      return null;
    }
  })();
  return extractorPromise;
}

/** Fill `.embedding` on every entity/chunk/media of a GraphInput IN PLACE so the
 *  KG rows carry their own vectors (the unified store). Returns false (no-op) if
 *  the embedder is unavailable — ingest then falls back to lexical-only, never
 *  fails. This runs BEFORE the linking cascade, which reuses these vectors to
 *  connect media to entities across modalities. */
export async function embedGraph(g: GraphInput): Promise<boolean> {
  const embed = await getEmbedder();
  if (!embed) return false;
  const jobs: { text: string; set: (v: Float32Array) => void }[] = [];
  for (const e of g.entities) {
    const text = `${e.name}. ${(e.aliases ?? []).join(", ")}. ${e.summary ?? ""}`.trim();
    if (text) jobs.push({ text, set: (v) => { e.embedding = v; } });
  }
  for (const c of g.chunks) if (c.text.trim()) jobs.push({ text: c.text, set: (v) => { c.embedding = v; } });
  for (const m of g.media) if (m.caption?.trim()) jobs.push({ text: m.caption, set: (v) => { m.embedding = v; } });
  for (const j of jobs) j.set(await embed(j.text.slice(0, 2000)));
  return true;
}
