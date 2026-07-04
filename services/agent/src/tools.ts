import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { transform as esbuildTransform } from "esbuild";
import { z, type ZodRawShape } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Product, Manual, ManualKind, SseEvent, AskAnswer } from "@prox/shared";
import { artifactInputSchema, askQuestionsSchema } from "@prox/shared";
import {
  DATA_DIR, matchChunks, getPageImage, createArtifact, nextArtifactVersion, listProducts,
} from "@prox/db";
import { embedQuery } from "@prox/embed";
import { awaitAnswers } from "./pending.js";

export type Emit = (e: SseEvent) => Promise<void> | void;

// A tool the agent loop can call directly: JSON-Schema params for the model,
// and an execute() returning text (+ optional images fed back for vision).
export interface ProxTool {
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
  // 1. CSS-transform / .prox-crop cropping clips labels — the crop tool already crops.
  if (/\bprox-crop\b/.test(code) || /<img[^>]*style=["'][^"']*transform\s*:[^"']*(scale|translate)\s*\(/i.test(code)) {
    issues.push("An image is cropped/positioned with a CSS transform or .prox-crop, which clips its labels. Remove that and instead call crop_page_image for the exact region, then embed the returned URL at full width in a .prox-figure.");
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
  return issues;
}

const formatAnswer = (a: AskAnswer) =>
  a.skipped ? "(skipped — no preference)" : Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;

export function buildProxTools(ctx: { product: Product; manuals: Manual[]; emit: Emit; chatId?: string }): ProxTool[] {
  const { product, emit, chatId } = ctx;

  const searchManual: ProxTool = {
    name: "search_manual",
    description: "Search this product's manuals (text and image/diagram/table captions) for relevant passages. Returns page-cited snippets. Call this before stating any spec, setting, or procedure.",
    parameters: params({
      query: z.string().describe("What to look up, in natural language"),
      kinds: z.array(z.enum(["text", "image_caption"])).optional()
        .describe("Restrict to chunk kinds; omit for all"),
      k: z.number().int().min(1).max(12).optional().describe("How many results (default 6)"),
    }),
    execute: async (args) => {
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "search_manual", summary: args.query });
      const vec = await embedQuery(args.query);
      const results = matchChunks(product.id, vec, args.k ?? 6, args.kinds as any);
      await emit({ type: "tool_done", id, detail: `${results.length} passage${results.length === 1 ? "" : "s"}` });
      if (!results.length) return text("No matching passages found in the manuals.");
      const body = results
        .map((r) => `[${r.manualTitle} p.${r.pageNumber} · ${r.kind}]\n${r.content}`)
        .join("\n\n---\n\n");
      return text(body);
    },
  };

  const getPageImageTool: ProxTool = {
    name: "get_page_image",
    description: "Fetch a specific manual page as an image and SHOW it to the user. Use for diagrams, schematics, control-panel layouts, duty-cycle tables, the selection chart, and weld-diagnosis pages. The page is displayed in the user's Canvas and also returned so you can read it. To put a figure in an artifact, prefer calling crop_page_image next to embed just the relevant region rather than the whole page.",
    parameters: params({
      page: z.number().int().min(1).describe("Page number"),
      manual: z.enum(["owner", "quick_start", "selection_chart", "other"]).optional()
        .describe("Which manual (omit to use any)"),
    }),
    execute: async (args) => {
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "get_page_image", summary: `page ${args.page}` });
      const pi = getPageImage(product.id, (args.manual as ManualKind) ?? null, args.page);
      await emit({ type: "tool_done", id, detail: pi ? `p.${pi.pageNumber}` : "not found" });
      if (!pi) return text(`No page ${args.page} found for ${args.manual ?? "this product"}.`);
      const citationId = randomUUID();
      const url = `${WEB_URL()}/assets/${pi.pngPath}`;
      await emit({
        type: "page_image", citationId, url,
        page: pi.pageNumber, manualKind: pi.manualKind, manualTitle: pi.manualTitle, caption: pi.caption,
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

  const cropPageImage: ProxTool = {
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
    }),
    execute: async (args) => {
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "crop_page_image", summary: `page ${args.page}` });
      const pi = getPageImage(product.id, (args.manual as ManualKind) ?? null, args.page);
      if (!pi) { await emit({ type: "tool_done", id, detail: "not found" }); return text(`No page ${args.page} found for ${args.manual ?? "this product"}.`); }
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
      const cropRel = `crops/${pi.manualId}/${pi.pageNumber}_${r(args.x)}_${r(args.y)}_${r(args.w)}_${r(args.h)}.png`;
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
      });
      await emit({ type: "tool_done", id, detail: `p.${pi.pageNumber} crop` });
      let images: ToolResult["images"];
      try { images = [{ data: readFileSync(dest).toString("base64"), mime: "image/png" }]; } catch { /* text-only */ }
      const meta = `Cropped ${pi.manualTitle} p.${pi.pageNumber}. To embed this exact crop in an artifact, use this URL verbatim as the <img> src: ${url}`;
      return { output: meta, images };
    },
  };

  const emitArtifact: ProxTool = {
    name: "emit_artifact",
    description: "Publish the answer as a designed artifact in the user's Artifacts panel — the primary deliverable for substantive questions. You have full design freedom over layout, components and interactions; design what best fits THIS question. Kinds: 'html' for designed/explanatory answers, 'react' for interactive ones (`export default function App(){...}`, real ES module imports from react, lucide-react, framer-motion, recharts, d3, three).\n" +
      "ONE HARD RULE — theme consistency: the artifact must read perfectly in BOTH light and dark. For ANY color/background/border/text-color use ONLY the theme tokens var(--prox-fg/-muted/-card/-surface/-border/-accent/-arc/-success/-danger) and their -soft tints — NEVER bg-white, bg-gray-50, bg-blue-50, text-black, #fff, color:#000 (they break dark mode). Tailwind for LAYOUT only.\n" +
      "Practical: size to content (no min-h-screen/h-screen/100vh); stay readable narrow AND wide. Images: embed ONLY a real crop_page_image/get_page_image URL (contains /assets/) at FULL WIDTH inside a .prox-figure — NEVER crop or shift an image with a CSS transform (scale/translate) or .prox-crop (it clips labels); if a label is cut off, call crop_page_image again with a wider region. Never invent an image URL. Citations: inline plain text right after the claim (e.g. `... [p.18].`) — NEVER put a citation alone in a box/card/callout/border (it renders as an empty box). No empty elements or stray punctuation. The artifact is checked before it's shown; if it's rejected, fix exactly what's listed and re-emit with the SAME `key`. To revise, call emit_artifact again with the SAME `key` (new VERSION); use a NEW `key` for a different artifact.",
    parameters: params(artifactInputSchema.shape),
    execute: async (args) => {
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "emit_artifact", summary: args.title });
      const parsed = artifactInputSchema.safeParse(args);
      if (!parsed.success) { await emit({ type: "tool_done", id, detail: "invalid" }); return text(`Artifact rejected: ${parsed.error.message}`); }
      // Compile gate: catch syntax/parse errors BEFORE the user sees a broken
      // frame, and hand the error back so the model self-corrects.
      // ponytail: esbuild catches the 80% (parse/syntax); runtime errors still
      // surface in the iframe .prox-err box.
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
        productId: product.id, chatId: chatId ?? null, title: parsed.data.title, kind: parsed.data.kind, code: parsed.data.code,
        groupKey, version,
      });
      await emit({ type: "artifact", artifactId: artifact.id, title: artifact.title, kind: artifact.kind, groupKey, version });
      await emit({ type: "tool_done", id, detail: version > 1 ? `v${version}` : "rendered" });
      return text(`Artifact "${artifact.title}" (v${version}) created and shown to the user.`);
    },
  };

  const listProductsTool: ProxTool = {
    name: "list_products",
    description: "List all products Prox can answer about (you are currently focused on one).",
    parameters: params({}),
    execute: async () => {
      const products = listProducts();
      return text(products.map((p) => `- ${p.name}${p.manufacturer ? ` (${p.manufacturer})` : ""} [${p.slug}]`).join("\n"));
    },
  };

  const askUser: ProxTool = {
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

  return [searchManual, getPageImageTool, cropPageImage, emitArtifact, listProductsTool, askUser];
}
