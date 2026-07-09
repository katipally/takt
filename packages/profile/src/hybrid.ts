import { listConcepts } from "./store";
import { loadChunks, saveChunks, loadMedia } from "./index-store";
import { buildVectors, semanticSearch } from "./embed";
import type { Chunk, MediaItem } from "./types";

// Runtime retrieval over the compiled index, plus the ingest-time index build.
// No graph: chunks (grep + semantic) for text, a flat media index for visuals.

export interface SearchHit {
  conceptId: string;
  title: string;
  page?: number;
  text: string;
  score: number;
}

/** Split one concept body into ~page/section chunks. Bodies are a series of
 *  `## <label>` blocks (one per manual page or source section); each becomes a
 *  chunk, with the page number parsed from "Page N" labels. Pure — testable. */
export function splitConceptBody(conceptId: string, title: string, body: string): Chunk[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  // No `## ` structure (e.g. the overview concept) → one chunk for the whole body.
  if (!/^## /m.test(body)) return [{ id: conceptId, conceptId, title, text: trimmed }];
  const blocks = body.split(/^## /m).map((b) => b.trim()).filter(Boolean);
  const out: Chunk[] = [];
  blocks.forEach((block, i) => {
    const nl = block.indexOf("\n");
    const label = (nl === -1 ? block : block.slice(0, nl)).trim();
    const rest = (nl === -1 ? "" : block.slice(nl + 1)).trim();
    // strip a leading markdown image line so the chunk is text
    const text = rest.replace(/^!\[[^\]]*\]\([^)]*\)\s*/m, "").trim();
    if (!text) return;
    const pageMatch = label.match(/page\s+(\d+)/i);
    out.push({ id: `${conceptId}#${i}`, conceptId, title, page: pageMatch ? Number(pageMatch[1]) : undefined, text: `${label}\n${text}` });
  });
  return out;
}

/** Split all authored concepts into chunks. */
export function chunkConcepts(slug: string): Chunk[] {
  return listConcepts(slug).flatMap((c) => splitConceptBody(c.id, c.frontmatter.title ?? c.id, c.body));
}

/** Build the compiled index from authored markdown + a media index. Chunks the
 *  concepts, then embeds chunks AND media captions into one vector store so
 *  get_media is one cosine scan from the right figure/mesh/clip. Runs once at
 *  ingest — runtime does zero processing. */
export async function buildIndex(slug: string): Promise<{ chunks: number; embedded: boolean }> {
  const chunks = chunkConcepts(slug);
  saveChunks(slug, chunks);
  const media = loadMedia(slug);
  const embedded = await buildVectors(slug, [
    ...chunks.map((c) => ({ id: c.id, text: `${c.title}\n${c.text}`, kind: "chunk" })),
    ...media.map((m) => ({ id: m.id, text: `${m.caption}${m.subsystem ? ` (${m.subsystem})` : ""}`, kind: "media" })),
  ]);
  return { chunks: chunks.length, embedded };
}

const STOP = new Set(["the", "and", "for", "with", "you", "your", "what", "how", "should", "use", "this", "that", "from", "are", "can", "does", "when", "which", "where", "why", "into", "out", "get", "got", "need"]);

/** Hybrid text search over chunks: semantic similarity fused with query-TERM
 *  coverage (how many of the query's words a chunk contains). The term coverage is
 *  what makes a natural question like "PLA nozzle temperature" surface the material
 *  page even when the exact phrase never appears — the old whole-phrase grep matched
 *  nothing on multi-word queries, so weak semantic ranking leaked generic answers. */
export async function searchProduct(slug: string, query: string, k = 8): Promise<SearchHit[]> {
  const chunks = loadChunks(slug);
  const terms = [...new Set((query.toLowerCase().match(/[a-z0-9°.#/-]+/gi) ?? []).map((t) => t.toLowerCase()).filter((t) => t.length >= 3 && !STOP.has(t)))];

  const sem = await semanticSearch(slug, query, chunks.length, "chunk"); // score every chunk
  const semScore = new Map(sem?.map((s) => [s.id, s.score]) ?? []);

  const scored = chunks.map((c) => {
    const hay = `${c.title}\n${c.text}`.toLowerCase();
    const hits = terms.filter((t) => hay.includes(t)).length;
    const cover = terms.length ? hits / terms.length : 0;              // 0..1 query-term coverage
    // Coverage DOMINATES (a chunk that contains all the query words is what the
    // user means); semantic breaks ties and carries queries with no lexical hit.
    const s = cover * 1.0 + (semScore.get(c.id) ?? 0) * 0.45;
    return { c, s, cover };
  }).filter((x) => x.cover > 0 || x.s > 0.18);

  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map(({ c, s }) => ({ conceptId: c.conceptId, title: c.title, page: c.page, text: c.text.slice(0, 700), score: s }));
}

/** Find render-ready visuals for a query: semantic over media captions, with a
 *  lexical caption fallback. The canvas pulls these in so answers always have
 *  a figure / 3D part / video clip to show. */
export async function findMedia(slug: string, query: string, k = 6, kind?: MediaItem["kind"]): Promise<MediaItem[]> {
  const media = loadMedia(slug);
  if (!media.length) return [];
  const byId = new Map(media.map((m) => [m.id, m]));
  const sem = await semanticSearch(slug, query, k * 3, "media");
  let picks: MediaItem[];
  if (sem && sem.length) {
    picks = sem.map((h) => byId.get(h.id)).filter((m): m is MediaItem => !!m);
  } else {
    const q = query.toLowerCase();
    picks = media.filter((m) => m.caption.toLowerCase().includes(q) || m.subsystem?.toLowerCase().includes(q));
  }
  if (kind) picks = picks.filter((m) => m.kind === kind);
  return picks.slice(0, k);
}

// ── self-check: `tsx src/hybrid.ts` ──────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  const body = `## Page 12\n\n![Page 12](/assets/pages/x/12.png)\n\nNozzle temperature is 215°C for PLA.\n\n## Page 13\n\nBed leveling uses the load cell.`;
  const chunks = splitConceptBody("owner-manual", "Owner Manual", body);
  assert(chunks.length === 2, `two chunks, got ${chunks.length}`);
  assert(chunks[0]!.page === 12 && chunks[1]!.page === 13, "page numbers parsed");
  assert(!chunks[0]!.text.includes("!["), "leading image stripped from chunk text");
  assert(chunks[0]!.text.includes("215°C"), "body text retained");
  assert(chunks[0]!.id === "owner-manual#0", "chunk id shape");
  const empty = splitConceptBody("x", "X", "");
  assert(empty.length === 0, "empty body → no chunks");
  const noHead = splitConceptBody("y", "Y", "just a paragraph, no heading");
  assert(noHead.length === 1 && noHead[0]!.id === "y", "headingless body → single chunk");
  console.log("hybrid self-check ok");
}
