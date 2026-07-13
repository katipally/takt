import { basename, extname } from "node:path";
import { stlToGlb } from "./stl.js";
import { stepToGlb, threeMfToGlb } from "./cad.js";
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
): Promise<{ parts: number; subsystems: number; skipped: number; deduped: number }> {
  // Supported 3D: STL/STEP/3MF are converted to GLB; GLB/GLTF pass through. When
  // the SAME part ships in several formats (Prusa gives model_files=STEP +
  // print_files=STL of every part), keep ONE — the render-ready, cheapest to
  // process — so we don't duplicate meshes or waste STEP tessellation.
  const rank = (f: string): number => {
    const lc = f.toLowerCase();
    if (/\.(glb|gltf)$/.test(lc)) return 0; // already renderable
    if (/\.stl$/.test(lc)) return 1;        // trivial convert
    if (/\.3mf$/.test(lc)) return 2;        // unzip + parse
    return 3;                               // .stp/.step — wasm tessellation (last resort)
  };
  const supported = models.filter((m) => /\.(stl|glb|gltf|stp|step|3mf)$/i.test(m.filename));
  const best = new Map<string, ModelFile>();
  for (const m of supported) {
    const key = `${(m.subsystem ?? "").toLowerCase()}/${partName(m.filename).toLowerCase()}`;
    const cur = best.get(key);
    if (!cur || rank(m.filename) < rank(cur.filename)) best.set(key, m);
  }
  const meshes = [...best.values()];
  const deduped = supported.length - meshes.length;
  const subsystems = new Set<string>();
  const items: MediaItem[] = [];
  let skipped = 0;

  for (const m of meshes) {
    const name = partName(m.filename);
    const lc = m.filename.toLowerCase();
    const convert = /\.(stl|stp|step|3mf)$/.test(lc); // any of these → a .glb file
    let glb: Uint8Array;
    try {
      if (/\.stl$/.test(lc)) glb = stlToGlb(Buffer.from(m.data), name);
      else if (/\.(stp|step)$/.test(lc)) glb = await stepToGlb(Buffer.from(m.data), name);
      else if (/\.3mf$/.test(lc)) glb = threeMfToGlb(Buffer.from(m.data), name);
      else glb = m.data; // glb/gltf passthrough
    } catch (e: any) { skipped++; await opts.onProgress?.(`Skipped ${m.filename}: ${String(e?.message ?? e)}`); continue; }
    // Prefix the .glb with its subsystem so parts sharing a base name across
    // subsystem folders don't collide on disk or on MediaItem id.
    const sub = m.subsystem ? m.subsystem.replace(/[^\w.-]+/g, "-") + "-" : "";
    const ext = convert ? ".glb" : extname(m.filename).toLowerCase();
    const glbName = `${sub}${basename(m.filename, extname(m.filename))}${ext}`;
    const link = writeMedia(slug, glbName, glb); // "media/<name>.glb|.gltf"
    items.push({
      id: `mesh:${glbName}`,
      kind: "mesh",
      url: `/assets/products/${slug}/${link}`,
      caption: `${name} — 3D model${m.subsystem ? ` (${m.subsystem})` : ""}`,
      subsystem: m.subsystem,
      nodeName: name,
    });
    if (m.subsystem) subsystems.add(m.subsystem);
    await opts.onProgress?.(`3D part ${items.length}/${meshes.length}: ${name}`);
  }

  if (items.length) addMedia(slug, items);
  return { parts: items.length, subsystems: subsystems.size, skipped, deduped };
}
