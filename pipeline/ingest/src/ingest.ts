import { writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import {
  PAGES_DIR, PDF_DIR, HERO_DIR,
  upsertProduct, upsertManual, upsertSourceManual, upsertPageImage, getPageImage,
  setPageCaption, setSetting,
} from "@takt/db";
import { renderPdf } from "./pdf.js";
import { captionPage, generateStarters } from "./caption.js";
import { fetchWebSource } from "./sources.js";
import { authorFromUnits, type ProfileConceptInput } from "./author.js";
import { buildPkb, type ExtractUnit } from "./extract.js";
import { addMeshParts, addVideo, type ModelFile, type VideoFile } from "./mesh.js";
import type { ManualKind, Product } from "@takt/shared";
import type { ProviderInfo } from "@takt/harness";

export interface IngestInput {
  slug: string;
  name: string;
  manufacturer?: string | null;
  summary?: string | null;
  pdfs?: { filename: string; data: Uint8Array }[];
  // Non-PDF sources ingested as text-only (web pages, YouTube transcripts).
  webSources?: { url: string; title?: string }[];
  // 3D part models (STL) → converted to .glb and anchored as Part entities.
  models?: ModelFile[];
  // A repair/walkthrough video → attached as a video_clip anchor.
  video?: VideoFile;
  hero?: { ext: string; data: Uint8Array };
  // Which provider + model captions the pages (resolved by the caller — the
  // server from DB settings, the CLI from flags/env). No provider is hardcoded.
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

async function pMap<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

/**
 * Ingest a product: render → caption → author its Profile → compile the PKB. The
 * Profile markdown is the human-editable source of truth; the PKB (.pkb/: graph
 * + chunks + vectors) is a regenerable index over it that powers hybrid
 * retrieval. page_images are kept so get_page_image can still SHOW a page.
 */
export async function ingestProduct(input: IngestInput): Promise<IngestResult> {
  const report = async (m: string) => { await input.onProgress?.(m); };
  const units: ExtractUnit[] = []; // fed to buildPkb (the PKB compile step)

  let heroPath: string | null = null;
  if (input.hero) {
    mkdirSync(HERO_DIR, { recursive: true });
    heroPath = `heroes/${input.slug}${input.hero.ext}`;
    writeFileSync(join(HERO_DIR, basename(heroPath)), input.hero.data);
  }

  const product = upsertProduct({
    slug: input.slug, name: input.name, manufacturer: input.manufacturer ?? null,
    summary: input.summary ?? null, heroPath,
  });
  await report(`Indexing ${input.name}…`);

  let inputTokens = 0, outputTokens = 0, totalPages = 0;
  let sampleText = "";
  const concepts: ProfileConceptInput[] = [];

  for (const file of input.pdfs ?? []) {
    const kind = manualKindFromName(file.filename);
    await report(`Rendering ${file.filename}…`);
    const pages = renderPdf(file.data);

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
      const existing = getPageImage(product.id, kind, page.pageNumber);
      let caption = existing?.caption ?? "";
      if (!caption) {
        const cap = await captionPage(page.png, input.captionProvider, input.captionModel, input.apiKey);
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
      title: manual.title, source: manual.pdfPath,
      units: pages.map((page) => ({
        label: `Page ${page.pageNumber}`,
        text: captions.get(page.pageNumber) ?? "",
        imageUrl: `/assets/pages/${manual.id}/${page.pageNumber}.png`,
      })),
    });
    for (const page of pages) {
      units.push({
        sourceId: `${manual.id}#p${page.pageNumber}`, conceptId: manual.title, title: manual.title,
        manualKind: kind, page: page.pageNumber, text: captions.get(page.pageNumber) ?? "",
      });
    }
  }

  // Non-PDF sources (web pages, YouTube transcripts) → text-only concepts. Their
  // text lives in the Profile markdown (canonical); no separate store. Failures
  // are per-source and never abort the whole ingest.
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
    fetched.sections.forEach((text, i) => units.push({
      sourceId: `${manual.id}#s${i + 1}`, conceptId: manual.title, title: manual.title, text,
    }));
    if (sampleText.length < 4000 && fetched.sections[0]) sampleText += fetched.sections[0].slice(0, 600) + "\n";
    await report(`Fetched source: ${manual.title} (${fetched.sections.length} sections)`);
  }

  // Author the canonical Profile from everything we captured. The markdown is the
  // store — the agent greps/reads it directly, no compile step.
  await report("Writing product Profile…");
  const authored = authorFromUnits(input.slug, {
    name: input.name, manufacturer: input.manufacturer ?? null, summary: input.summary ?? null,
  }, concepts);
  await report(`Profile ready: ${authored.concepts} concepts`);

  // Compile the PKB (entity/edge/anchor graph + chunks + vectors) from the same
  // captured units. Best-effort — a failure here must never fail the ingest; the
  // agent still has grep_profile over the markdown as a fallback.
  try {
    await report("Building product knowledge graph…");
    const pkb = await buildPkb(input.slug, units, {
      provider: input.captionProvider, model: input.captionModel, apiKey: input.apiKey,
      concurrency: input.concurrency, onProgress: report,
    });
    inputTokens += pkb.inputTokens; outputTokens += pkb.outputTokens;
    await report(`Knowledge graph: ${pkb.entities} entities, ${pkb.edges} links, ${pkb.anchors} anchors`);

    // Fold 3D part models + video into the graph (deterministic, no LLM).
    if (input.models?.length) {
      await report("Adding 3D part models…");
      const mesh = await addMeshParts(input.slug, input.models, { onProgress: report });
      await report(`3D models: ${mesh.parts} parts in ${mesh.subsystems} subsystems`);
    }
    if (input.video) {
      await addVideo(input.slug, input.video, { onProgress: report });
    }
  } catch (e: any) {
    await report(`Knowledge graph skipped: ${String(e?.message ?? e)}`);
  }

  // Product-specific starter questions: one cheap text call, stored for reuse.
  // Best-effort — a failure here must never fail the whole ingest.
  try {
    await report("Writing starter questions…");
    const starters = await generateStarters({
      provider: input.captionProvider, model: input.captionModel, apiKey: input.apiKey,
      name: input.name, manufacturer: input.manufacturer, summary: input.summary,
      manualTitles: concepts.map((c) => c.title), sampleText,
    });
    if (starters.length) setSetting(`starters:${product.id}`, JSON.stringify(starters));
  } catch { /* keep the generic fallback */ }

  await report(`Indexed ${input.name}`);
  return { product, inputTokens, outputTokens, pages: totalPages };
}
