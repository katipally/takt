import { deleteProfile, writeConcept, writeIndex, generateIndex, addMedia } from "@takt/profile";
import type { Frontmatter, MediaItem } from "@takt/profile";

// Author a product's Profile bundle (the canonical OKF markdown) from the units
// captured during ingest. The .md files ARE the store; retrieval greps/reads
// them directly. Each page/section unit that carries a rendered image also emits
// a `page` MediaItem so the compiled index (buildIndex) can surface the actual
// manual page on the canvas next to an answer.

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "section";
const nowIso = () => new Date().toISOString();

export interface ProfileUnit { label: string; text: string; imageUrl?: string }
export interface ProfileConceptInput { title: string; source?: string; manualKind?: string; units: ProfileUnit[] }
export interface ProfileProductMeta { name: string; manufacturer?: string | null; summary?: string | null }
export interface AuthorResult { slug: string; concepts: number }

function unitBody(u: ProfileUnit): string {
  const img = u.imageUrl ? `![${u.label}](${u.imageUrl})\n\n` : "";
  return `## ${u.label}\n\n${img}${u.text.trim() || "_(no text captured)_"}`;
}

/** Write a bundle from in-memory concept units. Rebuilds the folder from scratch
 *  (deleteProfile) — this is a fresh-start rebuild, no incremental merge. Also
 *  seeds the media index with a `page` item for every unit that has an image. */
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

  const media: MediaItem[] = [];
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

    // A rendered page → a `page` MediaItem the canvas can show alongside an answer.
    for (const u of c.units) {
      if (!u.imageUrl) continue;
      const page = Number(u.label.match(/page\s+(\d+)/i)?.[1]) || undefined;
      media.push({
        id: `${id}#p${page ?? u.label}`,
        kind: "page",
        url: u.imageUrl,
        caption: u.text.trim().slice(0, 200),
        conceptId: id,
        page,
        manualKind: c.manualKind,
      });
    }
  }
  if (media.length) addMedia(slug, media);

  writeIndex(slug, generateIndex(slug, product.name));
  return { slug, concepts: concepts.length + 1 };
}
