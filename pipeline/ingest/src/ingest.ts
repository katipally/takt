import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import {
  PAGES_DIR, PDF_DIR, HERO_DIR, PRODUCTS_DIR, DATA_DIR,
  upsertProduct, upsertManual, upsertSourceManual, upsertPageImage, getCachedPage,
  setPageCaption, setSetting, replaceProductGraph, contentHash,
  getManualByKind, setProductHero,
} from "@takt/db";
import { writeMedia, addMedia, loadMedia, embedGraph, type MediaItem } from "@takt/profile";
import { linkGraph } from "./link.js";
import { renderPdf } from "./pdf.js";
import { parsePage, parsePageText, parseImage, generateStarters, detectProduct } from "./caption.js";
import { modelVision } from "@takt/shared";
import { fetchWebSource } from "./sources.js";
import { authorFromUnits, type ProfileConceptInput } from "./author.js";
import { buildGraphInput, type PageParse } from "./graph-build.js";
import { addMeshParts, type ModelFile } from "./mesh.js";
import { addVideo, type VideoFile } from "./video.js";
import { transcribeAudio } from "./transcribe.js";
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
  // Walkthrough/repair videos → each chaptered into timestamped `video_clip` media.
  videos?: VideoFile[];
  // Loose images → added as `image` media.
  images?: { filename: string; data: Uint8Array }[];
  // Audio (voice notes / recordings) → transcribed to text and folded in as
  // retrievable, linkable chunks. Best-effort: needs TAKT_WHISPER_CMD, else skipped.
  audios?: { filename: string; data: Uint8Array }[];
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

const safeJson = (s: string): any => { try { return JSON.parse(s); } catch { return undefined; } };

const mimeFromName = (f: string): string => {
  const e = f.toLowerCase().split(".").pop();
  return e === "jpg" || e === "jpeg" ? "image/jpeg" : e === "webp" ? "image/webp" : e === "gif" ? "image/gif" : "image/png";
};

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
  // Vision models parse the page IMAGE (richest, captures diagrams); text-only
  // models (e.g. MiniMax) parse the PDF's embedded text instead.
  const canSee = modelVision(provider.id, model);
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
  const pageParses: PageParse[] = []; // structured pages → knowledge graph

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

    // Write the png + row, carrying forward a cached caption/parse ONLY when the
    // image is byte-identical (hash), else clearing stale text (null overwrite).
    const cached = new Map<number, { caption: string; parseJson: string | null }>();
    for (const page of pages) {
      writeFileSync(join(PAGES_DIR, manual.id, `${page.pageNumber}.png`), page.png);
      const hash = contentHash(Buffer.from(page.png).toString("base64"));
      const hit = getCachedPage(manual.id, page.pageNumber, hash);
      if (hit) cached.set(page.pageNumber, hit);
      upsertPageImage({
        manualId: manual.id, productId: product.id, pageNumber: page.pageNumber,
        pngPath: `pages/${manual.id}/${page.pageNumber}.png`, width: page.width, height: page.height,
        pngHash: hash, caption: hit?.caption ?? null, parseJson: hit?.parseJson ?? null,
      });
    }

    let done = 0;
    const parses = new Map<number, { textMd: string; parse?: any }>();
    await pMap(pages, input.concurrency ?? 5, async (page) => {
      const hit = cached.get(page.pageNumber);
      if (hit) {
        // Unchanged page → reuse the cached transcription + structured parse (no LLM).
        parses.set(page.pageNumber, { textMd: hit.caption, parse: hit.parseJson ? safeJson(hit.parseJson) : undefined });
      } else {
        const r = canSee ? await parsePage(page.png, provider, model, apiKey)
                         : await parsePageText(page.text, provider, model, apiKey);
        inputTokens += r.inputTokens; outputTokens += r.outputTokens;
        const parse = { parts: r.parts, specs: r.specs, symptoms: r.symptoms, procedures: r.procedures, warnings: r.warnings, figures: r.figures };
        setPageCaption(manual.id, page.pageNumber, r.textMd, JSON.stringify(parse));
        parses.set(page.pageNumber, { textMd: r.textMd, parse });
      }
      await report(`Reading ${file.filename}: ${++done}/${pages.length} pages`);
    });

    for (const page of pages) {
      const pp = parses.get(page.pageNumber);
      if (!pp) continue;
      if (sampleText.length < 4000 && pp.textMd) sampleText += pp.textMd.slice(0, 600) + "\n";
      const p = pp.parse ?? {};
      pageParses.push({
        manualId: manual.id, manualKind: kind, page: page.pageNumber,
        imageUrl: `/assets/pages/${manual.id}/${page.pageNumber}.png`,
        textMd: pp.textMd,
        parts: p.parts, specs: p.specs, symptoms: p.symptoms, procedures: p.procedures, warnings: p.warnings, figures: p.figures,
      });
    }

    concepts.push({
      title: manual.title, source: manual.pdfPath, manualKind: kind,
      units: pages.map((page) => ({
        label: `Page ${page.pageNumber}`,
        text: parses.get(page.pageNumber)?.textMd ?? "",
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
    // Web-source text also goes into the graph as retrievable chunks (no figures).
    fetched.sections.forEach((text, i) => {
      pageParses.push({ manualId: manual.id, manualKind: "other", page: i + 1, imageUrl: "", textMd: text });
    });
    if (sampleText.length < 4000 && fetched.sections[0]) sampleText += fetched.sections[0].slice(0, 600) + "\n";
    await report(`Fetched source: ${manual.title} (${fetched.sections.length} sections)`);
  }

  // Audio → transcript (best-effort). Each becomes a text-only source concept +
  // graph chunk, so it's retrievable and the cross-modal linker can connect it.
  for (const au of input.audios ?? []) {
    await report(`Transcribing ${au.filename}…`);
    const transcript = transcribeAudio(au.filename, au.data);
    if (!transcript) { await report(`Skipped audio ${au.filename} (no transcript — set TAKT_WHISPER_CMD)`); continue; }
    const title = titleFromName(au.filename.replace(/\.[^.]+$/, ""));
    const manual = upsertSourceManual({ productId: product.id, kind: "other", title: `${title} (audio)`, sourceRef: au.filename, pageCount: 1 });
    concepts.push({ title: manual.title, source: au.filename, units: [{ label: "Transcript", text: transcript }] });
    pageParses.push({ manualId: manual.id, manualKind: "other", page: 1, imageUrl: "", textMd: transcript });
    if (sampleText.length < 4000) sampleText += transcript.slice(0, 600) + "\n";
    await report(`Transcribed ${au.filename}`);
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
      await report(`3D models: ${mesh.parts} parts in ${mesh.subsystems} subsystems${mesh.deduped ? ` (${mesh.deduped} duplicate-format twins skipped)` : ""}`);
    }
    for (const vid of input.videos ?? []) {
      await report(`Adding video ${vid.filename}…`);
      await addVideo(slug, vid, { provider, model, apiKey, onProgress: report });
    }
    if (input.images?.length) {
      await report("Adding images…");
      const items: MediaItem[] = [];
      let done = 0;
      for (const img of input.images) {
        const link = writeMedia(slug, img.filename, img.data);
        // Vision-caption each image so it's understood (not a filename). The rich
        // caption is what the cross-modal linker uses to connect it to the right
        // part/topic even when the file name says nothing.
        let caption = titleFromName(img.filename.replace(/\.[^.]+$/, ""));
        if (canSee) {
          try {
            const r = await parseImage(img.data, provider, model, apiKey, mimeFromName(img.filename));
            inputTokens += r.inputTokens; outputTokens += r.outputTokens;
            if (r.textMd.trim()) caption = r.textMd.trim().slice(0, 400);
          } catch { /* keep the filename caption */ }
        }
        items.push({ id: `image:${img.filename}`, kind: "image" as const, url: `/assets/products/${slug}/${link}`, caption });
        await report(`Reading images: ${++done}/${input.images.length}`);
      }
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

  // NOTE: the old flat markdown-chunk index (buildIndex → chunks.json + vectors.bin)
  // is retired — semantic search now lives in the KG (embedGraph writes vectors onto
  // the entity/chunk/media rows; retrieval fuses FTS + those vectors). The markdown
  // Profile remains as the human-editable export + read_profile source only.

  // Build the KNOWLEDGE GRAPH from the structured page parses + the media the
  // steps above wrote (3D parts, video clips, images). Deterministic + additive:
  // replaceProductGraph swaps this product's graph transactionally (no orphans).
  try {
    await report("Building knowledge graph…");
    const allMedia = loadMedia(slug);
    const meshes = allMedia.filter((m) => m.kind === "mesh").map((m) => ({ name: m.nodeName || m.caption, subsystem: m.subsystem, assetUrl: m.url, caption: m.caption }));
    const videos = allMedia.filter((m) => m.kind === "video_clip").map((m) => ({ name: m.caption.slice(0, 60), assetUrl: m.url, caption: m.caption, tStart: m.tStart, tEnd: m.tEnd }));
    const imgs = allMedia.filter((m) => m.kind === "image").map((m) => ({ name: m.caption, assetUrl: m.url, caption: m.caption }));
    const graph = buildGraphInput({ productId: product.id, pages: pageParses, meshes, videos, images: imgs });
    // Embed every entity/chunk/media INTO the graph rows (the unified store), then
    // run the linking cascade (fuzzy + embedding cross-modal) so media/topics that
    // don't share an exact name still connect. Both are best-effort.
    const embedded = await embedGraph(graph);
    await linkGraph(graph, { onProgress: report });
    replaceProductGraph(product.id, graph);
    await report(`Graph: ${graph.entities.length} entities, ${graph.edges.length} links, ${graph.media.length} media${embedded ? " + embeddings" : ""}`);
  } catch (e: any) {
    await report(`Graph skipped: ${String(e?.message ?? e)}`);
  }

  // Auto-pick a hero when none was uploaded, so the product never shows an empty
  // hero. Best available image: a loose product photo, else the owner manual's
  // cover (page 1) — a real picture beats a dim letter everywhere it's shown.
  if (!heroPath) {
    try {
      const looseImg = loadMedia(slug).find((m) => m.kind === "image");
      let auto: string | null = looseImg?.url ? looseImg.url.replace(/^\/assets\//, "") : null;
      if (!auto) {
        const owner = getManualByKind(product.id, "owner");
        const cover = owner ? `pages/${owner.id}/1.png` : null;
        if (cover && existsSync(join(DATA_DIR, cover))) auto = cover;
      }
      if (auto) { setProductHero(product.id, auto); await report("Set product hero"); }
    } catch { /* best-effort — a missing hero just falls back to the letter */ }
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
