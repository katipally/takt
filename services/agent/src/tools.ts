import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { Product, Manual, ManualKind, SseEvent, AskAnswer } from "@prox/shared";
import { artifactInputSchema, askQuestionsSchema } from "@prox/shared";
import {
  DATA_DIR, matchChunks, getPageImage, createArtifact, nextArtifactVersion, listProducts,
} from "@prox/db";
import { embedQuery } from "@prox/embed";
import { awaitAnswers } from "./pending.js";

export type Emit = (e: SseEvent) => Promise<void> | void;

const WEB_URL = () => process.env.WEB_PUBLIC_URL ?? "http://localhost:3000";
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 64) || "artifact";

const formatAnswer = (a: AskAnswer) =>
  a.skipped ? "(skipped — no preference)" : Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;

export function buildProxServer(ctx: { product: Product; manuals: Manual[]; emit: Emit; chatId?: string }) {
  const { product, emit, chatId } = ctx;

  const searchManual = tool(
    "search_manual",
    "Search this product's manuals (text, tables, and image/diagram captions) for relevant passages. Returns page-cited snippets. Call this before stating any spec, setting, or procedure.",
    {
      query: z.string().describe("What to look up, in natural language"),
      kinds: z.array(z.enum(["text", "table", "image_caption"])).optional()
        .describe("Restrict to chunk kinds; omit for all"),
      k: z.number().int().min(1).max(12).optional().describe("How many results (default 6)"),
    },
    async (args) => {
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
  );

  const getPageImageTool = tool(
    "get_page_image",
    "Fetch a specific manual page as an image and SHOW it to the user. Use for diagrams, schematics, control-panel layouts, duty-cycle tables, the selection chart, and weld-diagnosis pages. The page is displayed in the user's Canvas and also returned so you can read it.",
    {
      page: z.number().int().min(1).describe("Page number"),
      manual: z.enum(["owner", "quick_start", "selection_chart", "other"]).optional()
        .describe("Which manual (omit to use any)"),
    },
    async (args) => {
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
      let imageBlock: { type: "image"; data: string; mimeType: string } | null = null;
      try {
        const data = readFileSync(resolve(DATA_DIR, pi.pngPath)).toString("base64");
        imageBlock = { type: "image", data, mimeType: "image/png" };
      } catch { /* fall through to text-only */ }
      // Give the model the real URL so it can embed this exact image in an
      // artifact (it must never invent an image URL).
      const meta = `Showing ${pi.manualTitle} p.${pi.pageNumber}. To embed this exact page image in an artifact, use this URL verbatim as the <img> src: ${url}${pi.caption ? `\nPage content:\n${pi.caption}` : ""}`;
      return { content: imageBlock ? [imageBlock, { type: "text" as const, text: meta }] : [{ type: "text" as const, text: meta }] };
    },
  );

  const emitArtifact = tool(
    "emit_artifact",
    "Publish the answer as a designed artifact in the user's Artifacts panel — the primary deliverable for substantive questions. You have full design freedom over layout, components and interactions; design what best fits THIS question. Kinds: 'html' for designed/explanatory answers, 'react' for interactive ones (`export default function App(){...}`, real ES module imports from react, lucide-react, framer-motion, recharts, d3, three).\n" +
    "ONE HARD RULE — theme consistency: the artifact must read perfectly in BOTH light and dark. For ANY color/background/border/text-color use ONLY the theme tokens var(--prox-fg/-muted/-card/-surface/-border/-accent/-arc/-success/-danger) and their -soft tints — NEVER bg-white, bg-gray-50, bg-blue-50, text-black, #fff, color:#000 (they break dark mode). Tailwind for LAYOUT only.\n" +
    "Practical: size to content (no min-h-screen/h-screen/100vh); stay readable narrow AND wide. Images: don't embed a whole manual page — crop to the relevant region (e.g. `.prox-crop` scaling/translating the img). Only use an `<img>` src get_page_image returned; never invent one. Cite pages `[p.NN]`. Optional kit helpers exist (.prox-doc/.prox-card/.prox-callout/.prox-table/.prox-steps/.prox-stat/.prox-crop/.prox-figure/.prox-pin/.prox-reflist) but rolling your own is fine as long as colors come from the theme tokens. To revise an artifact, call emit_artifact again with the SAME `key` (new VERSION); use a NEW `key` for a different artifact.",
    artifactInputSchema.shape,
    async (args) => {
      const id = randomUUID();
      await emit({ type: "tool_start", id, tool: "emit_artifact", summary: args.title });
      const parsed = artifactInputSchema.safeParse(args);
      if (!parsed.success) { await emit({ type: "tool_done", id, detail: "invalid" }); return text(`Artifact rejected: ${parsed.error.message}`); }
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
  );

  const listProductsTool = tool(
    "list_products",
    "List all products Prox can answer about (you are currently focused on one).",
    {},
    async () => {
      const products = listProducts();
      return text(products.map((p) => `- ${p.name}${p.manufacturer ? ` (${p.manufacturer})` : ""} [${p.slug}]`).join("\n"));
    },
  );

  const askUser = tool(
    "ask_user",
    "Ask the user 1-4 clarifying questions BEFORE answering, when the request is ambiguous or a choice would change the answer (e.g. which model/variant, which use case, which constraint). The questions appear in an interactive panel. For each question give a short `header`, the `question`, and `options` (each with a `label` and optional `description`). Set `multiSelect: true` when several can apply. To explain a question or an option visually, attach a `render`: `{ kind: 'ascii', content }` for a quick text/SVG sketch, or `{ kind: 'react', content }` — a single self-contained React component named `App` (no imports; `React` is global; style with Tailwind; draw with inline SVG) — for an interactive diagram. Keep questions tight; don't ask what the manual or the user already answered.",
    { questions: askQuestionsSchema },
    async (args) => {
      const askId = randomUUID();
      const questions = args.questions.map((q, i) => ({ ...q, id: q.id ?? `q${i}` }));
      await emit({ type: "ask_user", askId, questions });
      const payload = await awaitAnswers(askId);
      if (payload.cancelled || !payload.answers?.length) {
        return text("The user dismissed the questions without answering. Proceed with reasonable best-effort defaults and clearly state the assumptions you made.");
      }
      const body = payload.answers
        .map((a) => `Q: ${a.question}\nA: ${formatAnswer(a)}`)
        .join("\n\n");
      return text(`The user answered your clarifying questions:\n\n${body}\n\nUse these answers to give a precise, grounded response.`);
    },
  );

  return createSdkMcpServer({
    name: "prox",
    version: "1.0.0",
    tools: [searchManual, getPageImageTool, emitArtifact, listProductsTool, askUser],
  });
}

export const PROX_TOOL_NAMES = [
  "mcp__prox__search_manual",
  "mcp__prox__get_page_image",
  "mcp__prox__emit_artifact",
  "mcp__prox__list_products",
  "mcp__prox__ask_user",
];
