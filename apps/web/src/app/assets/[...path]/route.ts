import { readFile } from "node:fs/promises";
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

// Serve rendered page images / hero images / PDFs + Profile media from the data dir.
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const target = resolve(DATA_DIR, ...path);
  if (!target.startsWith(resolve(DATA_DIR))) return new Response("Forbidden", { status: 403 });
  try {
    const data = await readFile(target);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
