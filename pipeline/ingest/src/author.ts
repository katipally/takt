import { getProductBySlug, getManualsByProduct, listPageImages } from "@takt/db";
import { deleteProfile, writeConcept, writeIndex, generateIndex } from "@takt/profile";
import type { Frontmatter } from "@takt/profile";

// Author a product's Profile bundle (the canonical OKF markdown). Two callers:
//   • ingest — passes freshly-captured units in memory (authorFromUnits)
//   • migration CLI — rebuilds from what's already in the DB (authorProfile)
// The .md files ARE the store; there is no compile/index step (retrieval greps
// the markdown directly).

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "section";
const nowIso = () => new Date().toISOString();

export interface ProfileUnit { label: string; text: string; imageUrl?: string }
export interface ProfileConceptInput { title: string; source?: string; units: ProfileUnit[] }
export interface ProfileProductMeta { name: string; manufacturer?: string | null; summary?: string | null }
export interface AuthorResult { slug: string; concepts: number }

function unitBody(u: ProfileUnit): string {
  const img = u.imageUrl ? `![${u.label}](${u.imageUrl})\n\n` : "";
  return `## ${u.label}\n\n${img}${u.text.trim() || "_(no text captured)_"}`;
}

/** Write a bundle from in-memory concept units. Rebuilds the folder from scratch. */
export function authorFromUnits(slug: string, product: ProfileProductMeta, concepts: ProfileConceptInput[]): AuthorResult {
  deleteProfile(slug);

  const overviewBody = [
    product.summary || `${product.name}${product.manufacturer ? ` by ${product.manufacturer}` : ""}.`,
    "", "## Sources",
    ...concepts.map((c) => `- ${c.title} (${c.units.length} section${c.units.length === 1 ? "" : "s"})`),
  ].join("\n");
  writeConcept(slug, "overview", {
    type: "Product", title: product.name,
    description: product.summary ?? undefined,
    ...(product.manufacturer ? { manufacturer: product.manufacturer } : {}),
    timestamp: nowIso(),
  }, overviewBody);

  const used = new Set(["overview", "index", "log"]);
  for (const c of concepts) {
    let id = slugify(c.title);
    while (used.has(id)) id += "-x";
    used.add(id);
    const fm: Frontmatter = {
      type: "Reference", title: c.title,
      description: `${c.units.length} section${c.units.length === 1 ? "" : "s"}`,
      ...(c.source ? { source: c.source } : {}),
      timestamp: nowIso(),
    };
    writeConcept(slug, id, fm, c.units.map(unitBody).join("\n\n") || "_(empty)_");
  }

  writeIndex(slug, generateIndex(slug, product.name));
  return { slug, concepts: concepts.length + 1 };
}

/** Rebuild a Profile from what's already in the DB (migration / re-author of a
 * product ingested before Profiles). Reads page captions from page_images. */
export function authorProfile(slug: string): AuthorResult {
  const product = getProductBySlug(slug);
  if (!product) throw new Error(`No product "${slug}" — ingest it first.`);
  const concepts: ProfileConceptInput[] = getManualsByProduct(product.id).map((m) => ({
    title: m.title,
    source: m.pdfPath,
    units: listPageImages(m.id).map((p) => ({
      label: `Page ${p.pageNumber}`,
      text: (p.caption ?? "").trim(),
      imageUrl: p.pngPath ? `/assets/${p.pngPath}` : undefined,
    })),
  }));
  return authorFromUnits(slug, product, concepts);
}
