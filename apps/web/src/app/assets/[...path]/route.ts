import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { DATA_DIR } from "@prox/db";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".pdf": "application/pdf", ".svg": "image/svg+xml",
};

// Serve rendered page images / hero images / PDFs from the local data dir.
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
