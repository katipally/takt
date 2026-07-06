import { readFile, open, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { DATA_DIR } from "@takt/db";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".pdf": "application/pdf", ".svg": "image/svg+xml",
  // Profile media (video / audio / 3D). GLB/USDZ feed <model-viewer>.
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg",
  ".wav": "audio/wav", ".ogg": "audio/ogg", ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json", ".usdz": "model/vnd.usdz+zip",
};

// Serve rendered page images / hero images / PDFs + Profile media from the data
// dir. Supports HTTP Range requests (206) — REQUIRED for <video> to seek, so a
// `#t=start,end` snippet can actually jump to the right moment.
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = resolve(DATA_DIR, ...path);
  if (!target.startsWith(resolve(DATA_DIR))) return new Response("Forbidden", { status: 403 });

  let size: number;
  try { size = (await stat(target)).size; } catch { return new Response("Not found", { status: 404 }); }

  const type = TYPES[extname(target).toLowerCase()] ?? "application/octet-stream";
  const base = { "content-type": type, "cache-control": "public, max-age=31536000, immutable", "accept-ranges": "bytes" };

  const range = req.headers.get("range");
  const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
  if (m) {
    let start = m[1] ? parseInt(m[1], 10) : 0;
    let end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (Number.isNaN(start) || start < 0) start = 0;
    if (Number.isNaN(end) || end >= size) end = size - 1;
    if (start > end) return new Response("Range Not Satisfiable", { status: 416, headers: { "content-range": `bytes */${size}` } });
    const len = end - start + 1;
    const fh = await open(target, "r");
    try {
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, start);
      return new Response(new Uint8Array(buf), { status: 206, headers: { ...base, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(len) } });
    } finally { await fh.close(); }
  }

  try {
    const data = await readFile(target);
    return new Response(new Uint8Array(data), { headers: { ...base, "content-length": String(size) } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
