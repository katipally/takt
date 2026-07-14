import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";
import { z, type ZodRawShape } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Product, Manual, ManualKind, SseEvent, AskAnswer } from "@takt/shared";
import { askQuestionsSchema } from "@takt/shared";
import {
  DATA_DIR, getPageImage, getManualsByProduct,
  listProducts, getProductBySlug, listMessages,
  findEntity, getEntity, neighbors, trace, getMediaByEntity, graphExists,
  type Entity, type KgMedia,
} from "@takt/db";
import {
  profileExists, listConcepts, readConcept,
  searchChunks, searchKgMedia, searchEntities,
} from "@takt/profile";
import { awaitAnswers } from "./pending.js";

export type Emit = (e: SseEvent) => Promise<void> | void;

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

// Minimal HTML → text for fetch_url / read_canvas: drop script/style, strip tags,
// unescape common entities, collapse whitespace.
export function htmlToText(html: string): string {
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
// provider adapter accepts it.
function params(shape: ZodRawShape): Record<string, unknown> {
  const js = zodToJsonSchema(z.object(shape), { $refStrategy: "none" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

const formatAnswer = (a: AskAnswer) =>
  a.skipped ? "(skipped — no preference)" : Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;

// Rewrite bundle-relative media links (media/…) to servable /assets URLs.
const resolveMedia = (slug: string, body: string): string =>
  body.replace(/\]\(media\//g, `](/assets/products/${slug}/media/`);

// Overlay a faint 0–1 coordinate grid on the image the MODEL sees (vision only),
// so it can read a feature's position off the grid for accurate crops/annotations.
// The user-facing image on disk is never touched.
export async function withCoordGrid(buf: Buffer): Promise<Buffer> {
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

// fetch_url SSRF guard: block loopback / private / link-local / metadata hosts.
function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  return p[0] === 127 || p[0] === 10 || p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) ||           // link-local + cloud metadata
    (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31) ||
    (p[0] === 192 && p[1] === 168);
}
async function hostIsPrivate(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return isPrivateIp(hostname);
  if (/^(localhost|.*\.local)$/i.test(hostname)) return true;
  try { const { address } = await dnsLookup(hostname); return isPrivateIp(address); }
  catch { return true; } // unresolvable → refuse
}

export function buildTaktTools(ctx: {
  product: Product | null;
  manuals: Manual[];
  emit: Emit;
  chatId?: string;
  context?: "main" | "build";
  // canvas callbacks — chat wires compose/edit
  compose?: (brief: string, canvasId?: string) => Promise<boolean>;
  edit?: (brief: string, canvasId?: string, target?: string) => Promise<boolean>;
}): TaktTool[] {
  const { product, emit, chatId, context = "main", compose, edit } = ctx;
  const masterMode = !product;

  const manualsHint = (prodId: string): string => {
    try {
      const ms = getManualsByProduct(prodId);
      if (!ms.length) return "This product has no manual pages indexed.";
      return `Available manuals: ${ms.map((m) => `"${m.kind}" (${m.pageCount} pages)`).join(", ")}. Pass one of those exact kinds as \`manual\` (or omit to search all) and a page within its range.`;
    } catch { return "Call list_products to see products."; }
  };

  const pageProduct = (args: any): Product | null =>
    product ?? (args.product ? getProductBySlug(String(args.product)) ?? null : null);
  const productParam: ZodRawShape = masterMode ? { product: z.string().describe("Product slug (required in master mode; see list_products)") } : {};

  const searchGuard = (args: any): { slug: string; name: string } | ToolResult => {
    const prod = pageProduct(args);
    if (!prod) return text("Pass a `product` slug (see list_products).");
    if (!graphExists(prod.id) && !profileExists(prod.slug)) return text(`No knowledge indexed for ${prod.name} yet.`);
    return { slug: prod.slug, name: prod.name };
  };

  // ── SEARCH — hybrid (semantic ∪ lexical) over the product's knowledge ──
  const searchProductTool: TaktTool = {
    name: "search_product",
    description: "Full-text search over the product's manual passages — best for an exact term (error code, part number, torque value) or free-text wording. For a specific PART, SYMPTOM, SPEC, or PROCEDURE, prefer find_entity first (it resolves the user's words and shows what connects). Returns ranked snippets with their source manual page. Cite the page a fact came from.",
    parameters: params({ query: z.string().describe("What to find — a symptom, spec, part, procedure, or exact term"), ...productParam }),
    execute: async (args) => {
      const g = searchGuard(args); if ("output" in g) return g;
      const prod = pageProduct(args)!;
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "search_product", summary: String(args.query) });
      // Hybrid FTS + semantic over the unified KG store.
      const titles = new Map(getManualsByProduct(prod.id).map((m) => [m.id, m.title]));
      const chunks = await searchChunks(prod.id, String(args.query), 8);
      const n = chunks.length;
      // 700 chars per chunk, not less — a material section names its temperature
      // mid-passage; harder truncation cuts the actual value out of the snippet
      // (the old flat index served 700 for exactly this reason).
      const body = chunks.map((c) => `[${titles.get(c.manualId ?? "") ?? "manual"}${c.page ? ` p.${c.page}` : ""}] ${c.text.replace(/\s+/g, " ").slice(0, 700)}`).join("\n\n");
      await emit({ type: "tool_done", id, detail: `${n} hits` });
      if (!n) return text(`No matches for "${args.query}". Try a synonym, or read_profile a concept.`);
      return text(`${body}\n\nTo SHOW a figure/3D part/video for this, call get_media. To read a concept in full, call read_profile.`);
    },
  };

  // ── GET_MEDIA — the flat media index: the exact figure/3D/video to SHOW ──
  const getMediaTool: TaktTool = {
    name: "get_media",
    description: "Find the render-ready visuals for a topic — the manual page to crop, the 3D part model, the repair-video clip — so the canvas can SHOW it. Use before building the canvas: it returns the exact /assets URLs to embed (or which crop_page_image to call). Pass what you want to show (a part name, a step, a symptom).",
    parameters: params({ query: z.string().describe("What you want to show — a part, step, or region"), kind: z.enum(["figure", "page", "mesh", "video_clip", "image"]).optional().describe("Restrict to one media kind"), ...productParam }),
    execute: async (args) => {
      const g = searchGuard(args); if ("output" in g) return g;
      const prod = pageProduct(args)!;
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "get_media", summary: String(args.query) });
      // KG media (hybrid) so the ingest cascade's cross-modal links surface — a 3D
      // part or figure connected by embedding, not just an exact caption match.
      const media = await searchKgMedia(prod.id, String(args.query), 6, args.kind);
      await emit({ type: "tool_done", id, detail: `${media.length} media` });
      if (!media.length) return text(`No media for "${args.query}". Use crop_page_image on a manual page instead.`);
      return text(`${media.map(graphMediaHint).join("\n")}\n\nEmbed only these exact URLs — never invent one. For a manual page, crop_page_image tight to the one figure.`);
    },
  };

  // ── READ — one concept's full text, verbatim ──
  const readProfile: TaktTool = {
    name: "read_profile",
    description: "Read one Profile concept's full text VERBATIM — a manual, a spec sheet, a procedure — when a search snippet isn't enough. Media links come back as /assets URLs you can embed.",
    parameters: params({ concept: z.string().describe("Concept id to read (e.g. 'overview', 'prusa3d-manual-mk4s-mk39s-101-en'). Get ids from search_product results."), ...productParam }),
    execute: async (args) => {
      const prod = pageProduct(args);
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "read_profile", summary: args.concept ? String(args.concept) : "?" });
      if (!prod) { await emit({ type: "tool_done", id, detail: "no product" }); return text("Pass a `product` slug (see list_products)."); }
      if (!profileExists(prod.slug)) { await emit({ type: "tool_done", id, detail: "no profile" }); return text(`No Profile for ${prod.name} yet.`); }
      const ids = listConcepts(prod.slug).map((c) => c.id);
      if (!args.concept) { await emit({ type: "tool_done", id, detail: "no concept" }); return text(`Pass a concept id. Available: ${ids.join(", ")}`); }
      const concept = readConcept(prod.slug, String(args.concept));
      if (!concept) { await emit({ type: "tool_done", id, detail: "not found" }); return text(`No concept "${args.concept}". Available: ${ids.join(", ")}`); }
      await emit({ type: "tool_done", id, detail: concept.id });
      const fm = concept.frontmatter;
      const head = `# ${fm.title ?? concept.id} (${fm.type})${fm.description ? `\n${fm.description}` : ""}`;
      return text(`${head}\n\n${resolveMedia(prod.slug, concept.body).slice(0, 12000)}`);
    },
  };

  // ── PAGE IMAGE + CROP (unchanged: they still show manual figures) ──
  const getPageImageTool: TaktTool = {
    name: "get_page_image",
    description: "Fetch a specific manual page as an image and SHOW it. The page is displayed as a source and returned so you can read it (with a faint 0–1 coordinate grid FOR YOUR REFERENCE — the user sees it clean). To put a figure on the canvas, prefer crop_page_image next to embed just the relevant region rather than the whole page.",
    parameters: params({
      page: z.number().int().min(1).describe("Page number"),
      manual: z.string().optional().describe("Manual kind, e.g. 'owner' (omit for any)."),
      ...(masterMode ? { product: z.string().describe("Product slug (required in master mode).") } : {}),
    }),
    execute: async (args) => {
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "get_page_image", summary: `page ${args.page}` });
      const prod = pageProduct(args);
      if (!prod) { await emit({ type: "tool_done", id, detail: "no product" }); return text("Pass a `product` slug (see list_products)."); }
      const pi = getPageImage(prod.id, (args.manual as ManualKind) ?? null, args.page);
      await emit({ type: "tool_done", id, detail: pi ? `p.${pi.pageNumber}` : "not found" });
      if (!pi) return text(`No page ${args.page}${args.manual ? ` in manual "${args.manual}"` : ""} for ${prod.name}. ${manualsHint(prod.id)}`);
      const citationId = randomUUID();
      const url = `${WEB_URL()}/assets/${pi.pngPath}`;
      await emit({ type: "source", citationId, url, page: pi.pageNumber, manualKind: pi.manualKind, manualTitle: pi.manualTitle, caption: pi.caption, productSlug: prod.slug, productName: prod.name });
      let images: ToolResult["images"];
      try { const g = await withCoordGrid(readFileSync(resolve(DATA_DIR, pi.pngPath))); images = [{ data: g.toString("base64"), mime: "image/png" }]; } catch { /* text-only */ }
      return { output: `Showing ${pi.manualTitle} p.${pi.pageNumber}. For the canvas, prefer crop_page_image to embed just the figure; full-page URL: ${url}${pi.caption ? `\nPage content:\n${pi.caption}` : ""}`, images };
    },
  };

  const cropPageImage: TaktTool = {
    name: "crop_page_image",
    description: "Crop a manual page to the ONE figure/panel that matters and SHOW that crop — use AFTER get_page_image so you've seen the page and can read the region off its 0–1 grid. Region as fractions of the page: x,y = top-left, w,h = width,height. Crop TIGHT (w,h typically 0.25–0.7); NEVER the whole page, and trim the margins — a crop that is mostly blank page is a failed crop; hug the figure's edges. The crop is displayed and returned with a faint 0–1 grid for your reference.",
    parameters: params({
      page: z.number().int().min(1), manual: z.string().optional(),
      x: z.number().min(0).max(1), y: z.number().min(0).max(1),
      w: z.number().min(0.02).max(1), h: z.number().min(0.02).max(1),
      ...(masterMode ? { product: z.string() } : {}),
    }),
    execute: async (args) => {
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "crop_page_image", summary: `page ${args.page}` });
      const prod = pageProduct(args);
      if (!prod) { await emit({ type: "tool_done", id, detail: "no product" }); return text("Pass a `product` slug (see list_products)."); }
      const pi = getPageImage(prod.id, (args.manual as ManualKind) ?? null, args.page);
      if (!pi) { await emit({ type: "tool_done", id, detail: "not found" }); return text(`No page ${args.page} for ${prod.name}. ${manualsHint(prod.id)}`); }
      const src = resolve(DATA_DIR, pi.pngPath);
      let imgW = 0, imgH = 0;
      try { const m = await sharp(src).metadata(); imgW = m.width ?? 0; imgH = m.height ?? 0; } catch { /* missing */ }
      if (!imgW || !imgH) { await emit({ type: "tool_done", id, detail: "unreadable" }); return text(`Page ${args.page} unreadable; use get_page_image instead.`); }
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
          const region = sharp(src).extract({ left, top, width: cw, height: ch });
          try { await region.clone().trim({ background: "#ffffff", threshold: 18 }).png().toFile(dest); }
          catch { await region.png().toFile(dest); }
        }
      } catch (e) { await emit({ type: "tool_done", id, detail: "crop failed" }); return text(`Could not crop page ${args.page}: ${(e as Error).message}.`); }
      const citationId = randomUUID();
      const url = `${WEB_URL()}/assets/${cropRel}`;
      await emit({ type: "source", citationId, url, page: pi.pageNumber, manualKind: pi.manualKind, manualTitle: pi.manualTitle, caption: pi.caption, productSlug: prod.slug, productName: prod.name });
      await emit({ type: "tool_done", id, detail: `p.${pi.pageNumber} crop` });
      let images: ToolResult["images"];
      try { const g = await withCoordGrid(readFileSync(dest)); images = [{ data: g.toString("base64"), mime: "image/png" }]; } catch { /* text-only */ }
      const loose = args.w >= 0.9 && args.h >= 0.82;
      return { output: `Cropped ${pi.manualTitle} p.${pi.pageNumber}. Embed this exact URL as <takt-figure src="${url}">.${loose ? " NOTE: that covers most of the page — if it shows more than one figure, crop tighter (w,h ~0.3–0.6)." : ""}`, images };
    },
  };

  // ── KNOWLEDGE GRAPH: resolve the user's words → entities, then traverse ──
  const graphGuard = (args: any): { id: string; slug: string; name: string } | ToolResult => {
    const prod = pageProduct(args);
    if (!prod) return text("Pass a `product` slug (see list_products).");
    if (!graphExists(prod.id)) return text(`No knowledge graph for ${prod.name} yet — use search_product instead.`);
    return { id: prod.id, slug: prod.slug, name: prod.name };
  };
  const resolveEntity = (pid: string, ref: unknown): Entity | undefined => {
    const r = String(ref ?? "").trim();
    if (!r) return undefined;
    if (r.includes(":")) { const e = getEntity(r); if (e && e.productId === pid) return e; }
    return findEntity(pid, r, 1)[0];
  };
  // A spec's measured value lives in attrs (value/unit), not summary — surface
  // it inline so "PLA nozzle temperature = 215 °C" answers without another hop.
  const entVal = (e: Entity) => {
    const a = e.attrs as Record<string, unknown> | null;
    return a && a.value != null ? ` = ${a.value}${a.unit ? ` ${a.unit}` : ""}` : "";
  };
  const entLine = (e: Entity) => `[${e.type}] ${e.name}${entVal(e)}${e.page ? ` (p.${e.page})` : ""}${e.summary ? ` — ${e.summary.slice(0, 100)}` : ""}  {${e.id}}`;
  const graphMediaHint = (m: KgMedia): string => {
    const abs = (u: string) => (u.startsWith("/") ? `${WEB_URL()}${u}` : u);
    const cap = m.caption ? ` — ${m.caption.replace(/\s+/g, " ").slice(0, 90)}` : "";
    switch (m.kind) {
      case "mesh": return `- 3D part${cap}: embed <takt-model src="${abs(m.assetUrl)}" caption="…">`;
      case "video_clip": return `- video${cap}: embed <takt-video src="${abs(m.assetUrl)}" caption="…">`;
      case "image": return `- image${cap}: embed <takt-figure src="${abs(m.assetUrl)}" caption="…">`;
      default: return `- figure${cap}: embed <takt-figure src="${abs(m.assetUrl)}" caption="…"> (or crop_page_image tight to it)`;
    }
  };

  const findEntityTool: TaktTool = {
    name: "find_entity",
    description: "Resolve the user's words — even non-technical ones ('clicking noise', 'won't feed') — to the exact things in the product: a part, symptom, spec, procedure, warning. START HERE for a specific-thing question. Returns matching entities with a {id} you pass to explore_entity. Aliases mean a layman phrase still finds the right part.",
    parameters: params({ query: z.string().describe("A part, symptom, spec, procedure — in any words the user might use"), ...productParam }),
    execute: async (args) => {
      const g = graphGuard(args); if ("output" in g) return g;
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "find_entity", summary: String(args.query) });
      // Hybrid (FTS + semantic) so layman words resolve even without a lexical hit.
      const ents = await searchEntities(g.id, String(args.query), 8);
      await emit({ type: "tool_done", id, detail: `${ents.length} entities` });
      if (!ents.length) return text(`No entity for "${args.query}". Try search_product for free-text passages.`);
      return text(`${ents.map(entLine).join("\n")}\n\nCall explore_entity with an {id} to see what it connects to (parts, the fix, figures, the 3D model, cited pages).`);
    },
  };

  const exploreEntityTool: TaktTool = {
    name: "explore_entity",
    description: "Given an entity (an {id} from find_entity, or a name), return what it CONNECTS to — the part it's on, the procedure that fixes it, the figures/3D model/video that show it, and the manual pages to cite. This is how you assemble a grounded, cross-linked answer for the canvas.",
    parameters: params({ entity: z.string().describe("An entity {id} from find_entity, or its name"), ...productParam }),
    execute: async (args) => {
      const g = graphGuard(args); if ("output" in g) return g;
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "explore_entity", summary: String(args.entity) });
      const ent = resolveEntity(g.id, args.entity);
      if (!ent) { await emit({ type: "tool_done", id, detail: "not found" }); return text(`No entity "${args.entity}". Call find_entity first.`); }
      const nbrs = neighbors(ent.id);
      const linkedMedia = getMediaByEntity(ent.id);
      // media on any directly-connected entity too (e.g. the figure that depicts this part)
      for (const n of nbrs) linkedMedia.push(...getMediaByEntity(n.entity.id));
      const media = [...new Map(linkedMedia.map((m) => [m.id, m])).values()];
      await emit({ type: "tool_done", id, detail: `${nbrs.length} links, ${media.length} media` });
      const byRel = new Map<string, string[]>();
      for (const n of nbrs) (byRel.get(n.edge.rel) ?? byRel.set(n.edge.rel, []).get(n.edge.rel)!).push(entLine(n.entity));
      const relBlocks = [...byRel].map(([rel, lines]) => `${rel}:\n${lines.map((l) => `  ${l}`).join("\n")}`).join("\n");
      const cites = [...new Set(nbrs.concat({ edge: null as any, entity: ent }).map((n) => n.entity.page).filter(Boolean))];
      const head = `${entLine(ent)}${ent.aliases.length ? `\nalso called: ${ent.aliases.join(", ")}` : ""}`;
      const mediaBlock = media.length ? `\n\nSHOW these (embed the EXACT /assets URL, never invent one):\n${media.map(graphMediaHint).join("\n")}` : "";
      const citeBlock = cites.length ? `\n\nCite these manual pages with <takt-cite page="N">: ${cites.map((p) => `p.${p}`).join(", ")} (call crop_page_image for the figure on a page).` : "";
      return text(`${head}\n\nCONNECTS TO:\n${relBlocks || "(no links)"}${mediaBlock}${citeBlock}\n\nUse search_product for the exact wording on a cited page.`);
    },
  };

  const traceTool: TaktTool = {
    name: "trace_path",
    description: "Find how two things in the product relate — the chain of links between them (e.g. a symptom → the part → the fix). Pass two entity {id}s or names.",
    parameters: params({ from: z.string().describe("Start entity id or name"), to: z.string().describe("End entity id or name"), ...productParam }),
    execute: async (args) => {
      const g = graphGuard(args); if ("output" in g) return g;
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "trace_path", summary: `${args.from} → ${args.to}` });
      const a = resolveEntity(g.id, args.from), b = resolveEntity(g.id, args.to);
      if (!a || !b) { await emit({ type: "tool_done", id, detail: "unresolved" }); return text("Couldn't resolve one of the entities — call find_entity first."); }
      const path = trace(g.id, a.id, b.id);
      await emit({ type: "tool_done", id, detail: path ? `${path.length} hops` : "no path" });
      if (!path) return text(`No connection found between ${a.name} and ${b.name}.`);
      return text(path.map(entLine).join("\n  ↓\n"));
    },
  };

  // ── CANVAS: build, edit, read, select ──
  const buildCanvasTool: TaktTool | null = compose ? {
    name: "build_canvas",
    description: "Compose the full answer as a designed page on the canvas from what you've gathered this turn. The page (title included) streams in and PAINTS itself live, so call this the moment you've gathered enough — don't wait. Give a brief naming what to show and which gathered facts/media to use.",
    parameters: params({ brief: z.string().describe("What to show and which gathered sources to use") }),
    execute: async (args) => {
      const brief = String(args?.brief ?? "").trim();
      if (!brief) return { output: "build_canvas needs a brief.", isError: true };
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "build_canvas", summary: brief.slice(0, 60), lane: "main" });
      const ok = await compose!(brief);
      await emit({ type: "tool_done", id, detail: ok ? "built" : "failed" });
      return ok
        ? text("Built on the canvas. Reply with ONE short line pointing at it; don't restate the page.")
        : { output: "The canvas build failed (no usable page was produced). Do NOT tell the user it's on the canvas. Instead, give the actual answer concisely in your chat reply this turn.", isError: true };
    },
  } : null;

  const editCanvasTool: TaktTool | null = edit ? {
    name: "edit_canvas",
    description: "Change what's already on the canvas — tweak, trim, reword, restyle, add/remove a part — WITHOUT rebuilding from scratch. Recomposes from the current page (no re-gathering). If the user selected a block, pass its data-takt-id as `target` to change only that block.",
    parameters: params({ brief: z.string().describe("The change to make"), target: z.string().optional().describe("Only change the block with this data-takt-id"), canvasId: z.string().optional() }),
    execute: async (args) => {
      const brief = String(args?.brief ?? "").trim();
      if (!brief) return { output: "edit_canvas needs a brief.", isError: true };
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "edit_canvas", summary: brief.slice(0, 60) });
      const ok = await edit(brief, typeof args?.canvasId === "string" ? args.canvasId : undefined, typeof args?.target === "string" ? args.target : undefined);
      await emit({ type: "tool_done", id, detail: ok ? "edited" : "no canvas" });
      return ok ? text("Updated the canvas in place. One short line about what changed.") : { output: "Couldn't edit — the canvas is empty. Build it first.", isError: true };
    },
  } : null;

  const readCanvasTool: TaktTool = {
    name: "read_canvas",
    description: "See what's on the CANVAS right now — its title, its BLOCKS (each with a data-takt-id handle) and text. Call BEFORE answering a question about the canvas or editing it, so you target the right block.",
    parameters: params({}),
    execute: async () => {
      if (!chatId) return text("The canvas is empty — nothing built yet.");
      let block: { title?: string; html: string } | null = null;
      try {
        const msgs = listMessages(chatId);
        outer: for (let i = msgs.length - 1; i >= 0; i--) {
          const blocks = msgs[i]!.content as any[];
          for (let j = blocks.length - 1; j >= 0; j--) {
            if (blocks[j]?.type === "canvas" && blocks[j]?.html) { block = { title: blocks[j].title, html: String(blocks[j].html) }; break outer; }
          }
        }
      } catch { /* db best-effort */ }
      if (!block) return text("The canvas is empty — nothing built there yet.");
      const re = /data-takt-id="([^"]+)"/g; const marks: { id: string; pos: number }[] = []; let m;
      while ((m = re.exec(block.html))) marks.push({ id: m[1]!, pos: m.index });
      const blockList = marks.map((mk, i) => {
        const seg = block!.html.slice(mk.pos, i + 1 < marks.length ? marks[i + 1]!.pos : block!.html.length);
        return `- ${mk.id}: ${htmlToText(seg).slice(0, 80)}`;
      }).join("\n");
      const body = htmlToText(block.html).slice(0, 2200);
      return text(`CANVAS${block.title ? ` (title: "${block.title}")` : ""}:${blockList ? `\n\nBLOCKS (target with select_canvas / edit_canvas):\n${blockList}` : ""}\n\nTEXT:\n${body || "(a visual with no readable text)"}`);
    },
  };

  const selectCanvasTool: TaktTool = {
    name: "select_canvas",
    description: "Highlight a block on the canvas so the user sees exactly what you mean — rings it and scrolls it into view. Pass the block's data-takt-id (from read_canvas). Empty string clears the highlight.",
    parameters: params({ target: z.string().describe("data-takt-id to highlight; empty clears") }),
    execute: async (args) => {
      const target = String(args?.target ?? "").trim();
      await emit({ type: "canvas_highlight", target });
      return text(target ? `Highlighted "${target}".` : "Cleared the highlight.");
    },
  };

  const updateTodos: TaktTool = {
    name: "update_todos",
    description: "Publish/update a short checklist (3+ steps) shown in the status bar; mark items done as you go. Skip for simple answers.",
    parameters: params({ items: z.array(z.object({ text: z.string(), done: z.boolean() })).min(1).max(8) }),
    execute: async (args) => {
      const items = Array.isArray(args?.items) ? args.items.map((i: any) => ({ text: String(i.text ?? ""), done: !!i.done })).filter((i: any) => i.text) : [];
      await emit({ type: "todos", items });
      return text("Checklist updated.");
    },
  };

  const listProductsTool: TaktTool = {
    name: "list_products",
    description: "List every product Takt has indexed data for (name, manufacturer, slug).",
    parameters: params({}),
    execute: async () => text(listProducts().map((p) => `- ${p.name}${p.manufacturer ? ` (${p.manufacturer})` : ""} [${p.slug}]`).join("\n") || "(no products indexed)"),
  };

  const fetchUrl: TaktTool = {
    name: "fetch_url",
    description: "Fetch a public web page and return its readable text. Use when the user asks about a specific URL. Returns plain text (scripts/markup stripped).",
    parameters: params({ url: z.string().describe("The absolute http(s) URL to fetch") }),
    execute: async (args) => {
      const id = randomUUID();
      const raw = String(args.url ?? "").trim();
      await emit({ type: "tool_start", id, tool: "fetch_url", summary: raw });
      let url: URL;
      try { url = new URL(raw); } catch { await emit({ type: "tool_done", id, detail: "bad url" }); return text(`"${raw}" is not a valid URL.`); }
      if (url.protocol !== "http:" && url.protocol !== "https:") { await emit({ type: "tool_done", id, detail: "blocked" }); return text("Only http(s) URLs are allowed."); }
      if (await hostIsPrivate(url.hostname)) { await emit({ type: "tool_done", id, detail: "blocked" }); return text("That host is not allowed (private/loopback/metadata address)."); }
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "manual", headers: { "user-agent": "TaktBot/1.0" } });
        if (res.status >= 300 && res.status < 400) { await emit({ type: "tool_done", id, detail: "redirect" }); return text("The URL redirected; pass the final URL directly."); }
        if (!res.ok) { await emit({ type: "tool_done", id, detail: `HTTP ${res.status}` }); return text(`Fetch failed: HTTP ${res.status}.`); }
        const body = htmlToText(await res.text()).slice(0, 20_000);
        await emit({ type: "tool_done", id, detail: `${body.length} chars` });
        return text(body || "(no readable text found)");
      } catch (e: any) { await emit({ type: "tool_done", id, detail: "error" }); return text(`Could not fetch: ${String(e?.message ?? e)}`); }
    },
  };

  const askUser: TaktTool = {
    name: "ask_user",
    description: "Ask the user 1-4 clarifying questions BEFORE answering, when the request is ambiguous or a choice would change the answer. Questions appear in an interactive panel. For each: a short `header`, the `question`, and `options` (each `label` + optional `description`). Set `multiSelect: true` when several apply. Attach a `render: { kind: 'ascii', content }` only when a quick text/SVG sketch helps them choose. Don't ask what the sources or the user already answered.",
    parameters: params({ questions: askQuestionsSchema }),
    execute: async (args) => {
      const askId = randomUUID();
      const parsed = askQuestionsSchema.safeParse(args?.questions);
      if (!parsed.success) return { output: "Malformed questions — provide an array of {header, question, options:[{label}]}.", isError: true };
      const questions = parsed.data.map((q: any, i: number) => ({ ...q, id: q.id ?? `q${i}` }));
      await emit({ type: "ask_user", askId, questions });
      const payload = await awaitAnswers(askId);
      await emit({ type: "ask_answer", askId, answers: payload.answers, cancelled: payload.cancelled });
      if (payload.cancelled || !payload.answers?.length) return text("The user dismissed the questions. Proceed with best-effort defaults and state your assumptions.");
      return text(`The user answered:\n\n${payload.answers.map((a) => `Q: ${a.question}\nA: ${formatAnswer(a)}`).join("\n\n")}\n\nUse these to answer.`);
    },
  };

  const gather = [findEntityTool, exploreEntityTool, traceTool, searchProductTool, getMediaTool, readProfile, getPageImageTool, cropPageImage, listProductsTool, fetchUrl];
  const canvas = [
    ...(buildCanvasTool ? [buildCanvasTool] : []),
    ...(editCanvasTool ? [editCanvasTool] : []),
    readCanvasTool, selectCanvasTool,
  ];
  return [...gather, ...canvas, updateTodos, askUser];
}
