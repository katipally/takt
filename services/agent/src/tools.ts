import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z, type ZodRawShape } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Product, Manual, ManualKind, SseEvent, AskAnswer } from "@takt/shared";
import { askQuestionsSchema, uiSurfaceSchema, validateSurface } from "@takt/shared";
import {
  DATA_DIR, getPageImage,
  listProducts, getProductBySlug,
} from "@takt/db";
import { profileExists, listConcepts, readConcept, readIndex, generateIndex, grepProfile } from "@takt/profile";
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
// model follows the schema, and emit_artifact re-parses its own input anyway.
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

export function buildTaktTools(ctx: { product: Product | null; manuals: Manual[]; emit: Emit; chatId?: string; spawnBuild?: (brief: string, key?: string) => void }): TaktTool[] {
  const { product, emit, chatId, spawnBuild } = ctx;
  // Master mode = no single product selected → cross-product tools; the page
  // tools then require a `product` slug to say which product to read from.
  const masterMode = !product;

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
    description: "Fetch a specific manual page as an image and SHOW it to the user. Use for diagrams, schematics, control-panel layouts, duty-cycle tables, the selection chart, and weld-diagnosis pages. The page is displayed in the user's Canvas and also returned so you can read it. To put a figure in an artifact, prefer calling crop_page_image next to embed just the relevant region rather than the whole page.",
    parameters: params({
      page: z.number().int().min(1).describe("Page number"),
      manual: z.enum(["owner", "quick_start", "selection_chart", "other"]).optional()
        .describe("Which manual (omit to use any)"),
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
        images = [{ data: readFileSync(resolve(DATA_DIR, pi.pngPath)).toString("base64"), mime: "image/png" }];
      } catch { /* fall through to text-only */ }
      // Give the model the real URL so it can embed this exact image in an
      // artifact (it must never invent an image URL).
      const meta = `Showing ${pi.manualTitle} p.${pi.pageNumber}. For an artifact, prefer crop_page_image to embed just the relevant region; or use this full-page URL verbatim as the <img> src: ${url}${pi.caption ? `\nPage content:\n${pi.caption}` : ""}`;
      return { output: meta, images };
    },
  };

  const cropPageImage: TaktTool = {
    name: "crop_page_image",
    description: "Crop a manual page to the exact region that matters and SHOW that crop — use this AFTER get_page_image so you've seen the full page and can pick the region. Give the region as fractions of the page (0=left/top, 1=right/bottom): x,y = top-left corner, w,h = width,height. The cropped image is displayed in the user's Canvas and returned so you can confirm it, and you get a verbatim URL to embed in an artifact. Prefer this over embedding a whole page (whole pages have tab-strips/footers/whitespace and look broken).",
    parameters: params({
      page: z.number().int().min(1).describe("Page number"),
      manual: z.enum(["owner", "quick_start", "selection_chart", "other"]).optional()
        .describe("Which manual (omit to use any)"),
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
      try { images = [{ data: readFileSync(dest).toString("base64"), mime: "image/png" }]; } catch { /* text-only */ }
      const meta = `Cropped ${pi.manualTitle} p.${pi.pageNumber}. To embed this exact crop in an artifact, use this URL verbatim as the <img> src: ${url}`;
      return { output: meta, images };
    },
  };

  // DRAW — render a designed answer on the stage as a declarative UI surface
  // (a flat list of typed catalog nodes). The catalog vocabulary + rules live in
  // the system prompt (generated from the same schemas). Invalid surfaces are
  // rejected with precise errors so the model self-corrects before anything shows.
  const emitUi: TaktTool = {
    name: "emit_ui",
    description: "Render a designed, multimodal answer on the main stage as a UI surface — reach for this when structure, media, data, or interaction beats plain prose (a diagram, chart, comparison table, image/gallery, 3D model, procedure, calculator, form). Skip it for a short factual reply — plain chat text already renders richly on the stage. A surface is a flat list of `nodes` (each `{ id, type, props, children? }`) with one `root`; build the answer from the catalog components listed in your system prompt. Prose still streams as normal chat text around it — use Prose nodes only inside a surface. Reuse the SAME `key` to revise a surface (new version); use a NEW `key` for a different one. If rejected, fix exactly what's listed and call emit_ui again with the same key.",
    parameters: params(uiSurfaceSchema.shape),
    execute: async (args) => {
      const id = randomUUID();
      const title = typeof args?.title === "string" && args.title ? args.title : "answer";
      await emit({ type: "tool_start", id, tool: "emit_ui", summary: title });
      const res = validateSurface(args);
      if (!res.ok) {
        await emit({ type: "tool_done", id, detail: "needs fixing" });
        return text(`UI surface rejected — fix these and call emit_ui again with the SAME key:\n- ${res.errors.map((e) => `${e.path}: ${e.message}`).join("\n- ")}`);
      }
      const partId = slugify(res.surface.key ?? res.surface.title ?? res.surface.id);
      await emit({ type: "ui_surface", partId, surface: { ...res.surface, id: res.surface.id || partId } });
      await emit({ type: "tool_done", id, detail: "rendered" });
      return text(`Rendered "${title}" on the stage. Give a one-line takeaway in chat if useful; don't repeat the surface's contents.`);
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
    listProfileTool, grepProfileTool, readProfile, getPageImageTool, cropPageImage,
    emitUi, ...(delegateBuild ? [delegateBuild] : []), updateTodos, listProductsTool, askUser, fetchUrl,
  ];
}
