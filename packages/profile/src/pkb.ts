import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { profileDir } from "./store";

// The Product Knowledge Base (PKB): one unified, regenerable index compiled from
// a product's markdown/assets. It lives beside the source under
// data/products/<slug>/.pkb/ and holds four co-indexed facets, all keyed by a
// shared source_id (concept-id[#unit]):
//   graph.json   — entities + edges + hyperedges (the multimodal product graph)
//   anchors      — multimodal refs (manual page / mesh node / video clip …) on entities
//   chunks.json  — text units (for lexical + semantic search)
//   vectors.json — embeddings (see embed.ts; optional, degrades to lexical)
// The markdown stays the human-editable source of truth; the PKB is a compile
// artifact. Retrieval (retrieve.ts) fuses lexical + structural + semantic + graph.

// ── domain vocabulary ────────────────────────────────────────────────────────
export type EntityType =
  | "Part" | "Subsystem" | "Fault" | "Symptom" | "Procedure" | "Task" | "Spec" | "Setting";
export type Confidence = "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
export type EdgeType =
  | "part_of" | "causes" | "fixes" | "requires" | "adjusts" | "located_on" | "next_step" | "related_to";
export type AnchorKind = "manual_page" | "mesh_node" | "video_clip" | "image" | "audio";

// Anchor.ref is kind-specific (kept loose so producers can extend without a schema churn):
//   manual_page → { manualKind, page, bbox?: [x,y,w,h] }  (fractions, as crop_page_image uses)
//   mesh_node   → { meshUrl, nodeName }
//   video_clip  → { videoUrl, tStart, tEnd }
//   image/audio → { url }
export interface Anchor {
  id: string;
  kind: AnchorKind;
  ref: Record<string, unknown>;
  caption?: string;
  entityIds: string[];
}

export interface Entity {
  id: string;                 // normalized, e.g. "part:wire-feed-drive"
  name: string;
  type: EntityType | string;
  aliases?: string[];
  description: string;
  confidence: Confidence;
  source_ids: string[];
  anchors: string[];          // anchor ids
  locked?: boolean;           // protect hand edits from re-extract clobber
}

export interface Edge {
  id: string;
  src: string;                // entity id
  dst: string;                // entity id
  type: EdgeType | string;
  description?: string;
  confidence: Confidence;
  source_ids: string[];
}

export interface Hyperedge {
  id: string;
  type: string;               // e.g. "Procedure"
  name: string;
  memberIds: string[];        // entity + anchor ids that participate together
}

export interface ProductGraph {
  version: number;
  entities: Entity[];
  edges: Edge[];
  anchors: Anchor[];
  hyperedges?: Hyperedge[];
}

export interface Chunk {
  id: string;                 // source_id, e.g. "owner-manual#p18"
  conceptId: string;
  title: string;
  text: string;
  page?: number;
  manualKind?: string;
}

export const emptyGraph = (): ProductGraph => ({ version: 1, entities: [], edges: [], anchors: [], hyperedges: [] });

// ── paths / IO ───────────────────────────────────────────────────────────────
export function pkbDir(slug: string): string {
  return join(profileDir(slug), ".pkb");
}
export function pkbExists(slug: string): boolean {
  return existsSync(join(pkbDir(slug), "graph.json"));
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(readFileSync(file, "utf8")) as T; } catch { return fallback; }
}
function writeJson(file: string, data: unknown): void {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

export function loadGraph(slug: string): ProductGraph {
  const g = readJson<ProductGraph>(join(pkbDir(slug), "graph.json"), emptyGraph());
  // tolerate partial/older files
  g.entities ??= []; g.edges ??= []; g.anchors ??= []; g.hyperedges ??= [];
  return g;
}
export function saveGraph(slug: string, g: ProductGraph): void {
  writeJson(join(pkbDir(slug), "graph.json"), g);
}
export function loadChunks(slug: string): Chunk[] {
  return readJson<Chunk[]>(join(pkbDir(slug), "chunks.json"), []);
}
export function saveChunks(slug: string, chunks: Chunk[]): void {
  writeJson(join(pkbDir(slug), "chunks.json"), chunks);
}

// ── ids / normalization (one recipe so producers can't drift into ghost dups) ─
export function normName(name: string): string {
  return name.toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, " ").trim();
}
export function entityId(type: string, name: string): string {
  const slug = normName(name).replace(/\s+/g, "-").slice(0, 48) || "entity";
  return `${type.toLowerCase()}:${slug}`;
}

// Numeric/size tokens that must MATCH for two names to be the same entity, so
// "M6 bolt" ≠ "M8 bolt" and "roller 1" ≠ "roller 2" (graphify guard).
function sizeTokens(name: string): string {
  const toks = (name.toLowerCase().match(/[a-z]?\d+(?:\.\d+)?[a-z]*/g) ?? [])
    .filter((t) => /\d/.test(t)).sort();
  return toks.join(",");
}
export function sameEntity(a: { name: string; aliases?: string[] }, b: { name: string; aliases?: string[] }): boolean {
  if (sizeTokens(a.name) !== sizeTokens(b.name)) return false;
  const namesA = [a.name, ...(a.aliases ?? [])].map(normName);
  const namesB = [b.name, ...(b.aliases ?? [])].map(normName);
  return namesA.some((n) => namesB.includes(n));
}

// Fold duplicate entities: normalized-name match (with size guard) → accumulate
// description, union aliases/source_ids/anchors. `locked` entities are never
// overwritten by an incoming duplicate (their fields win). Edges are re-pointed
// to the survivor id via the returned remap.
export function mergeEntities(entities: Entity[]): { entities: Entity[]; remap: Map<string, string> } {
  const out: Entity[] = [];
  const remap = new Map<string, string>();
  for (const e of entities) {
    const hit = out.find((o) => sameEntity(o, e));
    if (!hit) { out.push({ ...e, aliases: [...(e.aliases ?? [])] }); remap.set(e.id, e.id); continue; }
    remap.set(e.id, hit.id);
    const winner = hit.locked ? hit : e;
    // accumulate description (dedupe by exact fragment)
    const frags = new Set([hit.description, e.description].flatMap((d) => d.split(/\n(?=\S)/)).map((s) => s.trim()).filter(Boolean));
    hit.description = [...frags].join("\n");
    hit.type = winner.type;
    hit.confidence = strongerConfidence(hit.confidence, e.confidence);
    hit.aliases = uniq([...(hit.aliases ?? []), ...(e.aliases ?? []), e.name].filter((n) => normName(n) !== normName(hit.name)));
    hit.source_ids = uniq([...hit.source_ids, ...e.source_ids]);
    hit.anchors = uniq([...hit.anchors, ...e.anchors]);
    hit.locked = hit.locked || e.locked;
  }
  return { entities: out, remap };
}

const RANK: Record<Confidence, number> = { AMBIGUOUS: 0, INFERRED: 1, EXTRACTED: 2 };
export function strongerConfidence(a: Confidence, b: Confidence): Confidence {
  return RANK[a] >= RANK[b] ? a : b;
}
function uniq<T>(xs: T[]): T[] { return [...new Set(xs)]; }

// ── graph traversal ──────────────────────────────────────────────────────────
export function getEntity(g: ProductGraph, id: string): Entity | undefined {
  return g.entities.find((e) => e.id === id);
}
export function getEntityAnchors(g: ProductGraph, id: string): Anchor[] {
  return g.anchors.filter((a) => a.entityIds.includes(id) || getEntity(g, id)?.anchors.includes(a.id));
}

export interface WalkResult { entities: Entity[]; edges: Edge[] }

// BFS from a seed entity out to `depth` hops, optionally restricted to edge
// types. Returns the reached entities + the edges traversed.
export function neighbors(g: ProductGraph, id: string, opts: { edgeTypes?: string[]; depth?: number } = {}): WalkResult {
  const depth = opts.depth ?? 1;
  const types = opts.edgeTypes && opts.edgeTypes.length ? new Set(opts.edgeTypes) : null;
  const seen = new Set([id]);
  const edges: Edge[] = [];
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const e of g.edges) {
      if (types && !types.has(e.type)) continue;
      for (const [from, to] of [[e.src, e.dst], [e.dst, e.src]] as const) {
        if (!frontier.includes(from) || seen.has(to)) continue;
        seen.add(to); next.push(to);
        if (!edges.includes(e)) edges.push(e);
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  const entities = [...seen].map((eid) => getEntity(g, eid)).filter((e): e is Entity => !!e);
  return { entities, edges };
}

// Render a sub-graph (a seed + its neighbourhood) into a compact, token-budgeted
// text block for the model (graphify's traverse-to-text). Names > ids so the LLM
// reads it naturally; anchors are listed so it knows what it can SHOW.
export function traverseToText(g: ProductGraph, id: string, opts: { edgeTypes?: string[]; depth?: number; budget?: number } = {}): string {
  const budget = opts.budget ?? 2400;
  const { entities, edges } = neighbors(g, id, opts);
  const name = (eid: string) => getEntity(g, eid)?.name ?? eid;
  const lines: string[] = [];
  const seed = getEntity(g, id);
  const ordered = seed ? [seed, ...entities.filter((e) => e.id !== id)] : entities;
  for (const e of ordered) {
    const anc = getEntityAnchors(g, e.id).map((a) => anchorLabel(a)).filter(Boolean);
    lines.push(`ENTITY ${e.name} [${e.type}] (${e.confidence})`);
    if (e.description) lines.push(`  ${e.description.replace(/\s+/g, " ").slice(0, 280)}`);
    if (anc.length) lines.push(`  anchors: ${anc.join("; ")}`);
  }
  for (const e of edges) {
    lines.push(`EDGE ${name(e.src)} --${e.type}--> ${name(e.dst)}${e.description ? ` (${e.description.slice(0, 80)})` : ""}`);
  }
  let out = "";
  for (const l of lines) {
    if (out.length + l.length + 1 > budget) { out += "\n… (truncated; narrow with edgeTypes)"; break; }
    out += (out ? "\n" : "") + l;
  }
  return out;
}

export function anchorLabel(a: Anchor): string {
  const r = a.ref as any;
  switch (a.kind) {
    case "manual_page": return `manual_page ${r.manualKind ?? ""} p.${r.page}${a.caption ? ` — ${a.caption}` : ""}`.trim();
    case "mesh_node": return `mesh_node ${r.nodeName}`;
    case "video_clip": return `video_clip ${fmtTime(r.tStart)}–${fmtTime(r.tEnd)}${a.caption ? ` — ${a.caption}` : ""}`;
    case "image": return `image${a.caption ? ` — ${a.caption}` : ""}`;
    case "audio": return `audio${a.caption ? ` — ${a.caption}` : ""}`;
    default: return a.kind;
  }
}
function fmtTime(s: unknown): string {
  const n = Number(s) || 0;
  return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
}

// ── self-check: `tsx src/pkb.ts` ─────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };

  // dedup + size guard
  const merged = mergeEntities([
    { id: "part:m6-bolt", name: "M6 bolt", type: "Part", description: "hex head", confidence: "EXTRACTED", source_ids: ["a"], anchors: [] },
    { id: "part:m6-bolt-2", name: "m6 bolt", type: "Part", description: "torque 4Nm", confidence: "INFERRED", source_ids: ["b"], anchors: [] },
    { id: "part:m8-bolt", name: "M8 bolt", type: "Part", description: "bigger", confidence: "EXTRACTED", source_ids: ["c"], anchors: [] },
  ]);
  assert(merged.entities.length === 2, "M6 variants merge, M8 stays separate");
  const m6 = merged.entities.find((e) => e.id === "part:m6-bolt")!;
  assert(m6.source_ids.length === 2, "source_ids unioned on merge");
  assert(m6.description.includes("hex head") && m6.description.includes("torque"), "descriptions accumulate");
  assert(merged.remap.get("part:m6-bolt-2") === "part:m6-bolt", "remap points dup to survivor");

  // traversal
  const g: ProductGraph = {
    version: 1,
    entities: [
      { id: "fault:jam", name: "Filament jam", type: "Fault", description: "no extrusion", confidence: "EXTRACTED", source_ids: [], anchors: ["a1"] },
      { id: "part:hotend", name: "Hotend", type: "Part", description: "melts filament", confidence: "EXTRACTED", source_ids: [], anchors: [] },
      { id: "proc:clear", name: "Clear a jam", type: "Procedure", description: "cold pull", confidence: "EXTRACTED", source_ids: [], anchors: [] },
    ],
    edges: [
      { id: "e1", src: "fault:jam", dst: "part:hotend", type: "located_on", confidence: "INFERRED", source_ids: [] },
      { id: "e2", src: "fault:jam", dst: "proc:clear", type: "fixes", confidence: "EXTRACTED", source_ids: [] },
    ],
    anchors: [{ id: "a1", kind: "manual_page", ref: { manualKind: "owner", page: 42 }, entityIds: ["fault:jam"] }],
    hyperedges: [],
  };
  const nb = neighbors(g, "fault:jam", { depth: 1 });
  assert(nb.entities.length === 3 && nb.edges.length === 2, "neighbors reaches hotend + procedure");
  const only = neighbors(g, "fault:jam", { edgeTypes: ["fixes"], depth: 1 });
  assert(only.entities.length === 2, "edgeTypes filter restricts traversal");
  const txt = traverseToText(g, "fault:jam");
  assert(txt.includes("Filament jam") && txt.includes("manual_page owner p.42") && txt.includes("--fixes-->"), "traverseToText renders entities, anchors, edges");

  console.log("pkb self-check ok");
}
