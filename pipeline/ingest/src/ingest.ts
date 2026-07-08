import { writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import {
  PAGES_DIR, PDF_DIR, HERO_DIR, PRODUCTS_DIR,
  upsertProduct, upsertManual, upsertSourceManual, upsertPageImage, getPageImage,
  setPageCaption, setSetting,
} from "@takt/db";
import { buildIndex, writeMedia, addMedia, type MediaItem } from "@takt/profile";
import { renderPdf } from "./pdf.js";
import { captionPage, generateStarters, detectProduct } from "./caption.js";
import { fetchWebSource } from "./sources.js";
import { authorFromUnits, type ProfileConceptInput } from "./author.js";
import { addMeshParts, type ModelFile } from "./mesh.js";
import { addVideo, type VideoFile } from "./video.js";
import type { ManualKind, Product } from "@takt/shared";
import type { ProviderInfo } from "@takt/harness";

export interface IngestInput {
  // Identity is optional: if a field is missing it's vision-detected from the
  // first rendered page (drop-a-folder ingest). slug defaults to slugify(name).
  slug?: string;
  name?: string;
  manufacturer?: string | null;
  summary?: string | null;
  pdfs?: { filename: string; data: Uint8Array }[];
  // Non-PDF sources ingested as text-only (web pages, YouTube transcripts).
  webSources?: { url: string; title?: string }[];
  // 3D part models (STL) → converted to .glb and added as `mesh` media.
  models?: ModelFile[];
  // A repair/walkthrough video → added as `video_clip` media.
  video?: VideoFile;
  // Loose images → added as `image` media.
  images?: { filename: string; data: Uint8Array }[];
  // Catalogued misc files (STP/STEP, gcode, other) — recorded in resources.json,
  // NOT otherwise ingested (no dependency-free tessellator for STEP).
  resources?: { filename: string; kind: string }[];
  hero?: { ext: string; data: Uint8Array };
  // Which provider + model does vision (caption + product detect + video
  // chaptering). Resolved by the caller — no provider is hardcoded.
  captionProvider: ProviderInfo;
  captionModel: string;
  apiKey?: string;
  concurrency?: number;
  onProgress?: (msg: string) => void | Promise<void>;
}

export interface IngestResult {
  product: Product;
  inputTokens: number;
  outputTokens: number;
  pages: number;
}

export function manualKindFromName(file: string): ManualKind {
  const f = file.toLowerCase();
  if (f.includes("owner") || f.includes("manual")) return "owner";
  if (f.includes("quick")) return "quick_start";
  if (f.includes("selection") || f.includes("chart")) return "selection_chart";
  return "other";
}

export function titleFromName(file: string): string {
  return basename(file, ".pdf").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48) || "product";

async function pMap<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

/**
 * Ingest a product from one folder of assets. Fully automatic: render + caption
 * PDFs → author the canonical Profile markdown (which also seeds `page` media) →
 * fold in 3D meshes, video clips, and loose images → build the compiled index
 * ONCE. Runtime then needs zero processing: it greps the markdown and cosine-
 * scans the vector store. Page images + captions stay in the DB so get_page_image
 * can still SHOW a page (captions are cached and reused across re-runs).
 */
export async function ingestProduct(input: IngestInput): Promise<IngestResult> {
  const report = async (m: string) => { await input.onProgress?.(m); };
  const { captionProvider: provider, captionModel: model, apiKey } = input;
  let inputTokens = 0, outputTokens = 0;

  // Render all PDFs up front — needed both for the per-page pass and so we can
  // vision-detect the product identity from the very first page.
  const KIND_ORDER: Record<string, number> = { owner: 0, quick_start: 1, selection_chart: 2, other: 3 };
  const rendered = (input.pdfs ?? [])
    .map((file) => ({ file, kind: manualKindFromName(file.filename), pages: renderPdf(file.data) }))
    // Owner manual first so it leads the Profile and drives identity detection.
    .sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || b.pages.length - a.pages.length);

  // Resolve identity: caller-provided fields win; anything missing is detected
  // from the cover (best-effort). Detect from the OWNER manual's cover (the real
  // product manual), not whatever PDF the folder walk hit first (e.g. a parts
  // list) — fall back to the longest PDF, then the first. slug derives from name.
  let name = input.name?.trim() || undefined;
  let manufacturer = input.manufacturer ?? undefined;
  let summary = input.summary ?? undefined;
  const primary = rendered.find((r) => r.kind === "owner")
    ?? [...rendered].sort((a, b) => b.pages.length - a.pages.length)[0];
  const cover = primary?.pages[0]?.png;
  if (cover && (!name || !manufacturer || !summary)) {
    await report("Detecting product…");
    const d = await detectProduct(cover, provider, model, apiKey);
    name ??= d.name;
    manufacturer ??= d.manufacturer;
    summary ??= d.summary;
  }
  name ||= "Untitled Product";
  const slug = (input.slug && input.slug.trim()) || slugify(name);

  let heroPath: string | null = null;
  if (input.hero) {
    mkdirSync(HERO_DIR, { recursive: true });
    heroPath = `heroes/${slug}${input.hero.ext}`;
    writeFileSync(join(HERO_DIR, basename(heroPath)), input.hero.data);
  }

  const product = upsertProduct({
    slug, name, manufacturer: manufacturer ?? null, summary: summary ?? null, heroPath,
  });
  await report(`Indexing ${name}…`);

  let totalPages = 0;
  let sampleText = "";
  const concepts: ProfileConceptInput[] = [];

  for (const { file, kind, pages } of rendered) {
    await report(`Rendering ${file.filename}…`);
    mkdirSync(PDF_DIR, { recursive: true });
    writeFileSync(join(PDF_DIR, file.filename), file.data);
    const manual = upsertManual({
      productId: product.id, kind, title: titleFromName(file.filename),
      pdfPath: `pdfs/${file.filename}`, pageCount: pages.length,
    });
    totalPages += pages.length;
    mkdirSync(join(PAGES_DIR, manual.id), { recursive: true });

    for (const page of pages) {
      writeFileSync(join(PAGES_DIR, manual.id, `${page.pageNumber}.png`), page.png);
      upsertPageImage({
        manualId: manual.id, productId: product.id, pageNumber: page.pageNumber,
        pngPath: `pages/${manual.id}/${page.pageNumber}.png`, width: page.width, height: page.height,
      });
    }

    let done = 0;
    const captions = new Map<number, string>();
    await pMap(pages, input.concurrency ?? 5, async (page) => {
      // Reuse a cached caption (cheap re-runs) — the expensive vision call only
      // fires when this page has never been captioned.
      const existing = getPageImage(product.id, kind, page.pageNumber);
      let caption = existing?.caption ?? "";
      if (!caption) {
        const cap = await captionPage(page.png, provider, model, apiKey);
        caption = cap.text;
        inputTokens += cap.inputTokens; outputTokens += cap.outputTokens;
        setPageCaption(manual.id, page.pageNumber, caption);
      }
      captions.set(page.pageNumber, caption);
      await report(`Reading ${file.filename}: ${++done}/${pages.length} pages`);
    });

    if (sampleText.length < 4000) {
      for (const page of pages) {
        const c = captions.get(page.pageNumber);
        if (c) sampleText += c.slice(0, 600) + "\n";
        if (sampleText.length >= 4000) break;
      }
    }

    concepts.push({
      title: manual.title, source: manual.pdfPath, manualKind: kind,
      units: pages.map((page) => ({
        label: `Page ${page.pageNumber}`,
        text: captions.get(page.pageNumber) ?? "",
        imageUrl: `/assets/pages/${manual.id}/${page.pageNumber}.png`,
      })),
    });
  }

  // Non-PDF sources (web pages, YouTube transcripts) → text-only concepts. Their
  // text lives in the Profile markdown (canonical). Failures are per-source and
  // never abort the whole ingest.
  for (const src of input.webSources ?? []) {
    await report(`Fetching ${src.url}…`);
    let fetched;
    try { fetched = await fetchWebSource(src.url); }
    catch (e: any) { await report(`Skipped ${src.url}: ${String(e?.message ?? e)}`); continue; }
    const manual = upsertSourceManual({
      productId: product.id, kind: "other", title: src.title ?? fetched.title,
      sourceRef: src.url, pageCount: fetched.sections.length,
    });
    concepts.push({
      title: manual.title, source: src.url,
      units: fetched.sections.map((text, i) => ({ label: `Section ${i + 1}`, text })),
    });
    if (sampleText.length < 4000 && fetched.sections[0]) sampleText += fetched.sections[0].slice(0, 600) + "\n";
    await report(`Fetched source: ${manual.title} (${fetched.sections.length} sections)`);
  }

  // Author the canonical Profile from everything captured. This deletes and
  // rewrites the bundle (fresh-start) and seeds the media index with `page`
  // items, so it MUST run before any other addMedia (mesh/video/images).
  await report("Writing product Profile…");
  const authored = authorFromUnits(slug, { name, manufacturer: manufacturer ?? null, summary: summary ?? null }, concepts);
  await report(`Profile ready: ${authored.concepts} concepts`);

  // 3D meshes, repair video, and loose images → flat media. Best-effort: a
  // failure here must never abort the ingest (the markdown is already written).
  try {
    if (input.models?.length) {
      await report("Adding 3D part models…");
      const mesh = await addMeshParts(slug, input.models, { onProgress: report });
      await report(`3D models: ${mesh.parts} parts in ${mesh.subsystems} subsystems`);
    }
    if (input.video) {
      await report("Adding repair video…");
      await addVideo(slug, input.video, { provider, model, apiKey, onProgress: report });
    }
    if (input.images?.length) {
      await report("Adding images…");
      const items: MediaItem[] = input.images.map((img) => {
        const link = writeMedia(slug, img.filename, img.data);
        return {
          id: `image:${img.filename}`, kind: "image" as const,
          url: `/assets/products/${slug}/${link}`,
          caption: titleFromName(img.filename.replace(/\.[^.]+$/, "")),
        };
      });
      addMedia(slug, items);
      await report(`Images: ${items.length}`);
    }
  } catch (e: any) {
    await report(`Media step skipped: ${String(e?.message ?? e)}`);
  }

  // Record catalogued-but-not-ingested files (STP/STEP source, gcode, other) so
  // the bundle is a complete manifest of the dropped folder.
  if (input.resources?.length) {
    mkdirSync(join(PRODUCTS_DIR, slug), { recursive: true });
    writeFileSync(join(PRODUCTS_DIR, slug, "resources.json"), JSON.stringify(input.resources, null, 2));
  }

  // Build the compiled index ONCE — chunks the authored markdown and embeds
  // chunks + media captions into a single binary vector store. Runtime does zero
  // processing after this. Best-effort: retrieval falls back to grep without it.
  try {
    await report("Building index…");
    const idx = await buildIndex(slug);
    await report(`Index: ${idx.chunks} chunks${idx.embedded ? " + embeddings" : ""}`);
  } catch (e: any) {
    await report(`Index skipped: ${String(e?.message ?? e)}`);
  }

  // Product-specific starter questions: one cheap text call, stored for reuse.
  // Best-effort — a failure here must never fail the whole ingest.
  try {
    await report("Writing starter questions…");
    const starters = await generateStarters({
      provider, model, apiKey, name, manufacturer, summary,
      manualTitles: concepts.map((c) => c.title), sampleText,
    });
    if (starters.length) setSetting(`starters:${product.id}`, JSON.stringify(starters));
  } catch { /* keep the generic fallback */ }

  await report(`Indexed ${name}`);
  return { product, inputTokens, outputTokens, pages: totalPages };
}
