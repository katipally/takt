import { NextResponse } from "next/server";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { listProducts, getManualsByProduct, PRODUCTS_DIR } from "@takt/db";
import { loadGraph, listConcepts, pkbExists } from "@takt/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Everything the landing "resources" section + the explorable virtual product
// need for one product: its source manuals, all ingested media (images/video/3D),
// the authored concept docs, and the knowledge graph itself (top-degree slice,
// shaped for the interactive Graph component). Read-only; degrades gracefully for
// a markdown-only product (no media, no .pkb).
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

  // Knowledge graph — the explorable "virtual product". Take the top-degree
  // slice (the whole graph can be thousands of nodes) shaped for the Graph UI.
  let graph: { nodes: unknown[]; edges: unknown[] } = { nodes: [], edges: [] };
  let stats = { entities: 0, edges: 0, procedures: 0 };
  if (pkbExists(slug)) {
    const g = loadGraph(slug);
    stats = { entities: g.entities.length, edges: g.edges.length, procedures: g.hyperedges?.length ?? 0 };
    const deg = new Map<string, number>();
    for (const e of g.edges) { deg.set(e.src, (deg.get(e.src) ?? 0) + 1); deg.set(e.dst, (deg.get(e.dst) ?? 0) + 1); }
    const top = [...g.entities].sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0)).slice(0, 80);
    const keep = new Set(top.map((e) => e.id));
    graph = {
      nodes: top.map((e) => ({ id: e.id, label: e.name, type: e.type, detail: (e.description ?? "").slice(0, 220) })),
      edges: g.edges.filter((e) => keep.has(e.src) && keep.has(e.dst)).map((e) => ({ source: e.src, target: e.dst, type: e.type })),
    };
  }

  return NextResponse.json({
    name: product?.name ?? slug,
    manuals, images, videos, models, concepts, graph, stats,
    counts: { manuals: manuals.length, images: images.length, videos: videos.length, models: models.length, concepts: concepts.length },
  });
}

function prettyName(f: string): string {
  return f.replace(/\.(glb|gltf)$/i, "").replace(/[-_]+/g, " ").replace(/\br\d+$/i, "").trim();
}
