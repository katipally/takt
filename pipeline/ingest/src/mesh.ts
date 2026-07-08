import { basename, extname } from "node:path";
import { stlToGlb } from "./stl.js";
import { writeMedia, addMedia, type MediaItem } from "@takt/profile";

// Fold a product's 3D part models into its flat media index. The print-file set
// is already one named STL per part (filament-guide, x-carriage…) inside
// subsystem folders (Frame, Nextruder, Z-axis…), so 3D indexing needs NO vision
// segmentation: filename → part name, folder → subsystem. Each STL is converted
// to a .glb <model-viewer> can show and recorded as a `mesh` MediaItem whose
// caption gets embedded, so the canvas can pull up the right part on demand.

export interface ModelFile { filename: string; data: Uint8Array; subsystem?: string }

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
  const stls = models.filter((m) => m.filename.toLowerCase().endsWith(".stl"));
  const subsystems = new Set<string>();
  const items: MediaItem[] = [];
  let skipped = 0;

  for (const m of stls) {
    const name = partName(m.filename);
    let glb: Uint8Array;
    try { glb = stlToGlb(Buffer.from(m.data), name); }
    catch (e: any) { skipped++; await opts.onProgress?.(`Skipped ${m.filename}: ${String(e?.message ?? e)}`); continue; }
    // Prefix the .glb with its subsystem so parts sharing a base name across
    // subsystem folders don't collide on disk or on MediaItem id.
    const sub = m.subsystem ? m.subsystem.replace(/[^\w.-]+/g, "-") + "-" : "";
    const glbName = `${sub}${basename(m.filename, extname(m.filename))}.glb`;
    const link = writeMedia(slug, glbName, glb); // "media/<name>.glb"
    items.push({
      id: `mesh:${glbName}`,
      kind: "mesh",
      url: `/assets/products/${slug}/${link}`,
      caption: `${name} — 3D model${m.subsystem ? ` (${m.subsystem})` : ""}`,
      subsystem: m.subsystem,
      nodeName: name,
    });
    if (m.subsystem) subsystems.add(m.subsystem);
    await opts.onProgress?.(`3D part ${items.length}/${stls.length}: ${name}`);
  }

  if (items.length) addMedia(slug, items);
  return { parts: items.length, subsystems: subsystems.size, skipped };
}
