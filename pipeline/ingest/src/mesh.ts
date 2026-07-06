import { basename, extname } from "node:path";
import { stlToGlb } from "./stl.js";
import {
  writeMedia, loadGraph, saveGraph, loadChunks, buildVectors, entityId, sameEntity,
  type Entity, type Anchor,
} from "@takt/profile";

// Fold a product's 3D part models + repair video into its PKB graph. The Prusa
// print-file set is already one named STL per part (filament-guide, x-carriage,
// z-top-right…) inside subsystem folders (Frame, Nextruder, Z-axis…), so 3D
// anchoring needs NO vision segmentation: filename → part name, folder →
// subsystem. Each STL becomes a Part entity (matched to the manual's entity if
// one exists, else created) with a mesh_node anchor to a converted .glb.

export interface ModelFile { filename: string; data: Uint8Array; subsystem?: string }
export interface VideoFile { filename: string; data: Uint8Array }

// "x-carriage-back-r2" → "X Carriage Back" (strip revision suffix, humanize)
export function partName(file: string): string {
  return basename(file, extname(file))
    .replace(/[_-]?r\d+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Part";
}

export async function addMeshParts(
  slug: string, models: ModelFile[], opts: { onProgress?: (m: string) => void | Promise<void> } = {},
): Promise<{ parts: number; subsystems: number; skipped: number }> {
  const graph = loadGraph(slug);
  const stls = models.filter((m) => m.filename.toLowerCase().endsWith(".stl"));
  const subsystemId = new Map<string, string>();
  let added = 0, skipped = 0;

  for (const m of stls) {
    const name = partName(m.filename);
    let glb: Uint8Array;
    try { glb = stlToGlb(Buffer.from(m.data), name); }
    catch (e: any) { skipped++; await opts.onProgress?.(`Skipped ${m.filename}: ${String(e?.message ?? e)}`); continue; }
    const glbName = `${basename(m.filename, extname(m.filename))}.glb`;
    const link = writeMedia(slug, glbName, glb); // "media/<name>.glb"
    const meshUrl = `/assets/products/${slug}/${link}`;

    // match the manual-extracted entity by name, else create a Part
    let ent = graph.entities.find((e) => sameEntity(e, { name }));
    if (!ent) {
      const id = entityId("Part", name);
      ent = graph.entities.find((e) => e.id === id)
        ?? (graph.entities.push({ id, name, type: "Part", description: `3D-printable part${m.subsystem ? ` of the ${m.subsystem}` : ""}.`, confidence: "EXTRACTED", source_ids: [`model:${m.filename}`], anchors: [] }), graph.entities[graph.entities.length - 1]!);
    }

    const anchor: Anchor = { id: `a-mesh-${graph.anchors.length}`, kind: "mesh_node", ref: { meshUrl, nodeName: name }, caption: `${name} — 3D model`, entityIds: [ent.id] };
    graph.anchors.push(anchor);
    if (!ent.anchors.includes(anchor.id)) ent.anchors.push(anchor.id);

    // subsystem grouping (folder → Subsystem entity, part_of edge)
    if (m.subsystem) {
      let subId = subsystemId.get(m.subsystem);
      if (!subId) {
        subId = entityId("Subsystem", m.subsystem);
        subsystemId.set(m.subsystem, subId);
        if (!graph.entities.find((e) => e.id === subId)) graph.entities.push({ id: subId, name: m.subsystem, type: "Subsystem", description: "A subsystem/assembly of the printer.", confidence: "EXTRACTED", source_ids: [], anchors: [] });
      }
      if (!graph.edges.find((e) => e.src === ent!.id && e.dst === subId && e.type === "part_of"))
        graph.edges.push({ id: `e-mesh-${graph.edges.length}`, src: ent.id, dst: subId, type: "part_of", confidence: "EXTRACTED", source_ids: [] });
    }
    added++;
    await opts.onProgress?.(`3D part ${added}/${stls.length}: ${name}`);
  }

  saveGraph(slug, graph);
  await reembed(slug, graph.entities);
  return { parts: added, subsystems: subsystemId.size, skipped };
}

export async function addVideo(
  slug: string, video: VideoFile, opts: { onProgress?: (m: string) => void | Promise<void> } = {},
): Promise<void> {
  const link = writeMedia(slug, video.filename, video.data);
  const url = `/assets/products/${slug}/${link}`;
  const graph = loadGraph(slug);
  const id = entityId("Procedure", "repair walkthrough video");
  let ent = graph.entities.find((e) => e.id === id);
  if (!ent) {
    ent = { id, name: "Repair walkthrough", type: "Procedure", description: "A video walkthrough of a repair/maintenance procedure for this product.", confidence: "EXTRACTED", source_ids: [`video:${video.filename}`], anchors: [] };
    graph.entities.push(ent);
  }
  // ponytail: whole-clip anchor (tStart/tEnd = full video). Timestamped
  // per-part anchoring needs a transcript — deferred until we transcribe.
  const anchor: Anchor = { id: `a-vid-${graph.anchors.length}`, kind: "video_clip", ref: { videoUrl: url, tStart: 0, tEnd: 0 }, caption: "Repair walkthrough video", entityIds: [id] };
  graph.anchors.push(anchor);
  if (!ent.anchors.includes(anchor.id)) ent.anchors.push(anchor.id);
  saveGraph(slug, graph);
  await opts.onProgress?.("Attached repair video");
}

async function reembed(slug: string, entities: Entity[]): Promise<void> {
  try {
    const chunks = loadChunks(slug);
    await buildVectors(slug, [
      ...chunks.map((c) => ({ id: c.id, text: `${c.title}\n${c.text}` })),
      ...entities.map((e) => ({ id: e.id, text: `${e.name}${e.aliases?.length ? ` (${e.aliases.join(", ")})` : ""} — ${e.description}` })),
    ]);
  } catch { /* embeddings optional */ }
}
