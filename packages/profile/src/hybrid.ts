import { listConcepts } from "./store";
import { grepProfile } from "./search";
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

/** Hybrid text search: semantic top-k over chunks fused with lexical grep hits
 *  (grep wins ties — exact matches like error codes matter). */
export async function searchProduct(slug: string, query: string, k = 8): Promise<SearchHit[]> {
  const chunks = loadChunks(slug);
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const scored = new Map<string, SearchHit>();

  const sem = await semanticSearch(slug, query, k * 2, "chunk");
  if (sem) for (const { id, score } of sem) {
    const c = byId.get(id);
    if (c) scored.set(id, { conceptId: c.conceptId, title: c.title, page: c.page, text: c.text.slice(0, 700), score });
  }

  // lexical grep boost — cheap exactness signal, and the fallback when no vectors
  for (const g of grepProfile(slug, query, { maxConcepts: k })) {
    const key = `grep:${g.conceptId}`;
    if (!scored.has(key)) {
      scored.set(key, { conceptId: g.conceptId, title: g.conceptTitle, text: g.hits[0]?.text ?? "", score: 0.5 + Math.min(0.4, g.count * 0.05) });
    }
  }

  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, k);
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
