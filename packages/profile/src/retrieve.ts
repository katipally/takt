import {
  loadGraph, loadChunks, getEntity, getEntityAnchors, neighbors, traverseToText,
  type ProductGraph, type Entity, type Chunk, type Anchor, normName,
} from "./pkb";
import { semanticSearch } from "./embed";

// The PKB's hybrid retrieval surface — one store, many access paths. Each
// function is best at a different query shape; the agent routes by shape, or
// calls queryProduct to fuse them:
//   grepProduct   — exact tokens (error codes, part numbers, torque values)
//   searchProduct — fuzzy natural-language symptoms (semantic, lexical fallback)
//   findEntity    — dual-level keyword → entities (+ their relations)
//   walkGraph     — "everything about this entity", token-budgeted
//   getAnchors    — render-ready multimodal refs for grounded artifacts
//   queryProduct  — mix fusion → one cited context block
// All degrade gracefully: no PKB yet → empty results (the agent still has the
// legacy grep_profile over raw markdown as a fallback).

// ── lexical over chunks (pure core) ──────────────────────────────────────────
export interface ChunkHit { chunk: Chunk; line: number; text: string; count: number }

function toRegExp(pattern: string): RegExp {
  try { return new RegExp(pattern, "i"); }
  catch { return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
}

export function grepChunks(chunks: Chunk[], pattern: string, max = 20): ChunkHit[] {
  const re = toRegExp(pattern);
  const hits: ChunkHit[] = [];
  for (const c of chunks) {
    const lines = c.text.split("\n");
    let count = 0, first = -1, firstText = "";
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i]!)) continue;
      count++;
      if (first === -1) { first = i + 1; firstText = lines[i]!.trim().slice(0, 240); }
    }
    if (count) hits.push({ chunk: c, line: first, text: firstText, count });
  }
  return hits.sort((a, b) => b.count - a.count).slice(0, max);
}

// ── entity scoring (pure core) ───────────────────────────────────────────────
function tokens(s: string): string[] {
  return normName(s).split(" ").filter((t) => t.length > 1);
}

export function scoreEntitiesLexical(entities: Entity[], keywords: string[]): { entity: Entity; score: number }[] {
  const kw = keywords.flatMap(tokens);
  if (!kw.length) return [];
  return entities.map((e) => {
    const hay = [e.name, ...(e.aliases ?? []), e.description].join(" ");
    const hayToks = new Set(tokens(hay));
    const nameToks = new Set(tokens([e.name, ...(e.aliases ?? [])].join(" ")));
    let score = 0;
    for (const k of kw) {
      if (nameToks.has(k)) score += 3;        // name/alias hit weighs most
      else if (hayToks.has(k)) score += 1;    // description hit
    }
    return { entity: e, score };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

// Dual-level (LightRAG): low-level keywords → entity match; high-level keywords →
// edge (relation) match, pulling in the entities those relations connect.
export function findEntitiesInGraph(g: ProductGraph, low: string[], high: string[]): Entity[] {
  const byLow = scoreEntitiesLexical(g.entities, low).map((r) => r.entity);
  const highToks = high.flatMap(tokens);
  const byHigh: Entity[] = [];
  if (highToks.length) {
    for (const edge of g.edges) {
      const hay = new Set(tokens(`${edge.type} ${edge.description ?? ""}`));
      if (!highToks.some((t) => hay.has(t))) continue;
      for (const id of [edge.src, edge.dst]) {
        const e = getEntity(g, id);
        if (e && !byHigh.includes(e)) byHigh.push(e);
      }
    }
  }
  const seen = new Set<string>();
  return [...byLow, ...byHigh].filter((e) => !seen.has(e.id) && seen.add(e.id));
}

// ── slug-bound async API (fs + semantic) ─────────────────────────────────────
export function grepProduct(slug: string, pattern: string, max = 20): ChunkHit[] {
  return grepChunks(loadChunks(slug), pattern, max);
}

export interface SearchHit { chunk: Chunk; score: number }

// Semantic first; if embeddings unavailable, fall back to lexical token overlap
// so the tool always returns something useful.
export async function searchProduct(slug: string, query: string, k = 8): Promise<SearchHit[]> {
  const chunks = loadChunks(slug);
  if (!chunks.length) return [];
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const sem = await semanticSearch(slug, query, k);
  if (sem) {
    return sem.map((s) => ({ chunk: byId.get(s.id), score: s.score }))
      .filter((h): h is SearchHit => !!h.chunk);
  }
  // lexical fallback: score by shared tokens
  const q = new Set(tokens(query));
  return chunks.map((c) => {
    const ct = tokens(c.text);
    let score = 0;
    for (const t of ct) if (q.has(t)) score++;
    return { chunk: c, score: score / Math.max(1, Math.sqrt(ct.length)) };
  }).filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

export async function findEntity(slug: string, low: string[], high: string[] = []): Promise<Entity[]> {
  const g = loadGraph(slug);
  const lexical = findEntitiesInGraph(g, low, high);
  // blend a semantic pass over entity descriptions when a vector store exists
  const sem = await semanticSearch(slug, [...low, ...high].join(" "), 8);
  if (!sem) return lexical.slice(0, 12);
  const semEntities = sem.map((s) => getEntity(g, s.id)).filter((e): e is Entity => !!e);
  const seen = new Set<string>();
  return [...lexical, ...semEntities].filter((e) => !seen.has(e.id) && seen.add(e.id)).slice(0, 12);
}

export function walkGraph(slug: string, id: string, opts: { edgeTypes?: string[]; depth?: number; budget?: number } = {}): string {
  return traverseToText(loadGraph(slug), id, opts);
}

export function getAnchors(slug: string, id: string): Anchor[] {
  return getEntityAnchors(loadGraph(slug), id);
}

// Mix fusion → one cited context block. Combines: semantic/lexical chunks +
// dual-level entity hits + a one-hop graph expansion around the top entity.
export interface QueryResult { context: string; entities: Entity[]; chunks: Chunk[] }

export async function queryProduct(slug: string, query: string, opts: { budget?: number } = {}): Promise<QueryResult> {
  const budget = opts.budget ?? 6000;
  const g = loadGraph(slug);
  const low = tokens(query);
  const entities = findEntitiesInGraph(g, low, low).slice(0, 6);
  const chunkHits = await searchProduct(slug, query, 6);

  const parts: string[] = [];
  if (entities.length) {
    parts.push("## Product graph");
    for (const e of entities.slice(0, 3)) parts.push(traverseToText(g, e.id, { depth: 1, budget: 900 }));
  }
  if (chunkHits.length) {
    parts.push("## Sources");
    for (const h of chunkHits) {
      const cite = h.chunk.page ? ` [p.${h.chunk.page}]` : ` [${h.chunk.conceptId}]`;
      parts.push(`### ${h.chunk.title}${cite}\n${h.chunk.text.slice(0, 800)}`);
    }
  }
  let context = "";
  for (const p of parts) {
    if (context.length + p.length > budget) break;
    context += (context ? "\n\n" : "") + p;
  }
  return { context: context || "(no matching product knowledge found)", entities, chunks: chunkHits.map((h) => h.chunk) };
}

// ── self-check: `tsx src/retrieve.ts` ────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };

  const chunks: Chunk[] = [
    { id: "owner#p42", conceptId: "owner", title: "Maintenance", text: "Error 12: filament jam.\nClear with a cold pull.", page: 42, manualKind: "owner" },
    { id: "owner#p10", conceptId: "owner", title: "Setup", text: "Load the spool onto the holder.", page: 10, manualKind: "owner" },
  ];
  const grep = grepChunks(chunks, "Error 12");
  assert(grep.length === 1 && grep[0]!.chunk.page === 42, "grepChunks finds exact code on the right page");

  const g: ProductGraph = {
    version: 1,
    entities: [
      { id: "fault:jam", name: "Filament jam", aliases: ["clog"], type: "Fault", description: "extruder stops feeding", confidence: "EXTRACTED", source_ids: ["owner#p42"], anchors: [] },
      { id: "proc:cold-pull", name: "Cold pull", type: "Procedure", description: "heat then yank filament", confidence: "EXTRACTED", source_ids: [], anchors: [] },
    ],
    edges: [{ id: "e1", src: "fault:jam", dst: "proc:cold-pull", type: "fixes", description: "resolves the clog", confidence: "EXTRACTED", source_ids: [] }],
    anchors: [], hyperedges: [],
  };
  const byLow = scoreEntitiesLexical(g.entities, ["clog"]);
  assert(byLow[0]?.entity.id === "fault:jam", "low-level keyword matches entity by alias");
  const dual = findEntitiesInGraph(g, ["jam"], ["fixes"]);
  assert(dual.some((e) => e.id === "proc:cold-pull"), "high-level keyword pulls the fixing procedure via the edge");

  console.log("retrieve self-check ok");
}
