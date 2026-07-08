import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { indexDir } from "./index-store";

// Local embeddings via @huggingface/transformers (same onnxruntime stack as the
// live-voice models) — no hosted service, no key. Lazy-loaded and cached. If the
// dependency/model is unavailable, the layer degrades to null and callers fall
// back to lexical scoring — semantic search is an enhancement, never required.
//
// Vectors are stored as a flat Float32Array on disk (vectors.bin) with a small
// JSON sidecar (vectors.meta.json: {model, dim, ids, kinds}). The whole store is
// loaded ONCE per process and cached — the old design JSON-parsed and linearly
// rescanned a 15 MB file on every query, which was the single worst runtime cost.

const MODEL = process.env.TAKT_EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2"; // 384-dim
export const EMBED_DIM = 384;

interface VectorStore {
  model: string;
  dim: number;
  ids: string[];
  kinds: string[];      // parallel to ids: "chunk" | "media"
  data: Float32Array;   // ids.length * dim, unit-normalized, row-major
}

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

// ── binary vector store IO ─────────────────────────────────────────────────
function binPath(slug: string) { return join(indexDir(slug), "vectors.bin"); }
function metaPath(slug: string) { return join(indexDir(slug), "vectors.meta.json"); }

const cache = new Map<string, VectorStore | null>();

/** Load a product's vector store into memory once; cached across queries. */
export function loadVectors(slug: string): VectorStore | null {
  if (cache.has(slug)) return cache.get(slug)!;
  let store: VectorStore | null = null;
  try {
    if (existsSync(binPath(slug)) && existsSync(metaPath(slug))) {
      const meta = JSON.parse(readFileSync(metaPath(slug), "utf8")) as { model: string; dim: number; ids: string[]; kinds: string[] };
      const buf = readFileSync(binPath(slug));
      const data = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      store = { ...meta, data };
    }
  } catch { store = null; }
  cache.set(slug, store);
  return store;
}

function saveVectors(slug: string, store: VectorStore): void {
  mkdirSync(indexDir(slug), { recursive: true });
  writeFileSync(binPath(slug), Buffer.from(store.data.buffer, store.data.byteOffset, store.data.byteLength));
  writeFileSync(metaPath(slug), JSON.stringify({ model: store.model, dim: store.dim, ids: store.ids, kinds: store.kinds }));
  cache.set(slug, store);
}

/** Build (or rebuild) the vector store from {id, text, kind}. No-op → null if
 *  embeddings are unavailable, so ingest never fails on this. */
export async function buildVectors(slug: string, entries: { id: string; text: string; kind: string }[]): Promise<boolean> {
  const embed = await getEmbedder();
  if (!embed) return false;
  const rows = entries.filter((e) => e.text.trim());
  const data = new Float32Array(rows.length * EMBED_DIM);
  const ids: string[] = [];
  const kinds: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = await embed(rows[i]!.text.slice(0, 2000));
    data.set(v.subarray(0, EMBED_DIM), i * EMBED_DIM);
    ids.push(rows[i]!.id);
    kinds.push(rows[i]!.kind);
  }
  saveVectors(slug, { model: MODEL, dim: EMBED_DIM, ids, kinds, data });
  return true;
}

/** Semantic search: top-k {id, score}, optionally filtered to one kind
 *  ("chunk" | "media"). Dot product over the cached typed array (vectors are
 *  unit-normalized). Null if no store or no embedder. */
export async function semanticSearch(slug: string, query: string, k = 8, kind?: string): Promise<{ id: string; score: number }[] | null> {
  const store = loadVectors(slug);
  const embed = await getEmbedder();
  if (!store || !embed) return null;
  const q = await embed(query);
  const { dim, ids, kinds, data } = store;
  const hits: { id: string; score: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (kind && kinds[i] !== kind) continue;
    let s = 0;
    const base = i * dim;
    for (let j = 0; j < dim; j++) s += q[j]! * data[base + j]!;
    hits.push({ id: ids[i]!, score: s });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}
