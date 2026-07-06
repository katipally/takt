import { streamProvider, type ProviderInfo, type ChatRequest } from "@takt/harness";
import {
  entityId, mergeEntities, strongerConfidence, saveGraph, saveChunks, loadGraph,
  buildVectors,
  type Entity, type Edge, type Anchor, type Hyperedge, type Chunk, type ProductGraph, type Confidence,
} from "@takt/profile";

// Compile a product's captioned sources into its PKB: an entity/edge/anchor
// graph + text chunks + vectors. One LLM pass per page/section extracts the
// real-world things the doc is about (Parts, Faults, Procedures, Specs) and how
// they relate, with a confidence tier on every claim (graphify). Entities are
// then merged across pages (LightRAG name-dedup + size guard), page anchors let
// answers point back at the exact figure, and chunks+vectors power hybrid
// retrieval. The markdown stays canonical — this is a regenerable compile step.

export interface ExtractUnit {
  sourceId: string;         // shared source_id, e.g. "owner#p18"
  conceptId: string;        // concept this belongs to
  title: string;
  manualKind?: string;      // for manual_page anchors
  page?: number;            // page number (PDF units only)
  text: string;             // the caption / section text
}

export interface BuildPkbResult { entities: number; edges: number; anchors: number; chunks: number; inputTokens: number; outputTokens: number }

async function complete(provider: ProviderInfo, apiKey: string | undefined, req: ChatRequest): Promise<{ text: string; input: number; output: number }> {
  let text = "", input = 0, output = 0;
  const signal = new AbortController().signal;
  for await (const ev of streamProvider(provider, apiKey, req, signal)) {
    if (ev.type === "text") text += ev.delta;
    else if (ev.type === "usage") { input += ev.input; output += ev.output; }
  }
  return { text: text.trim(), input, output };
}

const CONF = new Set(["EXTRACTED", "INFERRED", "AMBIGUOUS"]);
const conf = (v: unknown): Confidence => (CONF.has(String(v)) ? String(v) as Confidence : "INFERRED");

const EXTRACT_PROMPT = `You are building a structured knowledge graph of a physical product from ONE page/section of its documentation. Extract the real-world things the text is about and how they relate.

ENTITIES — classify each as one of:
- Part or Subsystem: a physical component or assembly (e.g. "hotend", "wire feed drive").
- Fault or Symptom: an error code, failure mode, or observable problem (e.g. "Error 12", "no extrusion").
- Procedure or Task: a how-to action (e.g. "cold pull", "replace nozzle").
- Spec or Setting: a numeric parameter or configurable value (e.g. "nozzle temp", "wire feed speed").

EDGES — how two entities relate. Use: part_of, causes, fixes, requires, adjusts, located_on, next_step, related_to.

CONFIDENCE on every entity and edge:
- EXTRACTED: explicitly stated on this page.
- INFERRED: a reasonable inference from the text.
- AMBIGUOUS: uncertain — still include it, marked AMBIGUOUS.

Return ONLY a JSON object (no prose, no code fence):
{"entities":[{"name":"","type":"Part|Subsystem|Fault|Symptom|Procedure|Task|Spec|Setting","aliases":[],"description":"","confidence":""}],
 "edges":[{"src":"<entity name>","dst":"<entity name>","type":"","description":"","confidence":""}],
 "anchors":[{"entityNames":["<name>"],"caption":"","bbox":[x,y,w,h]}]}
Rules: names are short and canonical; reuse the SAME name for the same thing across the page; edge src/dst MUST be entity names you listed; "anchors" mark where a figure/diagram/photo for those entities appears — bbox is the fraction of the page (0-1, x,y=top-left, w,h=size), omit bbox if the whole page or no figure; do not invent facts; skip page numbers, tables of contents, and navigation boilerplate.`;

interface RawExtract {
  entities?: { name?: string; type?: string; aliases?: string[]; description?: string; confidence?: string }[];
  edges?: { src?: string; dst?: string; type?: string; description?: string; confidence?: string }[];
  anchors?: { entityNames?: string[]; caption?: string; bbox?: number[] }[];
}

function parseJson(raw: string): RawExtract {
  try {
    const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
    if (a === -1 || b === -1) return {};
    return JSON.parse(raw.slice(a, b + 1)) as RawExtract;
  } catch { return {}; }
}

async function extractUnit(unit: ExtractUnit, provider: ProviderInfo, model: string, apiKey?: string) {
  const { text, input, output } = await complete(provider, apiKey, {
    model, maxTokens: 2048, tools: [],
    messages: [{ role: "user", text: `${EXTRACT_PROMPT}\n\n---\nSOURCE: ${unit.title}${unit.page ? ` (page ${unit.page})` : ""}\n\n${unit.text.slice(0, 6000)}` }],
  });
  return { raw: parseJson(text), input, output };
}

async function pMap<T>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const j = i++; await fn(items[j]!, j); }
  }));
}

const bboxOk = (b?: number[]): b is number[] =>
  Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === "number" && n >= 0 && n <= 1) && b[2]! > 0 && b[3]! > 0;

export async function buildPkb(
  slug: string,
  units: ExtractUnit[],
  opts: { provider: ProviderInfo; model: string; apiKey?: string; concurrency?: number; onProgress?: (m: string) => void | Promise<void> },
): Promise<BuildPkbResult> {
  const report = async (m: string) => { await opts.onProgress?.(m); };

  // Preserve locked (hand-edited) entities from any prior graph so re-extract
  // doesn't clobber human work.
  const prior = loadGraph(slug);
  const locked = prior.entities.filter((e) => e.locked);

  const rawEntities: Entity[] = [...locked];
  const rawEdges: Edge[] = [];
  const rawAnchors: Anchor[] = [];
  let inputTokens = 0, outputTokens = 0, done = 0;
  let anchorSeq = 0, edgeSeq = 0;

  await pMap(units, opts.concurrency ?? 4, async (unit) => {
    let res;
    try { res = await extractUnit(unit, opts.provider, opts.model, opts.apiKey); }
    catch (e: any) { await report(`Extract skipped ${unit.sourceId}: ${String(e?.message ?? e)}`); return; }
    inputTokens += res.input; outputTokens += res.output;

    // resolve this unit's entity names → ids (page-local scope)
    const nameToId = new Map<string, string>();
    for (const ent of res.raw.entities ?? []) {
      const name = String(ent.name ?? "").trim();
      const type = String(ent.type ?? "Part").trim() || "Part";
      if (!name) continue;
      const id = entityId(type, name);
      nameToId.set(name.toLowerCase(), id);
      rawEntities.push({
        id, name, type,
        aliases: (ent.aliases ?? []).map(String).filter(Boolean),
        description: String(ent.description ?? "").trim(),
        confidence: conf(ent.confidence),
        source_ids: [unit.sourceId], anchors: [],
      });
    }
    for (const e of res.raw.edges ?? []) {
      const src = nameToId.get(String(e.src ?? "").toLowerCase());
      const dst = nameToId.get(String(e.dst ?? "").toLowerCase());
      if (!src || !dst || src === dst) continue;
      rawEdges.push({ id: `e${edgeSeq++}`, src, dst, type: String(e.type ?? "related_to") || "related_to", description: String(e.description ?? "").trim() || undefined, confidence: conf(e.confidence), source_ids: [unit.sourceId] });
    }
    // page anchors: only for PDF units that carry a page number
    if (unit.page) {
      for (const a of res.raw.anchors ?? []) {
        const ids = (a.entityNames ?? []).map((n) => nameToId.get(String(n).toLowerCase())).filter((x): x is string => !!x);
        if (!ids.length) continue;
        rawAnchors.push({
          id: `a${anchorSeq++}`, kind: "manual_page",
          ref: { manualKind: unit.manualKind ?? "other", page: unit.page, ...(bboxOk(a.bbox) ? { bbox: a.bbox } : {}) },
          caption: String(a.caption ?? "").trim() || undefined,
          entityIds: ids,
        });
      }
    }
    await report(`Extracting ${++done}/${units.length}: ${unit.title}`);
  });

  // merge entities across pages, re-point edges/anchors to survivors
  const { entities, remap } = mergeEntities(rawEntities);
  const rid = (id: string) => remap.get(id) ?? id;

  // dedupe edges by (src,dst,type), keep strongest confidence, union sources
  const edgeMap = new Map<string, Edge>();
  for (const e of rawEdges) {
    const src = rid(e.src), dst = rid(e.dst);
    if (src === dst) continue;
    const key = `${src}|${dst}|${e.type}`;
    const hit = edgeMap.get(key);
    if (hit) { hit.confidence = strongerConfidence(hit.confidence, e.confidence); hit.source_ids = [...new Set([...hit.source_ids, ...e.source_ids])]; hit.description ??= e.description; }
    else edgeMap.set(key, { ...e, src, dst });
  }
  const edges = [...edgeMap.values()];

  // re-point anchors, attach anchor ids onto their entities
  const byId = new Map(entities.map((e) => [e.id, e]));
  const anchors: Anchor[] = [];
  for (const a of rawAnchors) {
    const ids = [...new Set(a.entityIds.map(rid))].filter((id) => byId.has(id));
    if (!ids.length) continue;
    a.entityIds = ids;
    anchors.push(a);
    for (const id of ids) { const e = byId.get(id)!; if (!e.anchors.includes(a.id)) e.anchors.push(a.id); }
  }

  // hyperedges: each Procedure entity groups the parts/faults/pages it touches
  const hyperedges: Hyperedge[] = [];
  for (const proc of entities.filter((e) => /procedure|task/i.test(e.type))) {
    const members = new Set<string>([proc.id, ...proc.anchors]);
    for (const e of edges) { if (e.src === proc.id) members.add(e.dst); if (e.dst === proc.id) members.add(e.src); }
    if (members.size > 1) hyperedges.push({ id: `h:${proc.id}`, type: "Procedure", name: proc.name, memberIds: [...members] });
  }

  const graph: ProductGraph = { version: 1, entities, edges, anchors, hyperedges };
  saveGraph(slug, graph);

  // chunks: one per unit (the text units retrieval greps/embeds)
  const chunks: Chunk[] = units.filter((u) => u.text.trim()).map((u) => ({
    id: u.sourceId, conceptId: u.conceptId, title: u.title, text: u.text, page: u.page, manualKind: u.manualKind,
  }));
  saveChunks(slug, chunks);

  // vectors: chunks + entity "name — description" (best-effort; degrades to lexical)
  await report("Embedding for semantic search…");
  try {
    const entries = [
      ...chunks.map((c) => ({ id: c.id, text: `${c.title}\n${c.text}` })),
      ...entities.map((e) => ({ id: e.id, text: `${e.name}${e.aliases?.length ? ` (${e.aliases.join(", ")})` : ""} — ${e.description}` })),
    ];
    await buildVectors(slug, entries);
  } catch (e: any) { await report(`Embeddings skipped: ${String(e?.message ?? e)}`); }

  return { entities: entities.length, edges: edges.length, anchors: anchors.length, chunks: chunks.length, inputTokens, outputTokens };
}
