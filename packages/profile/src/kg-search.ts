import {
  ftsChunks, ftsMedia, ftsEntities, semanticSearchKg,
  getChunks, getMedia, getEntities,
  type KgChunk, type KgMedia, type Entity,
} from "@takt/db";
import { getEmbedder } from "./embed";

// Hybrid retrieval over the UNIFIED knowledge graph: FTS5 (lexical) fused with
// in-DB embedding cosine (semantic) by reciprocal-rank fusion. One store answers
// both — the old markdown-chunk flat index (hybrid.ts) is retired for these paths.
// Lexical-only when the embedder is unavailable (semantic list is just empty).

const RRF_K = 60; // RRF damping — a rank-r hit contributes 1/(RRF_K+r)

function rrf(lists: string[][], k: number): string[] {
  const score = new Map<string, number>();
  for (const list of lists) list.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 / (RRF_K + i)));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([id]) => id);
}

async function embedQuery(q: string): Promise<Float32Array | null> {
  const e = await getEmbedder();
  return e ? await e(q.slice(0, 2000)) : null;
}

// Query-term coverage: how many of the question's MEANINGFUL words a chunk
// contains. On natural questions ("what temperature does PLA print at?") the
// OR-ed FTS + cosine blend lets a chunk rich in one common word ("print",
// "temperature") outrank the one section that has ALL the terms — coverage
// dominating is what makes the PLA guide beat the first-print page. Same fix
// the retired flat index carried; re-applied to the KG path.
const STOP = new Set(["the", "and", "for", "with", "you", "your", "what", "how", "should", "use", "this", "that", "from", "are", "can", "does", "when", "which", "where", "why", "into", "out", "get", "got", "need", "print", "prints"]);
function queryTerms(q: string): string[] {
  return [...new Set((q.toLowerCase().match(/[a-z0-9°.#/-]+/g) ?? []).filter((t) => t.length >= 3 && !STOP.has(t)))];
}

/** Hybrid chunk search — passages for a symptom/spec/free-text query. */
export async function searchChunks(productId: string, query: string, k = 8): Promise<KgChunk[]> {
  const lex = ftsChunks(productId, query, k * 3).map((h) => h.id);
  const qv = await embedQuery(query);
  const sem = qv ? semanticSearchKg(productId, qv, "chunk", k * 3).map((h) => h.id) : [];
  const ids = rrf([lex, sem], k * 3);
  const byId = new Map(getChunks(ids).map((c) => [c.id, c]));
  const terms = queryTerms(query);
  // Coverage DOMINATES; the fused rank only breaks ties among equal coverage.
  const ranked = ids
    .map((id, i) => ({ c: byId.get(id), i }))
    .filter((x): x is { c: KgChunk; i: number } => !!x.c)
    .map(({ c, i }) => {
      const hay = c.text.toLowerCase();
      const cover = terms.length ? terms.filter((t) => hay.includes(t)).length / terms.length : 0;
      return { c, s: cover + (1 - i / (ids.length || 1)) * 0.45 };
    })
    .sort((a, b) => b.s - a.s);
  return ranked.slice(0, k).map((x) => x.c);
}

/** Hybrid media search — the figure/3D/video/image to SHOW. Surfaces cross-modal
 *  links the ingest cascade added (media whose caption never named the part). */
export async function searchKgMedia(productId: string, query: string, k = 6, kind?: KgMedia["kind"]): Promise<KgMedia[]> {
  const lex = ftsMedia(productId, query, k * 3).map((h) => h.id);
  const qv = await embedQuery(query);
  const sem = qv ? semanticSearchKg(productId, qv, "media", k * 3).map((h) => h.id) : [];
  const ids = rrf([lex, sem], k * 3);
  const byId = new Map(getMedia(ids).map((m) => [m.id, m]));
  let picks = ids.map((id) => byId.get(id)).filter((m): m is KgMedia => !!m);
  if (kind) picks = picks.filter((m) => m.kind === kind);
  return picks.slice(0, k);
}

/** Hybrid entity resolution — layman words → parts/symptoms/specs/procedures. */
export async function searchEntities(productId: string, query: string, k = 8): Promise<Entity[]> {
  const lex = ftsEntities(productId, query, k * 2).map((h) => h.id);
  const qv = await embedQuery(query);
  const sem = qv ? semanticSearchKg(productId, qv, "entity", k * 2).map((h) => h.id) : [];
  const ids = rrf([lex, sem], k);
  const byId = new Map(getEntities(ids).map((e) => [e.id, e]));
  return ids.map((id) => byId.get(id)).filter((e): e is Entity => !!e);
}
