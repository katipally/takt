import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { transform as esbuildTransform } from "esbuild";
import { z, type ZodRawShape } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Product, Manual, ManualKind, SseEvent, AskAnswer } from "@takt/shared";
import { artifactInputSchema, askQuestionsSchema } from "@takt/shared";
import {
  DATA_DIR, getPageImage, createArtifact, nextArtifactVersion,
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

// Verify an artifact against the mistakes we've actually seen in production
// (clipped CSS-transform crops, invented image URLs, citations boxed on their
// own line, stray-punctuation blocks). Returning issues makes emit_artifact
// REJECT so the model fixes them BEFORE the user ever sees the artifact.
export function lintArtifact(code: string): string[] {
  const issues: string[] = [];
  // 1. CSS-transform / .takt-crop cropping clips labels — the crop tool already crops.
  if (/\btakt-crop\b/.test(code) || /<img[^>]*style=["'][^"']*transform\s*:[^"']*(scale|translate)\s*\(/i.test(code)) {
    issues.push("An image is cropped/positioned with a CSS transform or .takt-crop, which clips its labels. Remove that and instead call crop_page_image for the exact region, then embed the returned URL at full width in a .takt-figure.");
  }
  // 2. Invented / external image URLs — only manual images (/assets/…) are real.
  const badImg = [...code.matchAll(/<img[^>]*\bsrc=["'](https?:\/\/[^"']+)["']/gi)]
    .map((m) => m[1]!).find((u) => !u.includes("/assets/"));
  if (badImg) issues.push(`Image src "${badImg}" is not a real manual image. Use crop_page_image / get_page_image and embed the exact URL it returns (it contains /assets/).`);
  // 3. A citation as the sole content of a block element renders as an empty box.
  if (/<(div|p|li)\b[^>]*>\s*\[p\.?\s*\d+[^<]*\]\s*<\/\1>/i.test(code)) {
    issues.push("A page citation is boxed on its own line. Put citations inline as plain text right after the sentence, e.g. `Shade 10 helmet minimum [p.18].` — never in their own box/card/callout.");
  }
  // 4. Stray punctuation-only block.
  if (/<(div|p|li)\b[^>]*>\s*[.:;,]+\s*<\/\1>/i.test(code)) {
    issues.push("Remove stray punctuation elements (a block whose only content is '.' or ':').");
  }
  // 5. A <model-viewer> 3D model must load an ingested asset (/assets/…), never
  //    an external URL — the sandbox CSP only allows our own origin.
  const badModel = [...code.matchAll(/<model-viewer[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map((m) => m[1]!).find((u) => !u.includes("/assets/") && !u.startsWith("data:") && !u.startsWith("blob:"));
  if (badModel) issues.push(`3D model src "${badModel}" is not an ingested asset. A <model-viewer> src must point to an ingested /assets/ .glb — never an external URL.`);
  return issues;
}

const formatAnswer = (a: AskAnswer) =>
  a.skipped ? "(skipped — no preference)" : Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;

// Rewrite bundle-relative media links (media/…) to servable /assets URLs so the
// model gets usable image/video/3D URLs it can show; absolute /assets links pass
// through unchanged.
const resolveMedia = (slug: string, body: string): string =>
  body.replace(/\]\(media\//g, `](/assets/products/${slug}/media/`);

export function buildTaktTools(ctx: { product: Product | null; manuals: Manual[]; emit: Emit; chatId?: string }): TaktTool[] {
  const { product, emit, chatId } = ctx;
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

  const emitArtifact: TaktTool = {
    name: "emit_artifact",
    description: "Publish the answer as a designed artifact in the user's Artifacts panel — reach for this when a designed, visual, or interactive answer beats plain text (a diagram, calculator, schematic, annotated page, comparison, procedure); skip it for simple replies. You have full design freedom over layout, components and interactions; design what best fits THIS question. Kinds: 'html' for designed/explanatory answers, 'react' for interactive ones (`export default function App(){...}`, real ES module imports from react, lucide-react, framer-motion, recharts, d3, three).\n" +
      "DIAGRAMS: for flowcharts/sequences/state/gantt, put Mermaid syntax inside a `<pre class=\"mermaid\">…</pre>` — it renders as a themed diagram (works in html and react). 3D: embed an ingested model with `<model-viewer src=\"/assets/…​.glb\" camera-controls>` (the src MUST be a real /assets/ asset, never an external URL).\n" +
      "ONE HARD RULE — theme consistency: the artifact must read perfectly in BOTH light and dark. For ANY color/background/border/text-color use ONLY the theme tokens var(--takt-fg/-muted/-card/-surface/-border/-accent/-arc/-success/-danger) and their -soft tints — NEVER bg-white, bg-gray-50, bg-blue-50, text-black, #fff, color:#000 (they break dark mode). Tailwind for LAYOUT only.\n" +
      "Practical: size to content (no min-h-screen/h-screen/100vh); stay readable narrow AND wide. Images: embed ONLY a real crop_page_image/get_page_image URL (contains /assets/) at FULL WIDTH inside a .takt-figure — NEVER crop or shift an image with a CSS transform (scale/translate) or .takt-crop (it clips labels); if a label is cut off, call crop_page_image again with a wider region. Never invent an image URL. Citations: inline plain text right after the claim (e.g. `... [p.18].`) — NEVER put a citation alone in a box/card/callout/border (it renders as an empty box). No empty elements or stray punctuation. The artifact is checked before it's shown; if it's rejected, fix exactly what's listed and re-emit with the SAME `key`. To revise, call emit_artifact again with the SAME `key` (new VERSION); use a NEW `key` for a different artifact.",
    parameters: params(artifactInputSchema.shape),
    execute: async (args) => {
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "emit_artifact", summary: args.title });
      const parsed = artifactInputSchema.safeParse(args);
      if (!parsed.success) { await emit({ type: "tool_done", id, detail: "invalid" }); return text(`Artifact rejected: ${parsed.error.message}`); }
      // Compile gate: catch syntax/parse errors BEFORE the user sees a broken
      // frame, and hand the error back so the model self-corrects.
      // ponytail: esbuild catches the 80% (parse/syntax); runtime errors still
      // surface in the iframe .takt-err box.
      if (parsed.data.kind === "react") {
        try {
          await esbuildTransform(parsed.data.code, { loader: "tsx", jsx: "automatic" });
        } catch (e) {
          await emit({ type: "tool_done", id, detail: "won't compile" });
          return text(`Artifact rejected — the React code does not compile: ${(e as Error).message}\nFix the syntax and call emit_artifact again.`);
        }
      }
      // Quality gate: reject known-bad patterns so the model fixes them before
      // the artifact is ever shown (crops, image URLs, boxed citations, cruft).
      const issues = lintArtifact(parsed.data.code);
      if (issues.length) {
        await emit({ type: "tool_done", id, detail: "needs fixing" });
        return text(`Artifact rejected — fix these and call emit_artifact again with the SAME key:\n- ${issues.join("\n- ")}`);
      }
      const groupKey = parsed.data.key ? slugify(parsed.data.key) : slugify(parsed.data.title);
      const version = nextArtifactVersion(chatId, groupKey);
      const artifact = createArtifact({
        productId: product?.id ?? null, chatId: chatId ?? null, title: parsed.data.title, kind: parsed.data.kind, code: parsed.data.code,
        groupKey, version,
      });
      await emit({ type: "artifact", artifactId: artifact.id, title: artifact.title, kind: artifact.kind, groupKey, version });
      await emit({ type: "tool_done", id, detail: version > 1 ? `v${version}` : "rendered" });
      return text(`Artifact "${artifact.title}" (v${version}) created and shown to the user.`);
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
  return [listProfileTool, grepProfileTool, readProfile, getPageImageTool, cropPageImage, emitArtifact, listProductsTool, askUser, fetchUrl];
}
