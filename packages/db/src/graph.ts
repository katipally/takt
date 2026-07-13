import { randomUUID, createHash } from "node:crypto";
import { getDb } from "./connection";

// The knowledge-graph data layer: typed entities + edges + retrievable chunks +
// render-ready media for a product. Written wholesale at ingest (one product's
// graph is replaced transactionally), queried cheaply at runtime (FTS + graph
// traversal — no LLM). Vectors live beside this in the profile package.

const db = () => getDb();

// In-memory vector store, loaded once per product from the embedding BLOBs and
// cached (invalidated when the product's graph is replaced). This is the whole
// "semantic store" — no external vector DB, no on-disk vectors.bin; the KG rows
// ARE the index. Fine for single-product scale (hundreds–thousands of rows).
type VecStore = { ids: string[]; kinds: string[]; data: Float32Array; dim: number };
const vecCache = new Map<string, VecStore | null>();

function loadProductVectors(productId: string): VecStore | null {
  const hit = vecCache.get(productId);
  if (hit !== undefined) return hit;
  const rows = [
    ...db().prepare(`SELECT id, 'entity' AS kind, embedding FROM entities  WHERE product_id=? AND embedding IS NOT NULL`).all(productId),
    ...db().prepare(`SELECT id, 'chunk'  AS kind, embedding FROM kg_chunks WHERE product_id=? AND embedding IS NOT NULL`).all(productId),
    ...db().prepare(`SELECT id, 'media'  AS kind, embedding FROM kg_media  WHERE product_id=? AND embedding IS NOT NULL`).all(productId),
  ] as { id: string; kind: string; embedding: Buffer }[];
  if (!rows.length) { vecCache.set(productId, null); return null; }
  const dim = rows[0]!.embedding.byteLength / 4;
  const data = new Float32Array(rows.length * dim);
  const ids: string[] = []; const kinds: string[] = [];
  rows.forEach((r, i) => {
    const v = new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4);
    if (v.length === dim) data.set(v, i * dim);
    ids.push(r.id); kinds.push(r.kind);
  });
  const store: VecStore = { ids, kinds, data, dim };
  vecCache.set(productId, store);
  return store;
}

/** Semantic search over the KG: cosine (dot, vectors are unit-normalized) of the
 *  query vector against entity/chunk/media embeddings. Empty if no vectors yet
 *  (caller falls back to FTS). `kind` filters to one row type. */
export function semanticSearchKg(productId: string, q: Float32Array, kind?: "entity" | "chunk" | "media", k = 8): FtsHit[] {
  const store = loadProductVectors(productId);
  if (!store || q.length !== store.dim) return [];
  const { ids, kinds, data, dim } = store;
  const hits: FtsHit[] = [];
  for (let i = 0; i < ids.length; i++) {
    if (kind && kinds[i] !== kind) continue;
    let s = 0; const base = i * dim;
    for (let j = 0; j < dim; j++) s += q[j]! * data[base + j]!;
    hits.push({ id: ids[i]!, score: s });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, k);
}

export type EntityType =
  | "part" | "assembly" | "procedure" | "step" | "symptom" | "spec"
  | "warning" | "setting" | "compatibility" | "figure" | "region"
  | "model_part" | "video_clip" | "term";

export type EdgeRel =
  | "part_of" | "connects_to" | "requires" | "fixes" | "causes" | "shown_in"
  | "located_on" | "compatible_with" | "step_of" | "references" | "depicts";

export interface Entity {
  id: string;
  productId: string;
  type: EntityType;
  name: string;
  aliases: string[];
  summary: string;
  attrs: Record<string, unknown>;
  manualId?: string | null;
  page?: number | null;
  contentHash?: string | null;
  embedding?: Float32Array | null;   // name+summary vector, written at ingest
}

export interface Edge {
  id: string;
  productId: string;
  src: string;
  dst: string;
  rel: EdgeRel;
  provenance: "EXTRACTED" | "INFERRED";
  weight: number;
  page?: number | null;
}

export type KgMediaKind = "figure" | "page" | "region" | "mesh" | "video_clip" | "image";

export interface KgChunk {
  id: string;
  productId: string;
  entityId?: string | null;
  manualId?: string | null;
  page?: number | null;
  kind: string;
  text: string;
  embedding?: Float32Array | null;
}

export interface KgMedia {
  id: string;
  productId: string;
  entityId?: string | null;
  kind: KgMediaKind;
  assetUrl: string;
  caption: string;
  subsystem?: string | null;
  bbox?: unknown;         // structured crop {page,x,y,w,h,expected_labels[]}
  contentHash?: string | null;
  embedding?: Float32Array | null;
}

export interface GraphInput {
  entities: Entity[];
  edges: Edge[];
  chunks: KgChunk[];
  media: KgMedia[];
}

/** Stable content hash so re-ingest can skip unchanged inputs. */
export function contentHash(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

// ─── Write (ingest) ──────────────────────────────────────────────────────────

/** Replace a product's ENTIRE graph transactionally. Deletes the old entities/
 *  edges/chunks/media (and their FTS rows), then inserts the fresh set — so a
 *  re-ingest never leaves orphan rows or stale text (the old COALESCE bug). */
/** Float32 vector → BLOB Buffer (little-endian) for SQLite, or null. */
const vecToBlob = (v?: Float32Array | null): Buffer | null =>
  v && v.length ? Buffer.from(v.buffer, v.byteOffset, v.byteLength) : null;

export const replaceProductGraph = (productId: string, g: GraphInput): void => {
  const h = db();
  vecCache.delete(productId); // vectors change wholesale with the graph
  const tx = h.transaction((pid: string, input: GraphInput) => {
    for (const t of ["edges", "entities", "kg_chunks", "kg_media"]) {
      h.prepare(`DELETE FROM ${t} WHERE product_id = ?`).run(pid);
    }
    for (const t of ["chunks_fts", "media_fts", "entities_fts"]) {
      h.prepare(`DELETE FROM ${t} WHERE product_id = ?`).run(pid);
    }

    const insEnt = h.prepare(
      `INSERT INTO entities (id, product_id, type, name, aliases_json, summary, attrs_json, manual_id, page, content_hash, embedding)
       VALUES (@id,@productId,@type,@name,@aliases,@summary,@attrs,@manualId,@page,@contentHash,@embedding)`);
    const insEntFts = h.prepare(`INSERT INTO entities_fts (entity_id, product_id, name, aliases, summary) VALUES (?,?,?,?,?)`);
    for (const e of input.entities) {
      insEnt.run({
        id: e.id, productId: pid, type: e.type, name: e.name,
        aliases: JSON.stringify(e.aliases ?? []), summary: e.summary ?? "",
        attrs: JSON.stringify(e.attrs ?? {}), manualId: e.manualId ?? null,
        page: e.page ?? null, contentHash: e.contentHash ?? null, embedding: vecToBlob(e.embedding),
      });
      insEntFts.run(e.id, pid, e.name, (e.aliases ?? []).join(" "), e.summary ?? "");
    }

    const insEdge = h.prepare(
      `INSERT INTO edges (id, product_id, src, dst, rel, provenance, weight, page)
       VALUES (@id,@productId,@src,@dst,@rel,@provenance,@weight,@page)`);
    for (const ed of input.edges) {
      insEdge.run({
        id: ed.id, productId: pid, src: ed.src, dst: ed.dst, rel: ed.rel,
        provenance: ed.provenance ?? "EXTRACTED", weight: ed.weight ?? 1, page: ed.page ?? null,
      });
    }

    const insChunk = h.prepare(
      `INSERT INTO kg_chunks (id, product_id, entity_id, manual_id, page, kind, text, embedding)
       VALUES (@id,@productId,@entityId,@manualId,@page,@kind,@text,@embedding)`);
    const insChunkFts = h.prepare(`INSERT INTO chunks_fts (chunk_id, product_id, text) VALUES (?,?,?)`);
    for (const c of input.chunks) {
      insChunk.run({
        id: c.id, productId: pid, entityId: c.entityId ?? null, manualId: c.manualId ?? null,
        page: c.page ?? null, kind: c.kind ?? "page", text: c.text, embedding: vecToBlob(c.embedding),
      });
      insChunkFts.run(c.id, pid, c.text);
    }

    const insMedia = h.prepare(
      `INSERT INTO kg_media (id, product_id, entity_id, kind, asset_url, caption, subsystem, bbox_json, content_hash, embedding)
       VALUES (@id,@productId,@entityId,@kind,@assetUrl,@caption,@subsystem,@bbox,@contentHash,@embedding)`);
    const insMediaFts = h.prepare(`INSERT INTO media_fts (media_id, product_id, caption) VALUES (?,?,?)`);
    for (const m of input.media) {
      insMedia.run({
        id: m.id, productId: pid, entityId: m.entityId ?? null, kind: m.kind, assetUrl: m.assetUrl,
        caption: m.caption ?? "", subsystem: m.subsystem ?? null,
        bbox: m.bbox != null ? JSON.stringify(m.bbox) : null, contentHash: m.contentHash ?? null,
        embedding: vecToBlob(m.embedding),
      });
      insMediaFts.run(m.id, pid, m.caption ?? "");
    }
  });
  tx(productId, g);
};

export const newId = (): string => randomUUID();

// ─── Read (runtime) ──────────────────────────────────────────────────────────

/** Sanitize free text into a safe FTS5 MATCH query: alnum tokens OR-ed, each
 *  quoted (so punctuation/part-numbers never trip FTS syntax) with prefix `*`. */
export function ftsQuery(raw: string): string {
  const toks = (raw.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length >= 2);
  if (!toks.length) return "";
  return [...new Set(toks)].map((t) => `"${t}"*`).join(" OR ");
}

export interface FtsHit { id: string; score: number }

function ftsSearch(table: string, idCol: string, textExpr: string, productId: string, query: string, k: number): FtsHit[] {
  const match = ftsQuery(query);
  if (!match) return [];
  // bm25() is lower-is-better; flip so higher = more relevant for downstream fusion.
  const rows = db().prepare(
    `SELECT ${idCol} AS id, bm25(${table}) AS rank FROM ${table}
     WHERE product_id = ? AND ${table} MATCH ? ORDER BY rank LIMIT ?`,
  ).all(productId, match, k) as { id: string; rank: number }[];
  void textExpr;
  return rows.map((r) => ({ id: r.id, score: -r.rank }));
}

export const ftsChunks = (productId: string, query: string, k = 12): FtsHit[] =>
  ftsSearch("chunks_fts", "chunk_id", "text", productId, query, k);
export const ftsMedia = (productId: string, query: string, k = 12): FtsHit[] =>
  ftsSearch("media_fts", "media_id", "caption", productId, query, k);
export const ftsEntities = (productId: string, query: string, k = 12): FtsHit[] =>
  ftsSearch("entities_fts", "entity_id", "name", productId, query, k);

function rowToEntity(r: any): Entity {
  return {
    id: r.id, productId: r.product_id, type: r.type, name: r.name,
    aliases: safeParse(r.aliases_json, []), summary: r.summary,
    attrs: safeParse(r.attrs_json, {}), manualId: r.manual_id, page: r.page, contentHash: r.content_hash,
  };
}
const safeParse = (s: string | null, fallback: any) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

export function getEntity(id: string): Entity | undefined {
  const r = db().prepare(`SELECT * FROM entities WHERE id = ?`).get(id);
  return r ? rowToEntity(r) : undefined;
}

export function getEntities(ids: string[]): Entity[] {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  return (db().prepare(`SELECT * FROM entities WHERE id IN (${ph})`).all(...ids) as any[]).map(rowToEntity);
}

export function getEntitiesByType(productId: string, type: EntityType): Entity[] {
  return (db().prepare(`SELECT * FROM entities WHERE product_id = ? AND type = ? ORDER BY name`).all(productId, type) as any[]).map(rowToEntity);
}

/** Resolve a layman/technical term to entities: FTS over name+aliases+summary. */
export function findEntity(productId: string, term: string, k = 8): Entity[] {
  const hits = ftsEntities(productId, term, k);
  return getEntities(hits.map((h) => h.id));
}

/** Graph traversal: entities one hop from `entityId` (either direction),
 *  optionally filtered to one relation. Returns the neighbor + the edge. */
export function neighbors(entityId: string, rel?: EdgeRel): { edge: Edge; entity: Entity }[] {
  const relClause = rel ? "AND rel = ?" : "";
  const args = rel ? [entityId, entityId, rel] : [entityId, entityId];
  const rows = db().prepare(
    `SELECT * FROM edges WHERE (src = ? OR dst = ?) ${relClause}`,
  ).all(...args) as any[];
  const out: { edge: Edge; entity: Entity }[] = [];
  for (const r of rows) {
    const edge: Edge = { id: r.id, productId: r.product_id, src: r.src, dst: r.dst, rel: r.rel, provenance: r.provenance, weight: r.weight, page: r.page };
    const otherId = edge.src === entityId ? edge.dst : edge.src;
    const entity = getEntity(otherId);
    if (entity) out.push({ edge, entity });
  }
  return out;
}

/** Shortest path between two entities over the (small) product graph. BFS in JS
 *  — the graph is a few thousand edges at most. Returns the entity chain. */
export function trace(productId: string, fromId: string, toId: string, maxDepth = 6): Entity[] | null {
  if (fromId === toId) { const e = getEntity(fromId); return e ? [e] : null; }
  const rows = db().prepare(`SELECT src, dst FROM edges WHERE product_id = ?`).all(productId) as { src: string; dst: string }[];
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => { (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b); };
  for (const { src, dst } of rows) { link(src, dst); link(dst, src); }
  const prev = new Map<string, string>();
  const q = [fromId]; const seen = new Set([fromId]); let depth = 0;
  while (q.length && depth <= maxDepth) {
    const next: string[] = [];
    for (const cur of q) {
      for (const nb of adj.get(cur) ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb); prev.set(nb, cur);
        if (nb === toId) {
          const path: string[] = [toId]; let p = toId;
          while (prev.has(p)) { p = prev.get(p)!; path.unshift(p); }
          return getEntities(path).sort((a, b) => path.indexOf(a.id) - path.indexOf(b.id));
        }
        next.push(nb);
      }
    }
    q.length = 0; q.push(...next); depth++;
  }
  return null;
}

function rowToMedia(r: any): KgMedia {
  return {
    id: r.id, productId: r.product_id, entityId: r.entity_id, kind: r.kind, assetUrl: r.asset_url,
    caption: r.caption, subsystem: r.subsystem, bbox: safeParse(r.bbox_json, null), contentHash: r.content_hash,
  };
}

export function getMedia(ids: string[]): KgMedia[] {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  return (db().prepare(`SELECT * FROM kg_media WHERE id IN (${ph})`).all(...ids) as any[]).map(rowToMedia);
}

export function getMediaByEntity(entityId: string): KgMedia[] {
  return (db().prepare(`SELECT * FROM kg_media WHERE entity_id = ?`).all(entityId) as any[]).map(rowToMedia);
}

export function listMedia(productId: string): KgMedia[] {
  return (db().prepare(`SELECT * FROM kg_media WHERE product_id = ?`).all(productId) as any[]).map(rowToMedia);
}

export interface KgChunkRow extends KgChunk {}
export function getChunks(ids: string[]): KgChunk[] {
  if (!ids.length) return [];
  const ph = ids.map(() => "?").join(",");
  return (db().prepare(`SELECT id, product_id AS productId, entity_id AS entityId, manual_id AS manualId, page, kind, text FROM kg_chunks WHERE id IN (${ph})`).all(...ids) as any[]);
}
export function listChunks(productId: string): KgChunk[] {
  return db().prepare(`SELECT id, product_id AS productId, entity_id AS entityId, manual_id AS manualId, page, kind, text FROM kg_chunks WHERE product_id = ?`).all(productId) as any[];
}

/** Admin: graph size + health for a product. */
export function graphStats(productId: string): { entities: number; edges: number; chunks: number; media: number; byType: Record<string, number> } {
  const one = (sql: string) => (db().prepare(sql).get(productId) as { n: number }).n;
  const byType = db().prepare(`SELECT type, COUNT(*) AS n FROM entities WHERE product_id = ? GROUP BY type`).all(productId) as { type: string; n: number }[];
  return {
    entities: one(`SELECT COUNT(*) AS n FROM entities WHERE product_id = ?`),
    edges: one(`SELECT COUNT(*) AS n FROM edges WHERE product_id = ?`),
    chunks: one(`SELECT COUNT(*) AS n FROM kg_chunks WHERE product_id = ?`),
    media: one(`SELECT COUNT(*) AS n FROM kg_media WHERE product_id = ?`),
    byType: Object.fromEntries(byType.map((r) => [r.type, r.n])),
  };
}

export function graphExists(productId: string): boolean {
  return (db().prepare(`SELECT 1 FROM entities WHERE product_id = ? LIMIT 1`).get(productId)) != null;
}

// ── self-check: `TAKT_DATA_DIR=/tmp/takt-graph-selfcheck tsx src/graph.ts` ────
// Run with a throwaway TAKT_DATA_DIR (paths resolve at import, so it MUST be set
// in the environment, not here) to avoid touching the real catalog.
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.TAKT_DATA_DIR || /\/data\/?$/.test(process.env.TAKT_DATA_DIR)) {
    console.error("refusing to run self-check without a throwaway TAKT_DATA_DIR"); process.exit(1);
  }
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  const h = db();
  h.prepare(`INSERT INTO products (id, slug, name) VALUES (?,?,?)`).run("p1", "test-prod", "Test Product");

  const [extruder, gear, clickFix, symptom] = ["e-ext", "e-gear", "e-fix", "e-sym"];
  replaceProductGraph("p1", {
    entities: [
      { id: extruder, productId: "p1", type: "part", name: "Extruder", aliases: ["hotend feeder"], summary: "Pushes filament", attrs: {} },
      { id: gear, productId: "p1", type: "part", name: "Bondtech gear", aliases: ["drive gear", "feeder gear"], summary: "Grips filament", attrs: { part_number: "BT-01" } },
      { id: symptom, productId: "p1", type: "symptom", name: "Extruder clicking", aliases: ["clicking noise", "clicking sound"], summary: "Skipping while feeding", attrs: {} },
      { id: clickFix, productId: "p1", type: "procedure", name: "Clear a clog", aliases: [], summary: "Cold pull to clear the nozzle", attrs: {} },
    ],
    edges: [
      { id: "x1", productId: "p1", src: gear, dst: extruder, rel: "part_of", provenance: "EXTRACTED", weight: 1 },
      { id: "x2", productId: "p1", src: symptom, dst: extruder, rel: "located_on", provenance: "EXTRACTED", weight: 1 },
      { id: "x3", productId: "p1", src: clickFix, dst: symptom, rel: "fixes", provenance: "EXTRACTED", weight: 1 },
    ],
    chunks: [
      { id: "c1", productId: "p1", entityId: extruder, page: 12, kind: "page", text: "The extruder pushes filament through the hotend at 215C for PLA." },
      { id: "c2", productId: "p1", entityId: clickFix, page: 40, kind: "procedure", text: "To clear a clog do a cold pull: heat, then yank the filament out." },
    ],
    media: [
      { id: "m1", productId: "p1", entityId: extruder, kind: "figure", assetUrl: "/assets/pages/x/12.png", caption: "Exploded view of the extruder assembly" },
    ],
  });

  // layman term resolves to the right entity
  const found = findEntity("p1", "clicking noise");
  assert(found.some((e) => e.id === symptom), "layman 'clicking noise' resolves to symptom entity");

  // FTS grep finds the spec chunk
  assert(ftsChunks("p1", "PLA temperature").some((hit) => hit.id === "c1"), "FTS finds the temperature chunk");

  // graph traversal: symptom's neighbors include the located_on part
  assert(neighbors(symptom).some((n) => n.entity.id === extruder), "symptom neighbor is the extruder");

  // trace: from symptom → fix procedure (sym → fixes edge)
  const path = trace("p1", clickFix, gear);
  assert(!!path && path.some((e) => e.id === extruder), "trace fix→gear passes through extruder");

  // media linked to entity
  assert(getMediaByEntity(extruder).length === 1, "figure linked to extruder");

  // re-ingest replaces cleanly (no orphans / no dup)
  replaceProductGraph("p1", { entities: [{ id: extruder, productId: "p1", type: "part", name: "Extruder", aliases: [], summary: "v2", attrs: {} }], edges: [], chunks: [], media: [] });
  assert(graphStats("p1").entities === 1, "re-ingest wiped old entities (no orphans)");
  assert(getEntity(gear) === undefined, "removed entity is gone after re-ingest");
  assert(getEntity(extruder)!.summary === "v2", "surviving entity updated to new content");

  // semantic search over in-DB embedding BLOBs — hand-crafted unit vectors, no
  // model needed. Verifies BLOB round-trips and cosine ranks the closer vector.
  h.prepare(`INSERT INTO products (id, slug, name) VALUES (?,?,?)`).run("p2", "vec-prod", "Vec Product");
  const unit = (a: number[]) => { const n = Math.hypot(...a) || 1; return new Float32Array(a.map((x) => x / n)); };
  replaceProductGraph("p2", {
    entities: [
      { id: "va", productId: "p2", type: "part", name: "Alpha", aliases: [], summary: "", attrs: {}, embedding: unit([1, 0, 0]) },
      { id: "vb", productId: "p2", type: "part", name: "Beta", aliases: [], summary: "", attrs: {}, embedding: unit([0, 1, 0]) },
    ],
    edges: [], chunks: [], media: [],
  });
  const sres = semanticSearchKg("p2", unit([0.9, 0.1, 0]), "entity", 2);
  assert(sres.length === 2 && sres[0]!.id === "va", "semantic search ranks the nearer vector first");
  assert(sres[0]!.score > sres[1]!.score, "cosine scores are ordered");
  // re-replace clears the vector cache (new vectors take effect)
  replaceProductGraph("p2", { entities: [{ id: "vb", productId: "p2", type: "part", name: "Beta", aliases: [], summary: "", attrs: {}, embedding: unit([0, 1, 0]) }], edges: [], chunks: [], media: [] });
  assert(semanticSearchKg("p2", unit([0, 1, 0]), "entity", 2).length === 1, "vector cache invalidated on re-ingest");

  console.log("graph self-check ok");
  process.exit(0);
}
