import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z, type ZodRawShape } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Product, Manual, ManualKind, SseEvent, AskAnswer } from "@takt/shared";
import { askQuestionsSchema, uiSurfaceSchema, validateSurface, surfacePartId } from "@takt/shared";
import { lintSurface, p0, lintFeedback } from "./lint-surface.js";
import {
  DATA_DIR, getPageImage,
  listProducts, getProductBySlug,
} from "@takt/db";
import {
  profileExists, listConcepts, readConcept, readIndex, generateIndex, grepProfile,
  pkbExists, loadGraph, neighbors, getEntityAnchors, anchorLabel,
  findEntity, walkGraph, getAnchors, searchProduct, queryProduct,
  type Anchor,
} from "@takt/profile";
import { awaitAnswers } from "./pending.js";

export type Emit = (e: SseEvent) => Promise<void> | void;

// A tool the agent loop can call directly: JSON-Schema params for the model,
// and an execute() returning text (+ optional images fed back for vision).
export interface TaktTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: any) => Promise<ToolResult>;
}
export interface ToolResult {
  output: string;
  images?: { data: string; mime: string }[];
  isError?: boolean;
}

const WEB_URL = () => process.env.WEB_PUBLIC_URL ?? "http://localhost:3000";
const text = (t: string): ToolResult => ({ output: t });
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 64) || "artifact";

// Minimal HTML → text for fetch_url: drop script/style, strip tags, unescape the
// common entities, collapse whitespace. ponytail: naive strip, not a full
// readability parse — enough to give the model the page's words.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Zod shape → JSON Schema for the model. Inline refs and drop $schema so every
// provider adapter (Anthropic input_schema / OpenAI parameters / Google) accepts it.
// ponytail: args aren't re-validated against the schema before execute() — the
// model follows the schema, and emit_ui re-validates its own surface anyway.
function params(shape: ZodRawShape): Record<string, unknown> {
  const js = zodToJsonSchema(z.object(shape), { $refStrategy: "none" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

const formatAnswer = (a: AskAnswer) =>
  a.skipped ? "(skipped — no preference)" : Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;

// Rewrite bundle-relative media links (media/…) to servable /assets URLs so the
// model gets usable image/video/3D URLs it can show; absolute /assets links pass
// through unchanged.
const resolveMedia = (slug: string, body: string): string =>
  body.replace(/\]\(media\//g, `](/assets/products/${slug}/media/`);

// Turn a PKB anchor into an actionable instruction telling the model exactly how
// to SHOW it in an artifact (which crop_page_image call, or which URL to embed).
function renderAnchorHint(a: Anchor, slug: string): string {
  const r = a.ref as any;
  const cap = a.caption ? ` — ${a.caption}` : "";
  const abs = (u: string) => (u?.startsWith("/") ? `${WEB_URL()}${u}` : u);
  switch (a.kind) {
    case "manual_page": {
      const bbox = Array.isArray(r.bbox) ? r.bbox : null;
      const m = r.manualKind ? `, manual:"${r.manualKind}"` : "";
      const crop = bbox
        ? `call crop_page_image(page:${r.page}${m}, x:${bbox[0]}, y:${bbox[1]}, w:${bbox[2]}, h:${bbox[3]}) to embed just this figure`
        : `call get_page_image(page:${r.page}${m}) to SEE the page, then crop_page_image to the exact region that matters — do NOT embed the whole page`;
      return `- manual page ${r.page}${cap}: ${crop}`;
    }
    case "mesh_node":
      return `- 3D part "${r.nodeName}"${cap}: embed an interactive Model3D node with src "${abs(r.meshUrl)}" — a rotatable 3D part beats a photo when the user wants to SEE the part`;
    case "video_clip": {
      const frag = (r.tStart || r.tEnd) ? `#t=${Math.floor(r.tStart ?? 0)}${r.tEnd ? "," + Math.floor(r.tEnd) : ""}` : "";
      return `- video ${cap || "clip"}: embed a Video node with src "${abs(r.videoUrl)}${frag}"${frag ? " (plays just that snippet)" : ""}`;
    }
    case "image":
      return `- image${cap}: embed an Image node with src "${abs(r.url)}"`;
    case "audio":
      return `- audio${cap}: embed an Audio node with src "${abs(r.url)}"`;
    default:
      return `- ${a.kind}${cap}`;
  }
}

// Overlay a faint 0–1 coordinate grid on the image the MODEL sees (vision only),
// so it can read a feature's position straight off the grid instead of guessing —
// this is what makes crop regions and <takt-figure> annotations land accurately.
// The user-facing image (the file on disk / its URL) is never touched.
async function withCoordGrid(buf: Buffer): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!w || !h) return buf;
  const L: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const x = Math.round((i / 10) * w), y = Math.round((i / 10) * h);
    L.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#ff3b00" stroke-opacity="0.28" stroke-width="1"/>`);
    L.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#ff3b00" stroke-opacity="0.28" stroke-width="1"/>`);
    if (i > 0 && i < 10) {
      const f = (i / 10).toFixed(1);
      L.push(`<text x="${x + 2}" y="14" font-size="13" fill="#ff3b00" font-family="sans-serif">${f}</text>`);
      L.push(`<text x="3" y="${y - 3}" font-size="13" fill="#ff3b00" font-family="sans-serif">${f}</text>`);
    }
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${L.join("")}</svg>`);
  return sharp(buf).composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

export function buildTaktTools(ctx: { product: Product | null; manuals: Manual[]; emit: Emit; chatId?: string; spawnBuild?: (brief: string, key?: string) => void }): TaktTool[] {
  const { product, emit, chatId, spawnBuild } = ctx;
  // Master mode = no single product selected → cross-product tools; the page
  // tools then require a `product` slug to say which product to read from.
  const masterMode = !product;
  // Bound one-shot anti-slop gate, keyed per surface: a Page with P0 design
  // issues is rejected ONCE per key (fed back for self-correction), then allowed
  // through — so a stubborn model can't loop forever, and a DIFFERENT sloppy page
  // later in the turn still gets its own correction pass.
  const lintRejected = new Set<string>();

  // Which product a page tool should read: the bound one in single-product mode,
  // or the slug the model passed in master mode.
  const pageProduct = (args: any): Product | null =>
    product ?? (args.product ? getProductBySlug(String(args.product)) ?? null : null);

  // Which products a Profile tool should target: the bound one, or the slug the
  // model passed, or (master, no slug) every product.
  const targetProducts = (args: any): Product[] =>
    product ? [product]
      : args.product ? [getProductBySlug(String(args.product))].filter(Boolean) as Product[]
      : listProducts();

  // FIND — grep the product's Profile markdown (Direct Corpus Interaction). Pure
  // lexical scan, so the model must search the vocabulary the Profile uses; the
  // description steers it to list_profile first and to try synonyms.
  const grepProfileTool: TaktTool = {
    name: "grep_profile",
    description: "Search a product's Profile (its knowledge, stored as markdown) for a keyword or regex — your primary FIND tool, like grep over the product's docs. Returns matching lines grouped by concept, densest first, with line numbers. It's LEXICAL: search the words the docs actually use. Workflow: call list_profile first to learn the product's vocabulary, grep a term (try synonyms if empty), then read_profile the promising concept for full context. Cite the concept a fact came from.",
    parameters: params({
      query: z.string().describe("Keyword, phrase, or regex to search for (case-insensitive)"),
      ...(masterMode ? { product: z.string().optional().describe("Restrict to one product's slug; omit to grep across ALL products") } : {}),
    }),
    execute: async (args) => {
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "grep_profile", summary: String(args.query) });
      const targets = targetProducts(args);
      const blocks: string[] = [];
      let total = 0;
      for (const p of targets) {
        if (!profileExists(p.slug)) continue;
        const groups = grepProfile(p.slug, String(args.query));
        if (!groups.length) continue;
        const inner = groups.map((g) => {
          total += g.count;
          const lines = g.hits.map((h) => `  L${h.line}: ${h.text}`).join("\n");
          const more = g.count > g.hits.length ? ` (+${g.count - g.hits.length} more)` : "";
          return `[${g.conceptTitle} · ${g.conceptId}] ${g.count} match${g.count === 1 ? "" : "es"}${more}\n${lines}`;
        }).join("\n\n");
        blocks.push(targets.length > 1 ? `### ${p.name} [${p.slug}]\n${inner}` : inner);
      }
      await emit({ type: "tool_done", id, detail: total ? `${total} match${total === 1 ? "" : "es"}` : "no matches" });
      if (!blocks.length) return text(`No matches for "${args.query}". Call list_profile to see the concepts and the exact vocabulary, then grep a synonym.`);
      return text(`${blocks.join("\n\n")}\n\nRead a concept in full with read_profile(concept: "<id>"${masterMode ? ', product: "<slug>"' : ""}).`);
    },
  };

  // MAP — list the Profile's concepts so the model orients (and learns vocabulary)
  // before grepping/reading. Master mode with no slug lists the products instead.
  const listProfileTool: TaktTool = {
    name: "list_profile",
    description: "List a product's Profile concepts — the MAP of what's known: each concept's id, title, type and one-line description. Call this FIRST to see what knowledge exists and learn the product's exact vocabulary before you grep_profile or read_profile. In master mode with no product, it lists the available products.",
    parameters: params({
      ...(masterMode ? { product: z.string().optional().describe("Product slug to map; omit to list all products") } : {}),
    }),
    execute: async (args) => {
      const id = randomUUID();
      const prod = pageProduct(args);
      await emit({ type: "tool_start", id, tool: "list_profile", summary: prod ? prod.slug : "products" });
      if (!prod) {
        const ps = listProducts();
        await emit({ type: "tool_done", id, detail: `${ps.length} products` });
        return text(`Products (call list_profile with a product slug to map one):\n${ps.map((p) => `- ${p.name} [${p.slug}]`).join("\n")}`);
      }
      if (!profileExists(prod.slug)) { await emit({ type: "tool_done", id, detail: "no profile" }); return text(`No Profile for ${prod.name} yet.`); }
      const ids = listConcepts(prod.slug).map((c) => c.id);
      await emit({ type: "tool_done", id, detail: `${ids.length} concepts` });
      const index = readIndex(prod.slug) ?? generateIndex(prod.slug, prod.name);
      return text(`${index}\n\nConcept ids (read with read_profile): ${ids.join(", ")}`);
    },
  };

  const getPageImageTool: TaktTool = {
    name: "get_page_image",
    description: "Fetch a specific manual page as an image and SHOW it to the user. Use for diagrams, schematics, control-panel layouts, duty-cycle tables, the selection chart, and weld-diagnosis pages. The page is displayed in the user's Canvas and also returned so you can read it. The returned page has a faint 0–1 coordinate grid overlaid FOR YOUR REFERENCE (the user sees it clean) — use it to pick accurate crop x,y,w,h. To put a figure in an artifact, prefer calling crop_page_image next to embed just the relevant region rather than the whole page.",
    parameters: params({
      page: z.number().int().min(1).describe("Page number"),
      manual: z.string().optional()
        .describe("Which manual kind to read from, e.g. 'owner' or 'quick_start' (omit to use any). Get valid kinds from list_profile."),
      ...(masterMode ? { product: z.string().describe("Which product's page — pass its slug (required in master mode). Get slugs from list_products / grep_profile.") } : {}),
    }),
    execute: async (args) => {
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "get_page_image", summary: `page ${args.page}` });
      const prod = pageProduct(args);
      if (!prod) { await emit({ type: "tool_done", id, detail: "no product" }); return text("Specify which product to read from by passing its `product` slug (see list_products)."); }
      const pi = getPageImage(prod.id, (args.manual as ManualKind) ?? null, args.page);
      await emit({ type: "tool_done", id, detail: pi ? `p.${pi.pageNumber}` : "not found" });
      if (!pi) return text(`No page ${args.page} found for ${args.manual ?? prod.name}.`);
      const citationId = randomUUID();
      const url = `${WEB_URL()}/assets/${pi.pngPath}`;
      await emit({
        type: "page_image", citationId, url,
        page: pi.pageNumber, manualKind: pi.manualKind, manualTitle: pi.manualTitle, caption: pi.caption,
        productSlug: prod.slug, productName: prod.name,
      });
      let images: ToolResult["images"];
      try {
        const gridded = await withCoordGrid(readFileSync(resolve(DATA_DIR, pi.pngPath)));
        images = [{ data: gridded.toString("base64"), mime: "image/png" }];
      } catch { /* fall through to text-only */ }
      // Give the model the real URL so it can embed this exact image in an
      // artifact (it must never invent an image URL).
      const meta = `Showing ${pi.manualTitle} p.${pi.pageNumber}. For an artifact, prefer crop_page_image to embed just the relevant region; or use this full-page URL verbatim as the <img> src: ${url}${pi.caption ? `\nPage content:\n${pi.caption}` : ""}`;
      return { output: meta, images };
    },
  };

  const cropPageImage: TaktTool = {
    name: "crop_page_image",
    description: "Crop a manual page to the exact region that matters and SHOW that crop — use this AFTER get_page_image so you've seen the full page and can pick the region. Give the region as fractions of the page (0=left/top, 1=right/bottom): x,y = top-left corner, w,h = width,height. The cropped image is displayed in the user's Canvas and returned so you can confirm it, and you get a verbatim URL to embed in an artifact. The returned crop has a faint 0–1 coordinate GRID overlaid FOR YOUR REFERENCE ONLY (the user sees the clean crop) — when you add <takt-figure> annotations, read each feature's x,y straight off this grid so arrows/boxes/labels land ACCURATELY on the right part. Prefer this over embedding a whole page (whole pages have tab-strips/footers/whitespace and look broken).",
    parameters: params({
      page: z.number().int().min(1).describe("Page number"),
      manual: z.string().optional()
        .describe("Which manual kind to read from, e.g. 'owner' or 'quick_start' (omit to use any). Get valid kinds from list_profile."),
      x: z.number().min(0).max(1).describe("Left edge of the crop, as a fraction of page width (0-1)"),
      y: z.number().min(0).max(1).describe("Top edge of the crop, as a fraction of page height (0-1)"),
      w: z.number().min(0.02).max(1).describe("Crop width, as a fraction of page width (0-1)"),
      h: z.number().min(0.02).max(1).describe("Crop height, as a fraction of page height (0-1)"),
      ...(masterMode ? { product: z.string().describe("Which product's page — pass its slug (required in master mode).") } : {}),
    }),
    execute: async (args) => {
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "crop_page_image", summary: `page ${args.page}` });
      const prod = pageProduct(args);
      if (!prod) { await emit({ type: "tool_done", id, detail: "no product" }); return text("Specify which product to read from by passing its `product` slug (see list_products)."); }
      const pi = getPageImage(prod.id, (args.manual as ManualKind) ?? null, args.page);
      if (!pi) { await emit({ type: "tool_done", id, detail: "not found" }); return text(`No page ${args.page} found for ${args.manual ?? prod.name}.`); }
      const src = resolve(DATA_DIR, pi.pngPath);
      // Read real pixel dims from the file — don't trust the DB column.
      let imgW = 0, imgH = 0;
      try { const m = await sharp(src).metadata(); imgW = m.width ?? 0; imgH = m.height ?? 0; } catch { /* missing file */ }
      if (!imgW || !imgH) { await emit({ type: "tool_done", id, detail: "unreadable" }); return text(`Page ${args.page} image could not be read; embed the full page via get_page_image instead.`); }
      // Fractions → pixels, clamped so the box always stays inside the page.
      const left = Math.min(Math.max(Math.round(args.x * imgW), 0), imgW - 1);
      const top = Math.min(Math.max(Math.round(args.y * imgH), 0), imgH - 1);
      const cw = Math.min(Math.max(Math.round(args.w * imgW), 1), imgW - left);
      const ch = Math.min(Math.max(Math.round(args.h * imgH), 1), imgH - top);
      const r = (n: number) => Math.round(n * 1000);
      const cropRel = `scratch/crops/${pi.manualId}/${pi.pageNumber}_${r(args.x)}_${r(args.y)}_${r(args.w)}_${r(args.h)}.png`;
      const dest = resolve(DATA_DIR, cropRel);
      try {
        if (!existsSync(dest)) {
          mkdirSync(dirname(dest), { recursive: true });
          await sharp(src).extract({ left, top, width: cw, height: ch }).png().toFile(dest);
        }
      } catch (e) {
        await emit({ type: "tool_done", id, detail: "crop failed" });
        return text(`Could not crop page ${args.page}: ${(e as Error).message}. Embed the full page via get_page_image instead.`);
      }
      const citationId = randomUUID();
      const url = `${WEB_URL()}/assets/${cropRel}`;
      await emit({
        type: "page_image", citationId, url,
        page: pi.pageNumber, manualKind: pi.manualKind, manualTitle: pi.manualTitle, caption: pi.caption,
        productSlug: prod.slug, productName: prod.name,
      });
      await emit({ type: "tool_done", id, detail: `p.${pi.pageNumber} crop` });
      let images: ToolResult["images"];
      try { const gridded = await withCoordGrid(readFileSync(dest)); images = [{ data: gridded.toString("base64"), mime: "image/png" }]; } catch { /* text-only */ }
      const meta = `Cropped ${pi.manualTitle} p.${pi.pageNumber}. To embed this exact crop in an artifact, use this URL verbatim as the <img> src: ${url}`;
      return { output: meta, images };
    },
  };

  // DRAW — render a designed answer on the stage as a declarative UI surface
  // The primary surface is a single `Page` node (freeform HTML + islands);
  // smaller catalog nodes remain for simple surfaces. The vocabulary + rules live
  // in the system prompt (generated from the same schemas). Invalid surfaces are
  // rejected (schema + anti-slop) with precise errors so the model self-corrects
  // before anything shows.
  const emitUi: TaktTool = {
    name: "emit_ui",
    description: "Render a designed, multimodal answer on the main stage as a UI surface — reach for this when structure, media, data, or interaction beats plain prose (a diagram, chart, comparison table, image/gallery, 3D model, procedure, calculator, form). Skip it for a short factual reply — plain chat text already renders richly on the stage. A surface is a flat list of `nodes` (each `{ id, type, props, children? }`) with one `root`. For a rich answer, make `root` a single `Page` node — a full freeform HTML page that fills the canvas (see the DESIGN guide + island elements in your system prompt); use the smaller catalog components only for a simple surface. Prose still streams as normal chat text around it — use Prose nodes only inside a surface. Reuse the SAME `key` to revise a surface (new version); use a NEW `key` for a different one. If rejected, fix exactly what's listed and call emit_ui again with the same key.",
    parameters: params(uiSurfaceSchema.shape),
    execute: async (args) => {
      const id = randomUUID();
      const title = typeof args?.title === "string" && args.title ? args.title : "answer";
      await emit({ type: "tool_start", id, tool: "emit_ui", summary: title });
      // Auto-heal the most common LLM mistake: `root` points at an id that isn't
      // among the nodes. Pick the real root — the node no other node lists as a
      // child — else the first node. Saves a slow reject/retry round-trip.
      if (args && typeof args === "object" && Array.isArray(args.nodes) && args.nodes.length) {
        const ids = new Set(args.nodes.map((n: any) => n?.id));
        if (!ids.has(args.root)) {
          const childIds = new Set(args.nodes.flatMap((n: any) => (Array.isArray(n?.children) ? n.children : [])));
          const rootNode = args.nodes.find((n: any) => n?.id && !childIds.has(n.id)) ?? args.nodes[0];
          if (rootNode?.id) args.root = rootNode.id;
        }
      }
      const res = validateSurface(args);
      if (!res.ok) {
        await emit({ type: "tool_done", id, detail: `needs fixing: ${res.errors.slice(0, 2).map((e) => `${e.path} ${e.message}`).join("; ")}`.slice(0, 160) });
        return text(`UI surface rejected — fix these and call emit_ui again with the SAME key:\n- ${res.errors.map((e) => `${e.path}: ${e.message}`).join("\n- ")}`);
      }
      const partId = surfacePartId(res.surface);
      // Anti-slop design gate (Page surfaces only). Reject P0 issues ONCE per key
      // so the model revises before anything shows; then let it through.
      const lint = lintSurface(res.surface);
      const hard = p0(lint);
      if (hard.length && !lintRejected.has(partId)) {
        lintRejected.add(partId);
        await emit({ type: "tool_done", id, detail: `design fixes: ${hard.map((f) => f.rule).join(", ")}`.slice(0, 160) });
        return text(lintFeedback(hard));
      }
      await emit({ type: "ui_surface", partId, surface: { ...res.surface, id: res.surface.id || partId } });
      await emit({ type: "tool_done", id, detail: "rendered" });
      const advisories = lint.filter((f) => f.level !== "P0");
      const note = advisories.length ? ` (next time: ${advisories.slice(0, 2).map((f) => f.rule).join(", ")})` : "";
      return text(`Rendered "${title}" on the stage.${note} Give a one-line takeaway in chat if useful; don't repeat the surface's contents.`);
    },
  };

  // DELEGATE — hand a visual off to a background BUILD worker so you can keep
  // talking. The worker gathers sources and composes the surface on its own; it
  // appears on the stage when ready. Only present when a build lane is available.
  const delegateBuild: TaktTool | null = spawnBuild ? {
    name: "delegate_build",
    description: "Delegate building a designed visual (diagram, chart, annotated page, comparison, procedure, calculator) to a background worker, so you can keep answering the user WITHOUT waiting. Reach for this whenever a visual would help — especially when the answer draws on the product's sources (a figure to crop, specs to chart/table). The worker searches sources and composes the surface itself; it lands on the stage when done. Call this, tell the user in one line you're putting the visual together, and continue. Use the SAME `key` to revise a prior visual. Prefer delegate_build over emit_ui when the visual needs source-gathering; use emit_ui yourself only for a trivial surface you already have all the data for.",
    parameters: params({
      brief: z.string().min(1).describe("What to build, with enough detail for the worker to gather sources and design it (e.g. 'annotated diagram of the fuse box from p.42 with each fuse labeled')"),
      key: z.string().optional().describe("Reuse a prior visual's key to publish a new version; omit for a new one"),
    }),
    execute: async (args) => {
      const brief = String(args?.brief ?? "").trim();
      if (!brief) return text("delegate_build needs a brief.");
      spawnBuild(brief, typeof args?.key === "string" ? args.key : undefined);
      return text("Build started in the background — it'll appear on the stage when ready. Keep talking to the user; don't wait for it or restate its contents.");
    },
  } : null;

  // TODOS — publish/update a short working checklist shown in the status bar.
  const updateTodos: TaktTool = {
    name: "update_todos",
    description: "Publish or update a short checklist of what you're doing this turn, shown to the user in the status bar. Use it for a multi-step task (3+ steps) so they can see progress; mark items done as you go. Skip it for simple answers.",
    parameters: params({
      items: z.array(z.object({ text: z.string(), done: z.boolean() })).min(1).max(8).describe("The checklist, in order; set done:true for completed steps"),
    }),
    execute: async (args) => {
      const items = Array.isArray(args?.items) ? args.items.map((i: any) => ({ text: String(i.text ?? ""), done: !!i.done })).filter((i: any) => i.text) : [];
      await emit({ type: "todos", items });
      return text("Checklist updated.");
    },
  };

  // READ — the full text of one Profile concept, verbatim. The third leg of the
  // list → grep → read loop; call it on a concept grep_profile / list_profile
  // surfaced. Media links come back as /assets URLs the model can show.
  const readProfile: TaktTool = {
    name: "read_profile",
    description: "Read one Profile concept's full text VERBATIM. Use it after list_profile (to find concept ids) or grep_profile (to find the concept a match is in) to pull the complete context — specs, safety, a procedure, a part. Follow any [links](other.md) in the text by calling read_profile on that concept. Media in the text is given as /assets URLs you can show or embed.",
    parameters: params({
      concept: z.string().describe("Concept id to read (e.g. 'overview', 'specs'). Get ids from list_profile / grep_profile."),
      ...(masterMode ? { product: z.string().describe("Which product's Profile — pass its slug (required in master mode).") } : {}),
    }),
    execute: async (args) => {
      const id = randomUUID();
      const prod = pageProduct(args);
      await emit({ type: "tool_start", id, tool: "read_profile", summary: args.concept ? String(args.concept) : "?" });
      if (!prod) { await emit({ type: "tool_done", id, detail: "no product" }); return text("Specify which product by passing its `product` slug (see list_products)."); }
      if (!profileExists(prod.slug)) { await emit({ type: "tool_done", id, detail: "no profile" }); return text(`No Profile for ${prod.name} yet.`); }

      const conceptIds = listConcepts(prod.slug).map((c) => c.id);
      if (!args.concept) { await emit({ type: "tool_done", id, detail: "no concept" }); return text(`Pass a concept id. Available: ${conceptIds.join(", ")} (or call list_profile).`); }
      const concept = readConcept(prod.slug, String(args.concept));
      if (!concept) { await emit({ type: "tool_done", id, detail: "not found" }); return text(`No concept "${args.concept}". Available: ${conceptIds.join(", ")}`); }
      await emit({ type: "tool_done", id, detail: concept.id });
      const fm = concept.frontmatter;
      const head = `# ${fm.title ?? concept.id} (${fm.type})${fm.description ? `\n${fm.description}` : ""}`;
      return text(`${head}\n\n${resolveMedia(prod.slug, concept.body)}`);
    },
  };

  // ── PKB hybrid retrieval ─────────────────────────────────────────────────
  // These read the compiled knowledge graph (.pkb/) and only activate once a
  // product has one; grep_profile/read_profile remain the fallback over raw
  // markdown. Together they cover the query shapes lexical grep alone misses.
  const pkbGuard = (args: any): { slug: string } | ToolResult => {
    const prod = pageProduct(args);
    if (!prod) return text("Pass a `product` slug (see list_products).");
    if (!pkbExists(prod.slug)) return text(`No knowledge graph for ${prod.name} yet — use grep_profile / list_profile over its docs instead.`);
    return { slug: prod.slug };
  };
  const productParam: ZodRawShape = masterMode ? { product: z.string().describe("Product slug (required in master mode; see list_products)") } : {};

  // SEARCH — semantic, for fuzzy natural-language symptoms.
  const searchProductTool: TaktTool = {
    name: "search_product",
    description: "Semantic search over a product's knowledge — for FUZZY, natural-language questions and symptoms in the user's own words ('it grinds when the bed moves', 'prints come out stringy'). Finds passages by MEANING, not exact words — the complement to grep_profile (which is literal, best for exact error codes / part numbers). Returns ranked snippets with their source page.",
    parameters: params({ query: z.string().describe("A natural-language description of the problem or question"), ...productParam }),
    execute: async (args) => {
      const g = pkbGuard(args); if ("output" in g) return g;
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "search_product", summary: String(args.query) });
      const hits = await searchProduct(g.slug, String(args.query), 8);
      await emit({ type: "tool_done", id, detail: `${hits.length} hits` });
      if (!hits.length) return text(`No semantic matches for "${args.query}". Try grep_profile for exact terms or find_entity for a part/fault.`);
      const body = hits.map((h) => `[${h.chunk.title}${h.chunk.page ? ` p.${h.chunk.page}` : ""}] ${h.chunk.text.replace(/\s+/g, " ").slice(0, 220)}`).join("\n\n");
      return text(`${body}\n\nFor how these things connect (cause/fix/parts), call find_entity.`);
    },
  };

  // FIND ENTITY — dual-level graph lookup: the workhorse for grounded answers.
  const findEntityTool: TaktTool = {
    name: "find_entity",
    description: "Look things up in the product's knowledge GRAPH — parts, faults/error codes, procedures, specs — and see how they connect. Best when the answer is a RELATIONSHIP: a fault's cause and fix, a part's subassembly, a procedure's steps. Returns matching entities with their neighbours and the manual pages / 3D parts / videos anchored to each. Then call get_anchors to pull a figure to show, or walk_graph to go deeper. This is how you build a grounded, multimodal answer.",
    parameters: params({ query: z.string().describe("What to find — a part, fault, error code, symptom, procedure, or spec"), ...productParam }),
    execute: async (args) => {
      const g0 = pkbGuard(args); if ("output" in g0) return g0;
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "find_entity", summary: String(args.query) });
      const graph = loadGraph(g0.slug);
      const ents = await findEntity(g0.slug, [String(args.query)], [String(args.query)]);
      await emit({ type: "tool_done", id, detail: `${ents.length} entities` });
      if (!ents.length) return text(`No graph entities for "${args.query}". Try search_product (fuzzy) or grep_profile (literal).`);
      const blocks = ents.slice(0, 8).map((e) => {
        const nb = neighbors(graph, e.id, { depth: 1 }).edges
          .map((ed) => `${ed.type} ${ed.src === e.id ? "→ " + (graph.entities.find((x) => x.id === ed.dst)?.name ?? ed.dst) : "← " + (graph.entities.find((x) => x.id === ed.src)?.name ?? ed.src)}`)
          .slice(0, 6);
        const anc = getEntityAnchors(graph, e.id).map(anchorLabel);
        return [
          `• ${e.name} [${e.type}] (${e.confidence})  id=${e.id}`,
          e.description ? `  ${e.description.replace(/\s+/g, " ").slice(0, 200)}` : "",
          nb.length ? `  links: ${nb.join("; ")}` : "",
          anc.length ? `  media: ${anc.join("; ")}` : "",
        ].filter(Boolean).join("\n");
      }).join("\n\n");
      return text(`${blocks}\n\nNext: get_anchors(entity:"<id>") to pull a figure/3D/video to embed, or walk_graph(entity:"<id>") for the full neighbourhood.`);
    },
  };

  // WALK — expand the full neighbourhood of an entity.
  const walkGraphTool: TaktTool = {
    name: "walk_graph",
    description: "Expand everything the product graph knows around one entity — its parts, causes, fixes, related procedures — to a few hops. Use after find_entity to gather the full neighbourhood of a fault or part before composing the answer. Pass the entity id from find_entity.",
    parameters: params({
      entity: z.string().describe("Entity id from find_entity"),
      depth: z.number().int().min(1).max(3).optional().describe("Hops to expand (default 2)"),
      edgeTypes: z.array(z.string()).optional().describe("Restrict to these link types, e.g. ['fixes','next_step']"),
      ...productParam,
    }),
    execute: async (args) => {
      const g = pkbGuard(args); if ("output" in g) return g;
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "walk_graph", summary: String(args.entity) });
      const out = walkGraph(g.slug, String(args.entity), { depth: args.depth ?? 2, edgeTypes: args.edgeTypes });
      await emit({ type: "tool_done", id, detail: out ? "expanded" : "empty" });
      return text(out || `No entity "${args.entity}" in the graph. Call find_entity first.`);
    },
  };

  // ANCHORS — render-ready media for an entity.
  const getAnchorsTool: TaktTool = {
    name: "get_anchors",
    description: "Get the render-ready media anchored to an entity — the exact manual page + region, the 3D model part, the video clip — so you can SHOW it. Use after find_entity when you're about to build an artifact: it tells you exactly which crop_page_image call to make, or the 3D/video URL to embed. Pass the entity id.",
    parameters: params({ entity: z.string().describe("Entity id from find_entity"), ...productParam }),
    execute: async (args) => {
      const g = pkbGuard(args); if ("output" in g) return g;
      const prod = pageProduct(args)!;
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "get_anchors", summary: String(args.entity) });
      const anchors = getAnchors(g.slug, String(args.entity));
      await emit({ type: "tool_done", id, detail: `${anchors.length} anchors` });
      if (!anchors.length) return text(`No media anchored to "${args.entity}".`);
      const lines = anchors.map((a) => renderAnchorHint(a, prod.slug));
      return text(lines.join("\n"));
    },
  };

  // QUERY — one-shot fused context (graph + sources), cited.
  const queryProductTool: TaktTool = {
    name: "query_product",
    description: "Ask the product knowledge base a question and get back ONE fused, cited context block — the relevant graph relationships AND the source passages together. Use this when you just want the facts to answer with and don't need to hand-pick tools. For building a rich multimodal artifact where you choose the figures, prefer find_entity + get_anchors instead.",
    parameters: params({ question: z.string().describe("The question to ground"), ...productParam }),
    execute: async (args) => {
      const g = pkbGuard(args); if ("output" in g) return g;
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "query_product", summary: String(args.question) });
      const r = await queryProduct(g.slug, String(args.question));
      await emit({ type: "tool_done", id, detail: `${r.entities.length} entities, ${r.chunks.length} sources` });
      return text(r.context);
    },
  };

  // MAP — render the whole product graph as an interactive map surface.
  const productMapTool: TaktTool = {
    name: "product_map",
    description: "Render the product's whole knowledge graph as an interactive map on the stage — parts, faults, procedures and specs and how they connect, which the user can click to explore. Use when the user wants an overview of the product or asks to 'explore' it. Builds and shows the surface itself; just tell the user in one line that the map is up.",
    parameters: params({ ...productParam }),
    execute: async (args) => {
      const g0 = pkbGuard(args); if ("output" in g0) return g0;
      const prod = pageProduct(args)!;
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "product_map", summary: prod.slug });
      const graph = loadGraph(g0.slug);
      const deg = new Map<string, number>();
      for (const e of graph.edges) { deg.set(e.src, (deg.get(e.src) ?? 0) + 1); deg.set(e.dst, (deg.get(e.dst) ?? 0) + 1); }
      const top = [...graph.entities].sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0)).slice(0, 120);
      const keep = new Set(top.map((e) => e.id));
      const nodes = top.map((e) => ({
        id: e.id, label: e.name, type: String(e.type),
        detail: [e.description?.slice(0, 140), ...getEntityAnchors(graph, e.id).map(anchorLabel)].filter(Boolean).join("\n") || undefined,
      }));
      const edges = graph.edges.filter((e) => keep.has(e.src) && keep.has(e.dst)).map((e) => ({ source: e.src, target: e.dst, type: String(e.type) }));
      if (!nodes.length) { await emit({ type: "tool_done", id, detail: "empty graph" }); return text("The product graph is empty — nothing to map yet."); }
      const surface = { id: "product-map", key: "product-map", title: `${prod.name} — product map`, root: "map", nodes: [{ id: "map", type: "Graph", props: { nodes, edges, caption: `${nodes.length} components · click to explore` } }] };
      const res = validateSurface(surface);
      if (!res.ok) { await emit({ type: "tool_done", id, detail: "invalid" }); return text(`Could not build the map: ${res.errors.map((e) => e.message).join("; ")}`); }
      await emit({ type: "ui_surface", partId: "product-map", surface: res.surface });
      await emit({ type: "tool_done", id, detail: `${nodes.length} nodes` });
      return text(`Product map is on the stage (${nodes.length} components, ${edges.length} links). Tell the user they can click any node to explore its pages, 3D parts, and related faults.`);
    },
  };

  const listProductsTool: TaktTool = {
    name: "list_products",
    description: "List every product Takt has indexed data for (name, manufacturer, slug).",
    parameters: params({}),
    execute: async () => {
      const products = listProducts();
      return text(products.map((p) => `- ${p.name}${p.manufacturer ? ` (${p.manufacturer})` : ""} [${p.slug}]`).join("\n"));
    },
  };

  // General-agent capability: read a web page's text. Zero-key. Available in both
  // single-product and master mode so Takt can pull in outside context on request.
  const fetchUrl: TaktTool = {
    name: "fetch_url",
    description: "Fetch a web page and return its readable text. Use when the user asks about a specific URL or wants information from a page. Returns plain text (scripts/markup stripped).",
    parameters: params({
      url: z.string().describe("The absolute http(s) URL to fetch"),
    }),
    execute: async (args) => {
      const id = randomUUID();
      const raw = String(args.url ?? "").trim();
      await emit({ type: "tool_start", id, tool: "fetch_url", summary: raw });
      let url: URL;
      try { url = new URL(raw); } catch { await emit({ type: "tool_done", id, detail: "bad url" }); return text(`"${raw}" is not a valid URL.`); }
      if (url.protocol !== "http:" && url.protocol !== "https:") { await emit({ type: "tool_done", id, detail: "blocked" }); return text("Only http(s) URLs are allowed."); }
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "TaktBot/1.0" } });
        if (!res.ok) { await emit({ type: "tool_done", id, detail: `HTTP ${res.status}` }); return text(`Fetch failed: HTTP ${res.status}.`); }
        const html = await res.text();
        const body = htmlToText(html).slice(0, 20_000);
        await emit({ type: "tool_done", id, detail: `${body.length} chars` });
        return text(body || "(no readable text found on the page)");
      } catch (e: any) {
        await emit({ type: "tool_done", id, detail: "error" });
        return text(`Could not fetch the page: ${String(e?.message ?? e)}`);
      }
    },
  };

  const askUser: TaktTool = {
    name: "ask_user",
    description: "Ask the user 1-4 clarifying questions BEFORE answering, when the request is ambiguous or a choice would change the answer (e.g. which model/variant, which use case, which constraint). The questions appear in an interactive panel. For each question give a short `header`, the `question`, and `options` (each with a `label` and optional `description`). Set `multiSelect: true` when several can apply. To explain a question or an option visually, attach a `render`: `{ kind: 'ascii', content }` for a quick text/SVG sketch, or `{ kind: 'react', content }` — a single self-contained React component named `App` (no imports; `React` is global; style with Tailwind; draw with inline SVG) — for an interactive diagram. Keep questions tight; don't ask what the manual or the user already answered.",
    parameters: params({ questions: askQuestionsSchema }),
    execute: async (args) => {
      const askId = randomUUID();
      const questions = args.questions.map((q: any, i: number) => ({ ...q, id: q.id ?? `q${i}` }));
      await emit({ type: "ask_user", askId, questions });
      const payload = await awaitAnswers(askId);
      // Echo the chosen answers back so they persist onto the ask_user block and
      // the inline panel updates from "awaiting" to the recap.
      await emit({ type: "ask_answer", askId, answers: payload.answers, cancelled: payload.cancelled });
      if (payload.cancelled || !payload.answers?.length) {
        return text("The user dismissed the questions without answering. Proceed with reasonable best-effort defaults and clearly state the assumptions you made.");
      }
      const body = payload.answers
        .map((a) => `Q: ${a.question}\nA: ${formatAnswer(a)}`)
        .join("\n\n");
      return text(`The user answered your clarifying questions:\n\n${body}\n\nUse these answers to give a precise, grounded response.`);
    },
  };

  // Retrieval is Direct Corpus Interaction over the Profile markdown — list (map)
  // → grep (find) → read (full concept). Works the same in single-product and
  // master mode. get_page_image/crop show pages; list_products + fetch_url both modes.
  return [
    // Graph/semantic retrieval first — the primary way to answer a product
    // question; legacy grep/list/read follow as exact-term / browse fallbacks.
    findEntityTool, searchProductTool, walkGraphTool, getAnchorsTool, queryProductTool, productMapTool,
    grepProfileTool, listProfileTool, readProfile,
    getPageImageTool, cropPageImage,
    emitUi, ...(delegateBuild ? [delegateBuild] : []), updateTodos, listProductsTool, askUser, fetchUrl,
  ];
}
