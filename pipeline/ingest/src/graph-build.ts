import type { Entity, Edge, KgChunk, KgMedia, GraphInput, EntityType, EdgeRel } from "@takt/db";

// Assemble a product's knowledge graph from the per-page structured parse plus
// 3D/video media. PURE + deterministic (no DB, no LLM) so it's unit-testable and
// re-ingest-stable: entity ids are derived from `type:slug(name)`, so the same
// part named on five pages collapses to ONE node (dedup for free), and a re-run
// yields identical ids. Cross-modal links (a 3D part or a figure caption that
// names an entity) are added by normalized-name match.

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "x";
const eid = (type: EntityType, name: string) => `${type}:${slug(name)}`;

/** One named thing the vision parse pulled off a page. */
export interface ParsedItem { name: string; aliases?: string[]; summary?: string; value?: string; unit?: string; refHint?: string }

/** The structured result of parsing ONE manual page (replaces the flat caption). */
export interface PageParse {
  manualId: string;
  manualKind: string;
  page: number;
  imageUrl: string;        // /assets/pages/<manualId>/<n>.png
  textMd: string;          // full transcription — the page's retrievable chunk
  parts?: ParsedItem[];    // components/assemblies named on the page
  specs?: ParsedItem[];    // measured values (value/unit); refHint = the part it's for
  symptoms?: ParsedItem[]; // problems in layman + technical terms; refHint = the fix
  procedures?: ParsedItem[];
  warnings?: ParsedItem[];
  figures?: { label: string; caption: string }[]; // diagrams/photos on the page
}

export interface MeshPartInput { name: string; subsystem?: string; assetUrl: string; caption?: string }
export interface VideoClipInput { name: string; assetUrl: string; caption: string; tStart?: number; tEnd?: number }
export interface ImageInput { name: string; assetUrl: string; caption: string }

export interface GraphBuildInput {
  productId: string;
  pages: PageParse[];
  meshes?: MeshPartInput[];
  videos?: VideoClipInput[];
  images?: ImageInput[];
}

/** Turn parsed pages + media into a GraphInput ready for replaceProductGraph. */
export function buildGraphInput(input: GraphBuildInput): GraphInput {
  const { productId } = input;
  const entities = new Map<string, Entity>();
  const edges = new Map<string, Edge>(); // keyed src|rel|dst → dedup
  const chunks: KgChunk[] = [];
  const media: KgMedia[] = [];
  // normalized-name → entity id, per type, for cross-modal + ref linking.
  const nameIndex = new Map<string, string>(); // `${type}\n${slug(name)}` → id  (also indexes aliases)

  const indexName = (type: EntityType, name: string, id: string) => nameIndex.set(`${type}\n${slug(name)}`, id);
  const lookup = (type: EntityType, name: string): string | undefined => nameIndex.get(`${type}\n${slug(name)}`);

  const addEntity = (type: EntityType, item: ParsedItem, page: number, manualId: string | null): string => {
    const id = eid(type, item.name);
    const attrs: Record<string, unknown> = {};
    // A measured value must contain a digit. The vision pass sometimes returns
    // qualitative fills ("very high", "increased") — storing those as spec
    // values pollutes grounding and the deterministic fact-check, so drop them
    // (the entity keeps its summary; only the fake measurement goes).
    const measured = item.value != null && /\d/.test(String(item.value));
    if (measured) {
      attrs.value = item.value;
      if (item.unit != null) attrs.unit = item.unit;
    }
    const existing = entities.get(id);
    if (existing) {
      // merge: union aliases, keep first (longest-name canonical), fill summary
      const aliases = new Set([...existing.aliases, ...(item.aliases ?? [])]);
      if (item.name !== existing.name && slug(item.name) === id.split(":")[1]) { /* same canonical */ }
      existing.aliases = [...aliases];
      if (!existing.summary && item.summary) existing.summary = item.summary;
      Object.assign(existing.attrs, attrs);
    } else {
      entities.set(id, {
        id, productId, type, name: item.name, aliases: [...new Set(item.aliases ?? [])],
        summary: item.summary ?? "", attrs, manualId, page, contentHash: null,
      });
    }
    indexName(type, item.name, id);
    for (const a of item.aliases ?? []) indexName(type, a, id);
    return id;
  };

  const addEdge = (src: string, rel: EdgeRel, dst: string, provenance: "EXTRACTED" | "INFERRED", page?: number) => {
    if (src === dst) return;
    const key = `${src}|${rel}|${dst}`;
    if (edges.has(key)) return;
    edges.set(key, { id: `e${edges.size}`, productId, src, dst, rel, provenance, weight: 1, page: page ?? null });
  };

  // ── entities + page chunks + figure media ──
  for (const p of input.pages) {
    // the page's full text is the primary retrievable chunk
    if (p.textMd.trim()) {
      chunks.push({ id: `chunk:${p.manualId}:${p.page}`, productId, entityId: null, manualId: p.manualId, page: p.page, kind: "page", text: p.textMd.trim() });
    }
    const partIds = (p.parts ?? []).map((x) => addEntity("part", x, p.page, p.manualId));
    for (const s of p.specs ?? []) {
      const id = addEntity("spec", s, p.page, p.manualId);
      const ref = s.refHint ? lookup("part", s.refHint) : undefined;
      if (ref) addEdge(id, "references", ref, "EXTRACTED", p.page);
    }
    const procIds = (p.procedures ?? []).map((x) => addEntity("procedure", x, p.page, p.manualId));
    for (const sy of p.symptoms ?? []) {
      const id = addEntity("symptom", sy, p.page, p.manualId);
      const fix = sy.refHint ? (lookup("procedure", sy.refHint) ?? procIds[0]) : procIds[0];
      if (fix) addEdge(fix, "fixes", id, "EXTRACTED", p.page);
    }
    for (const w of p.warnings ?? []) addEntity("warning", w, p.page, p.manualId);

    // one figure entity per page that has a diagram/photo, linked to the page image
    if (p.figures?.length) {
      const figId = eid("figure", `${p.manualId} page ${p.page}`);
      const cap = p.figures.map((f) => `${f.label}: ${f.caption}`).join(" · ");
      if (!entities.has(figId)) {
        entities.set(figId, { id: figId, productId, type: "figure", name: `${p.manualKind} p.${p.page}`, aliases: [], summary: cap, attrs: {}, manualId: p.manualId, page: p.page, contentHash: null });
      }
      media.push({ id: `media:fig:${p.manualId}:${p.page}`, productId, entityId: figId, kind: "figure", assetUrl: p.imageUrl, caption: cap, bbox: null, contentHash: null });
      chunks.push({ id: `chunk:cap:${p.manualId}:${p.page}`, productId, entityId: figId, manualId: p.manualId, page: p.page, kind: "caption", text: cap });
      // the figure depicts each part named on the same page
      for (const pid of partIds) addEdge(pid, "shown_in", figId, "INFERRED", p.page);
    }
  }

  // ── 3D parts: model_part entity + link to the matching part by name ──
  for (const m of input.meshes ?? []) {
    const id = addEntity("model_part", { name: m.name, summary: m.caption ?? m.subsystem }, 0, null);
    media.push({ id: `media:mesh:${slug(m.name)}`, productId, entityId: id, kind: "mesh", assetUrl: m.assetUrl, caption: m.caption ?? m.name, subsystem: m.subsystem ?? null, bbox: null, contentHash: null });
    const part = lookup("part", m.name);
    if (part) addEdge(id, "depicts", part, "INFERRED");
  }

  // ── video clips: entity + link to any part/procedure it names ──
  for (const v of input.videos ?? []) {
    const id = addEntity("video_clip", { name: v.name, summary: v.caption }, 0, null);
    media.push({ id: `media:vid:${slug(v.name)}`, productId, entityId: id, kind: "video_clip", assetUrl: v.assetUrl, caption: v.caption, bbox: { tStart: v.tStart, tEnd: v.tEnd }, contentHash: null });
    const hay = `${v.name} ${v.caption}`.toLowerCase();
    for (const [key, refId] of nameIndex) {
      const [t, nm = ""] = key.split("\n");
      if ((t === "part" || t === "procedure") && nm.length > 3 && hay.includes(nm.replace(/-/g, " "))) addEdge(id, "references", refId, "INFERRED");
    }
  }

  // ── loose images: image media linked to any part it names ──
  for (const im of input.images ?? []) {
    const part = lookup("part", im.name);
    media.push({ id: `media:img:${slug(im.name)}`, productId, entityId: part ?? null, kind: "image", assetUrl: im.assetUrl, caption: im.caption, bbox: null, contentHash: null });
  }

  return { entities: [...entities.values()], edges: [...edges.values()], chunks, media };
}

// ── self-check: `tsx src/graph-build.ts` (pure — no DB/LLM) ──────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  const g = buildGraphInput({
    productId: "p1",
    pages: [
      {
        manualId: "man1", manualKind: "owner", page: 12, imageUrl: "/assets/pages/man1/12.png",
        textMd: "The extruder pushes filament. Nozzle temperature is 215C for PLA.",
        parts: [{ name: "Extruder", aliases: ["hotend feeder"] }, { name: "Bondtech drive gear", aliases: ["drive gear"] }],
        specs: [{ name: "PLA nozzle temperature", value: "215", unit: "C", refHint: "Extruder" }],
        figures: [{ label: "Fig 1", caption: "exploded view of the extruder" }],
      },
      {
        manualId: "man1", manualKind: "owner", page: 40, imageUrl: "/assets/pages/man1/40.png",
        textMd: "Clicking while printing means a clog. Do a cold pull to clear it.",
        symptoms: [{ name: "Extruder clicking", aliases: ["clicking noise"], refHint: "Cold pull" }],
        procedures: [{ name: "Cold pull" }],
      },
    ],
    meshes: [{ name: "Bondtech drive gear", subsystem: "extruder", assetUrl: "/assets/products/x/media/gear.glb", caption: "the drive gear" }],
    videos: [{ name: "Clearing a clog", assetUrl: "/assets/products/x/media/repair.mp4#t=10,40", caption: "how to do a cold pull on the extruder" }],
  });

  const byId = new Map(g.entities.map((e) => [e.id, e]));
  // dedup: extruder named on p12 → exactly one part node
  assert(g.entities.filter((e) => e.type === "part" && e.name === "Extruder").length === 1, "extruder deduped to one node");
  // spec references the part
  assert(g.edges.some((e) => e.rel === "references" && e.dst === "part:extruder"), "spec references extruder");
  // symptom fixed by the cold-pull procedure
  assert(g.edges.some((e) => e.rel === "fixes" && byId.get(e.src)?.name === "Cold pull" && byId.get(e.dst)?.name === "Extruder clicking"), "cold pull fixes clicking");
  // figure depicts the parts on its page (shown_in edge)
  assert(g.edges.some((e) => e.rel === "shown_in" && e.src === "part:extruder"), "extruder shown_in the page figure");
  // cross-modal: the 3D gear links to the part of the same name
  assert(g.edges.some((e) => e.rel === "depicts" && e.src.startsWith("model_part:") && e.dst === "part:bondtech-drive-gear"), "3D gear depicts the part");
  // cross-modal: the video references the cold-pull procedure by name
  assert(g.edges.some((e) => e.rel === "references" && e.src.startsWith("video_clip:") && e.dst === "procedure:cold-pull"), "video references the procedure");
  // page chunk retained
  assert(g.chunks.some((c) => c.kind === "page" && c.text.includes("215C")), "page chunk kept");
  // media: figure + mesh + video present and entity-linked
  assert(g.media.some((m) => m.kind === "figure" && m.entityId?.startsWith("figure:")), "figure media linked");
  assert(g.media.some((m) => m.kind === "mesh" && m.entityId?.startsWith("model_part:")), "mesh media linked");

  console.log(`graph-build self-check ok (${g.entities.length} entities, ${g.edges.length} edges, ${g.chunks.length} chunks, ${g.media.length} media)`);

  // Integration: persist the assembled graph and query it the way the agent will.
  // Runs only with a throwaway TAKT_DATA_DIR so it never touches the real catalog.
  if (process.env.TAKT_DATA_DIR && !/\/data\/?$/.test(process.env.TAKT_DATA_DIR)) {
    const db = await import("@takt/db");
    db.getDb().prepare(`INSERT OR IGNORE INTO products (id, slug, name) VALUES (?,?,?)`).run("p1", "gb-test", "GB Test");
    db.replaceProductGraph("p1", g);
    assert(db.findEntity("p1", "clicking noise").some((e) => e.type === "symptom"), "persisted: layman 'clicking noise' → symptom");
    assert(db.ftsChunks("p1", "cold pull clog").length > 0, "persisted: FTS finds the fix chunk");
    const sym = db.findEntity("p1", "clicking noise")[0]!;
    assert(db.neighbors(sym.id).length > 0, "persisted: symptom has graph neighbors");
    console.log("graph-build DB integration ok");
  } else {
    console.log("(set a throwaway TAKT_DATA_DIR to also run the DB integration check)");
  }
  process.exit(0);
}
