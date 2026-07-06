import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pkbDir } from "./pkb";

// Semantic ("mgrep") layer for the PKB. Embeddings run LOCALLY via
// @huggingface/transformers (the same onnxruntime stack the live-voice models
// use) — no hosted service, no key. The model is lazy-loaded on first use and
// cached. If the dependency/model isn't available (e.g. offline first run), the
// whole layer degrades to null and retrieve.ts falls back to lexical scoring —
// semantic search is an enhancement, never a hard requirement.

const MODEL = process.env.TAKT_EMBED_MODEL ?? "Xenova/all-MiniLM-L6-v2"; // 384-dim, small
export const EMBED_DIM_HINT = 384;

export interface VectorStore {
  model: string;
  ids: string[];        // parallel to `vectors`; a chunk id or entity id
  vectors: number[][];  // unit-normalized
}

let extractorPromise: Promise<((t: string) => Promise<number[]>) | null> | null = null;

// Returns an embed(text)→vector fn, or null if embeddings are unavailable.
// Cached across calls; a failed load is remembered as null (no retry storms).
export async function getEmbedder(): Promise<((t: string) => Promise<number[]>) | null> {
  if (extractorPromise) return extractorPromise;
  extractorPromise = (async () => {
    try {
      // dynamic import so packages that never embed don't pay the load cost
      const { pipeline } = await import("@huggingface/transformers" as string);
      const pipe = await pipeline("feature-extraction", MODEL);
      return async (text: string) => {
        const out = await pipe(text, { pooling: "mean", normalize: true });
        return Array.from(out.data as Float32Array);
      };
    } catch (e) {
      console.warn(`[pkb] embeddings unavailable (${(e as Error).message}); semantic search falls back to lexical.`);
      return null;
    }
  })();
  return extractorPromise;
}

export function cosine(a: number[], b: number[]): number {
  // vectors are unit-normalized at build/query time → dot product = cosine
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

// ── vector store IO ──────────────────────────────────────────────────────────
export function vectorsPath(slug: string): string {
  return join(pkbDir(slug), "vectors.json");
}
export function loadVectors(slug: string): VectorStore | null {
  const p = vectorsPath(slug);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")) as VectorStore; } catch { return null; }
}
export function saveVectors(slug: string, store: VectorStore): void {
  const p = vectorsPath(slug);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, JSON.stringify(store));
}

// Build (or rebuild) the vector store from {id → text} entries. No-op returning
// null if embeddings are unavailable, so ingest never fails on this.
export async function buildVectors(slug: string, entries: { id: string; text: string }[]): Promise<VectorStore | null> {
  const embed = await getEmbedder();
  if (!embed) return null;
  const ids: string[] = [];
  const vectors: number[][] = [];
  for (const e of entries) {
    if (!e.text.trim()) continue;
    ids.push(e.id);
    vectors.push(await embed(e.text.slice(0, 2000)));
  }
  const store: VectorStore = { model: MODEL, ids, vectors };
  saveVectors(slug, store);
  return store;
}

// Semantic search: returns top-k {id, score}. Null if no store/embedder.
export async function semanticSearch(slug: string, query: string, k = 8): Promise<{ id: string; score: number }[] | null> {
  const store = loadVectors(slug);
  const embed = await getEmbedder();
  if (!store || !embed) return null;
  const q = await embed(query);
  return store.ids
    .map((id, i) => ({ id, score: cosine(q, store.vectors[i]!) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
