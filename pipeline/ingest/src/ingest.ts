import { writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import {
  PAGES_DIR, PDF_DIR, HERO_DIR,
  upsertProduct, upsertManual, upsertPageImage, getPageImage,
  setPageCaption, chunkExists, insertChunk, setSetting,
} from "@prox/db";
import { embedPassages } from "@prox/embed";
import { renderPdf } from "./pdf.js";
import { captionPage, generateStarters } from "./caption.js";
import { chunkPage } from "./chunk.js";
import type { ManualKind, Product } from "@prox/shared";

export interface IngestInput {
  slug: string;
  name: string;
  manufacturer?: string | null;
  summary?: string | null;
  pdfs: { filename: string; data: Uint8Array }[];
  hero?: { ext: string; data: Uint8Array };
  captionModel?: string;
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

/** Ingest a product end to end: render → caption → chunk → embed → index. */
export async function ingestProduct(input: IngestInput): Promise<IngestResult> {
  const report = async (m: string) => { await input.onProgress?.(m); };

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
  const manualTitles: string[] = [];
  let sampleText = "";

  for (const file of input.pdfs) {
    const kind = manualKindFromName(file.filename);
    await report(`Rendering ${file.filename}…`);
    const pages = renderPdf(file.data);

    mkdirSync(PDF_DIR, { recursive: true });
    writeFileSync(join(PDF_DIR, file.filename), file.data);
    const manual = upsertManual({
      productId: product.id, kind, title: titleFromName(file.filename),
      pdfPath: `pdfs/${file.filename}`, pageCount: pages.length,
    });
    manualTitles.push(manual.title);
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
        const cap = await captionPage(page.png, input.captionModel, input.apiKey);
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

    const drafts = pages.flatMap((page) =>
      chunkPage({ productSlug: input.slug, manualKind: kind, pageNumber: page.pageNumber, text: page.text, caption: captions.get(page.pageNumber) ?? "" }),
    ).filter((d) => !chunkExists(d.contentHash));
    if (drafts.length) {
      await report(`Embedding ${drafts.length} passages…`);
      const vectors = await embedPassages(drafts.map((d) => d.content));
      drafts.forEach((d, i) => insertChunk({
        productId: product.id, manualId: manual.id, pageNumber: d.pageNumber,
        kind: d.kind, content: d.content, contentHash: d.contentHash, embedding: vectors[i]!,
      }));
    }
  }
  // Product-specific starter questions: one cheap text call, stored for reuse.
  // Best-effort — a failure here must never fail the whole ingest.
  try {
    await report("Writing starter questions…");
    const starters = await generateStarters({
      model: input.captionModel ?? "claude-sonnet-5", apiKey: input.apiKey,
      name: input.name, manufacturer: input.manufacturer, summary: input.summary,
      manualTitles, sampleText,
    });
    if (starters.length) setSetting(`starters:${product.id}`, JSON.stringify(starters));
  } catch { /* keep the generic fallback */ }

  await report(`Indexed ${input.name}`);
  return { product, inputTokens, outputTokens, pages: totalPages };
}
