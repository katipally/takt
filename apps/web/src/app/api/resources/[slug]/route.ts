import { NextResponse } from "next/server";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listProducts, getManualsByProduct, PRODUCTS_DIR } from "@takt/db";
import { listConcepts } from "@takt/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Everything the landing "resources" section needs for one product: its source
// manuals, all ingested media (images/video/3D), and the authored concept docs.
// Read-only; degrades gracefully for a product with no media.
const IMG = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);
const VID = new Set(["mp4", "webm", "mov", "m4v"]);
const MESH = new Set(["glb", "gltf"]);

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = listProducts().find((p) => p.slug === slug);

  // Manuals (source docs) — a page-1 thumbnail for rendered PDFs.
  const manuals = product
    ? getManualsByProduct(product.id).map((m) => ({
        title: m.title, kind: m.kind, pages: m.pageCount,
        thumb: m.pageCount ? `/assets/pages/${m.id}/1.png` : null,
      }))
    : [];

  // Media (images / video / 3D) served from the product bundle.
  const images: { url: string; name: string }[] = [];
  const videos: { url: string; name: string }[] = [];
  const models: { url: string; name: string }[] = [];
  const mediaDir = join(PRODUCTS_DIR, slug, "media");
  if (existsSync(mediaDir)) {
    for (const f of readdirSync(mediaDir)) {
      const ext = f.toLowerCase().split(".").pop() ?? "";
      const url = `/assets/products/${slug}/media/${f}`;
      if (IMG.has(ext)) images.push({ url, name: f });
      else if (VID.has(ext)) videos.push({ url, name: f });
      else if (MESH.has(ext)) models.push({ url, name: prettyName(f) });
    }
  }

  // Authored concept docs (our generated files from the resources).
  const concepts = listConcepts(slug).map((c) => ({
    id: c.id, title: c.frontmatter.title ?? c.id, type: c.frontmatter.type,
  }));

  return NextResponse.json({
    name: product?.name ?? slug,
    manuals, images, videos, models, concepts,
    counts: { manuals: manuals.length, images: images.length, videos: videos.length, models: models.length, concepts: concepts.length },
  });
}

function prettyName(f: string): string {
  return f.replace(/\.(glb|gltf)$/i, "").replace(/[-_]+/g, " ").replace(/\br\d+$/i, "").trim();
}
