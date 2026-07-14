import type { GraphInput, Entity, EdgeRel } from "@takt/db";

// The linking cascade — run AFTER buildGraphInput (deterministic slug links) and
// AFTER embedGraph (rows carry vectors), BEFORE replaceProductGraph. Two passes:
//
//   1. fuzzyMergeEntities — collapse near-duplicate entities of the SAME type
//      that the exact-slug dedup missed ("Nextruder" ≈ "Next Extruder"), guarded
//      against over-merge (numeric tokens, short labels) the way graphiti's
//      dedup_helpers.py / graphify's dedup.py do.
//   2. embeddingCrossModalLink — connect media/3D/video/image that share NO name
//      with any entity to their nearest entity by embedding cosine, so a topic
//      reaches its figure, 3D part, and video even when names diverge.
//
// Pure + synchronous (embeddings are precomputed). An LLM tie-breaker for the few
// genuinely ambiguous pairs is intentionally deferred — ponytail: add it only if
// eval shows the deterministic + fuzzy + vector cascade leaves real gaps.

export interface LinkOpts { onProgress?: (m: string) => void | Promise<void> }

const MERGE_JW = 0.92;      // Jaro-Winkler threshold to merge two names
const XMODAL_MIN = 0.55;    // min cosine to add a cross-modal link
// Entities a piece of media is worth pointing at (topical, not other media).
const TOPICAL: ReadonlySet<string> = new Set(["part", "assembly", "procedure", "symptom", "spec", "setting", "compatibility"]);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

/** Tokens that carry a digit (v1, mk4, 215c, m3) — models/versions/sizes. */
const numTokens = (s: string) => new Set((norm(s).match(/[a-z]*\d[a-z0-9]*/g) ?? []));

/** Block merge when the two names carry DIFFERENT digit-bearing tokens
 *  (v1≠v2, MK3≠MK4, M3≠M4) — the classic over-merge failure. */
function numericDiffer(a: string, b: string): boolean {
  const na = numTokens(a), nb = numTokens(b);
  if (!na.size && !nb.size) return false;
  for (const x of na) if (!nb.has(x)) return true;
  for (const x of nb) if (!na.has(x)) return true;
  return false;
}

/** Block merging a general/specific pair whose tokens are a strict subset with an
 *  extra full word ("extruder" vs "extruder gear") — those are distinct parts,
 *  not spelling variants. Plurals/typos keep the same token count so pass. */
function subsetExtraToken(a: string, b: string): boolean {
  const ta = new Set(norm(a).split(" ")), tb = new Set(norm(b).split(" "));
  const [sm, lg] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (sm.size === lg.size) return false;
  for (const x of sm) if (!lg.has(x)) return false;
  return true; // small token set ⊂ large, large has an extra word
}

function jaro(a: string, b: string): number {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const range = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const ma = new Array(la).fill(false), mb = new Array(lb).fill(false);
  let m = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - range), hi = Math.min(i + range + 1, lb);
    for (let j = lo; j < hi; j++) { if (mb[j] || a[i] !== b[j]) continue; ma[i] = mb[j] = true; m++; break; }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < la; i++) { if (!ma[i]) continue; while (!mb[k]) k++; if (a[i] !== b[k]) t++; k++; }
  t /= 2;
  return (m / la + m / lb + (m - t) / m) / 3;
}

export function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b);
  if (j < 0.7) return j;
  let p = 0; while (p < 4 && a[p] === b[p]) p++;
  return j + p * 0.1 * (1 - j);
}

const cosine = (a?: Float32Array | null, b?: Float32Array | null): number => {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0; for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s; // vectors are unit-normalized → dot == cosine
};

/** Pass 1: merge near-duplicate entities of the same type (union-find). */
export function fuzzyMergeEntities(g: GraphInput): number {
  const byType = new Map<string, Entity[]>();
  for (const e of g.entities) (byType.get(e.type) ?? byType.set(e.type, []).get(e.type)!).push(e);

  const parent = new Map<string, string>();
  const find = (x: string): string => { while (parent.get(x) && parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return parent.get(x) ?? x; };
  for (const e of g.entities) parent.set(e.id, e.id);

  // O(n²) within each type — a product has at most a few hundred per type.
  // ponytail: O(n²) per type; add MinHash/LSH blocking only if a catalog ever
  // pushes thousands of same-type entities.
  for (const list of byType.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!, b = list[j]!;
        const na = norm(a.name), nb = norm(b.name);
        if (na.length < 4 || nb.length < 4) continue;         // short-label guard
        if (numericDiffer(a.name, b.name)) continue;          // v1≠v2 guard
        if (subsetExtraToken(a.name, b.name)) continue;       // general≠specific guard
        const aliasHit = a.aliases.some((x) => norm(x) === nb) || b.aliases.some((x) => norm(x) === na);
        if (aliasHit || jaroWinkler(na, nb) >= MERGE_JW) {
          // canonical = the longer (more specific) name; ties keep the first.
          const [keep, drop] = na.length >= nb.length ? [a, b] : [b, a];
          const rk = find(keep.id), rd = find(drop.id);
          if (rk !== rd) parent.set(rd, rk);
        }
      }
    }
  }

  // Apply merges: fold dropped entities into their canonical, redirect refs.
  const canonical = new Map<string, Entity>(g.entities.map((e) => [e.id, e]));
  const survivors = new Map<string, Entity>();
  let merged = 0;
  for (const e of g.entities) {
    const root = find(e.id);
    if (root === e.id) { survivors.set(e.id, e); continue; }
    merged++;
    const keep = canonical.get(root)!;
    keep.aliases = [...new Set([...keep.aliases, e.name, ...e.aliases])].filter((x) => norm(x) !== norm(keep.name));
    if (!keep.summary && e.summary) keep.summary = e.summary;
    Object.assign(keep.attrs, e.attrs);
  }
  const remap = (id: string) => find(id);
  g.entities = [...survivors.values()];
  // redirect edges (repoint, drop self-loops, dedup by src|rel|dst)
  const seen = new Set<string>();
  g.edges = g.edges.flatMap((ed) => {
    const src = remap(ed.src), dst = remap(ed.dst);
    if (src === dst) return [];
    const key = `${src}|${ed.rel}|${dst}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...ed, src, dst }];
  });
  for (const c of g.chunks) if (c.entityId) c.entityId = remap(c.entityId);
  for (const m of g.media) if (m.entityId) m.entityId = remap(m.entityId);
  return merged;
}

/** Pass 2: connect media/3D/video/image (and their entities) that share no name
 *  with any topical entity, using embedding similarity. Adds edges + fills the
 *  media.entityId anchor. No-op if embeddings weren't computed. */
export function embeddingCrossModalLink(g: GraphInput): number {
  const topical = g.entities.filter((e) => TOPICAL.has(e.type) && e.embedding);
  if (!topical.length) return 0;
  const nearest = (v?: Float32Array | null): { e: Entity; score: number } | null => {
    if (!v) return null;
    let best: Entity | null = null, bs = -1;
    for (const e of topical) { const s = cosine(v, e.embedding); if (s > bs) { bs = s; best = e; } }
    return best ? { e: best, score: bs } : null;
  };

  // entities with no outgoing depicts/references edge → link the media entity.
  const linked = new Set<string>();
  for (const ed of g.edges) if (ed.rel === "depicts" || ed.rel === "references" || ed.rel === "shown_in") linked.add(ed.src);
  let added = 0;
  const relFor = (t: string): EdgeRel => (t === "model_part" ? "depicts" : "references");
  for (const e of g.entities) {
    if (e.type !== "model_part" && e.type !== "video_clip") continue;
    if (linked.has(e.id)) continue;
    const hit = nearest(e.embedding);
    if (hit && hit.score >= XMODAL_MIN) {
      g.edges.push({ id: `${g.entities[0]!.productId}:lk${added}`, productId: g.entities[0]!.productId, src: e.id, dst: hit.e.id, rel: relFor(e.type), provenance: "INFERRED", weight: hit.score });
      added++;
    }
  }
  // media rows with no entity anchor → point at the nearest topical entity.
  for (const m of g.media) {
    if (m.entityId) continue;
    const hit = nearest(m.embedding);
    if (hit && hit.score >= XMODAL_MIN) { m.entityId = hit.e.id; added++; }
  }
  return added;
}

export async function linkGraph(g: GraphInput, opts: LinkOpts = {}): Promise<void> {
  const merged = fuzzyMergeEntities(g);
  const linked = embeddingCrossModalLink(g);
  if (merged || linked) await opts.onProgress?.(`Linking: merged ${merged} duplicate entities, added ${linked} cross-modal links`);
}

// ── self-check: `tsx src/link.ts` (pure — no DB/LLM/model) ───────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  const unit = (a: number[]) => { const n = Math.hypot(...a) || 1; return new Float32Array(a.map((x) => x / n)); };
  const E = (id: string, type: any, name: string, extra: Partial<Entity> = {}): Entity =>
    ({ id, productId: "p", type, name, aliases: [], summary: "", attrs: {}, ...extra });

  // Jaro-Winkler + guards
  assert(jaroWinkler("idler lever", "idler leaver") >= MERGE_JW, "JW merges the typo variant");
  assert(numericDiffer("MK3 plate", "MK4 plate"), "MK3 vs MK4 flagged as different");
  assert(!numericDiffer("drive gear", "drive gears"), "no-digit names not flagged");
  assert(subsetExtraToken("extruder", "extruder gear"), "general/specific pair flagged (won't merge)");
  assert(!subsetExtraToken("drive gear", "drive gears"), "plural NOT flagged as general/specific");

  // fuzzy merge collapses the typo pair, keeps the longer canonical name, unions
  // the dropped name as an alias, and NEVER merges numeric-different or
  // general/specific pairs.
  const g: GraphInput = {
    entities: [
      E("part:idler-lever", "part", "Idler lever", { aliases: ["idler"] }),
      E("part:idler-leaver", "part", "Idler leaver", { summary: "flips to open the path" }),
      E("part:mk3-plate", "part", "MK3 plate"),
      E("part:mk4-plate", "part", "MK4 plate"),
      E("part:extruder", "part", "Extruder"),
      E("part:extruder-gear", "part", "Extruder gear"),
      E("model_part:gearbox", "model_part", "gearbox_v3", { embedding: unit([1, 0, 0]) }),
      E("part:planetary-gearbox", "part", "planetary gearbox", { embedding: unit([0.95, 0.05, 0]) }),
    ],
    edges: [{ id: "e0", productId: "p", src: "part:idler-lever", dst: "part:mk3-plate", rel: "part_of", provenance: "EXTRACTED", weight: 1 }],
    chunks: [{ id: "c0", productId: "p", entityId: "part:idler-leaver", kind: "page", text: "x" }],
    media: [{ id: "m0", productId: "p", entityId: null, kind: "image", assetUrl: "/a.png", caption: "gearbox", embedding: unit([0.9, 0.1, 0]) }],
  };
  const merged = fuzzyMergeEntities(g);
  assert(merged === 1, "exactly one merge (the idler lever typo)");
  const names = g.entities.map((e) => e.name);
  assert(names.filter((n) => n.toLowerCase().startsWith("idler")).length === 1, "the two idler levers collapsed to one");
  assert(names.includes("Extruder") && names.includes("Extruder gear"), "general/specific NOT merged");
  assert(names.includes("MK3 plate") && names.includes("MK4 plate"), "numeric-different plates NOT merged");
  assert(g.edges.some((e) => e.rel === "part_of"), "edge survived the merge");

  const added = embeddingCrossModalLink(g);
  assert(added >= 1, "cross-modal added at least one link");
  assert(g.edges.some((e) => e.src === "model_part:gearbox" && e.dst === "part:planetary-gearbox" && e.rel === "depicts"), "3D gearbox linked to the planetary gearbox part by embedding");
  assert(g.media[0]!.entityId === "part:planetary-gearbox", "image anchored to nearest entity by embedding");

  console.log("link self-check ok");
  process.exit(0);
}
