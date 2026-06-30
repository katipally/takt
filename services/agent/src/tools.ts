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
    "Create an interactive visual artifact (a calculator, configurator, flowchart, diagram, chart, or 3D view) rendered live in the user's Artifacts panel. Write a self-contained React component and `export default function App() {...}`. The runtime is real ES modules — you MAY `import` from these packages: `react` (hooks), `lucide-react` (icons, e.g. `import { Zap, Check } from 'lucide-react'`), `framer-motion` (animation, `import { motion } from 'framer-motion'`), `recharts` (charts), `d3`, and `three` (3D). Import whatever you use. TypeScript/TSX is fine. Style with Tailwind utility classes; make it interactive, polished, and theme-aware (it inherits light/dark). The artifact sizes to its own content — do NOT use min-h-screen, h-screen, or 100vh (they create large empty areas). Use real values from the manual. You MAY embed an image with `<img src=...>` using the absolute URL returned by get_page_image. To revise an artifact you already made (the user asked to change it), call emit_artifact again with the SAME `key` — it is saved as a new VERSION the user can flip between. Use a NEW `key` for a genuinely different artifact.",
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
