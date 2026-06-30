import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { ChatRequest, MessageBlock, SseEvent } from "@prox/shared";
import { askAnswerPayloadSchema } from "@prox/shared";
import { getProductBySlug, createChat, listChats, addMessage, renameChat, getSetting } from "@prox/db";
import { ingestProduct } from "@prox/ingest";
import { extname } from "node:path";
import { loadEnv } from "./env.js";
import { ensureSeedProviders } from "./providers.js";
import { runAgent } from "./agent.js";
import { resolveAnswers } from "./pending.js";

loadEnv();
ensureSeedProviders();

const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

app.post("/chat", async (c) => {
  const req = (await c.req.json()) as ChatRequest;
  const product = getProductBySlug(req.productSlug);
  const lastUser = req.messages[req.messages.length - 1]?.text ?? "";
  const isFirstTurn = req.messages.length <= 1;

  if (product && req.chatId) createChat(product.id, req.chatId);

  return streamSSE(c, async (stream) => {
    // Accumulate the assistant turn AS AN ORDERED block list so reasoning, tool
    // rows, text, sources, and artifacts all replay in order on reload.
    const blocks: MessageBlock[] = [];
    const appendText = (kind: "text" | "reasoning", t: string) => {
      const last = blocks[blocks.length - 1];
      if (last && last.type === kind) last.text += t;
      else blocks.push({ type: kind, text: t });
    };
    const emit = async (e: SseEvent) => {
      if (e.type === "text_delta") appendText("text", e.text);
      else if (e.type === "reasoning_delta") appendText("reasoning", e.text);
      else if (e.type === "tool_start") blocks.push({ type: "tool", tool: e.tool, summary: e.summary, status: "done" });
      else if (e.type === "tool_done") {
        const t = [...blocks].reverse().find((b) => b.type === "tool" && !b.detail);
        if (t && t.type === "tool") t.detail = e.detail;
      } else if (e.type === "page_image")
        blocks.push({ type: "page_image", citationId: e.citationId, url: e.url, page: e.page, manualKind: e.manualKind as any, caption: e.caption ?? null });
      else if (e.type === "artifact")
        blocks.push({ type: "artifact", artifactId: e.artifactId, title: e.title, kind: e.kind, groupKey: e.groupKey, version: e.version });
      await stream.writeSSE({ data: JSON.stringify(e) });
    };

    try {
      if (req.chatId) addMessage(req.chatId, "user", [{ type: "text", text: lastUser }]);
      if (isFirstTurn && req.chatId) {
        const title = lastUser.replace(/\s+/g, " ").trim().slice(0, 48) || "New chat";
        renameChat(req.chatId, title);
        await emit({ type: "title", title });
      }
      await runAgent(req, emit);
      if (req.chatId && blocks.length) addMessage(req.chatId, "assistant", blocks);
    } catch (err: any) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", message: String(err?.message ?? err) }) });
    }
  });
});

// Out-of-band delivery of ask_user answers. Resolves the promise the ask_user
// tool is awaiting inside an in-flight /chat stream, which then continues.
app.post("/chat/answer", async (c) => {
  const parsed = askAnswerPayloadSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ ok: false, error: "invalid payload" }, 400);
  const delivered = resolveAnswers(parsed.data);
  return c.json({ ok: delivered });
});

app.get("/chats", (c) => {
  const product = getProductBySlug(c.req.query("product") ?? "");
  return c.json(product ? listChats(product.id) : []);
});

// Add a product by uploading its manuals. Streams progress as SSE.
app.post("/ingest", async (c) => {
  const form = await c.req.formData();
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim();
  const manufacturer = String(form.get("manufacturer") ?? "").trim() || null;
  const pdfFiles = form.getAll("pdfs").filter((f) => typeof f !== "string") as unknown as File[];
  const heroFile = form.get("hero");

  return streamSSE(c, async (stream) => {
    const emit = (e: SseEvent) => stream.writeSSE({ data: JSON.stringify(e) });
    if (!name || !slug || !pdfFiles.length) { await emit({ type: "error", message: "Name and at least one PDF are required." }); return; }
    try {
      const pdfs = await Promise.all(pdfFiles.map(async (f) => ({ filename: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
      const hero = heroFile && typeof heroFile !== "string"
        ? { ext: extname((heroFile as File).name) || ".png", data: new Uint8Array(await (heroFile as File).arrayBuffer()) }
        : undefined;
      await ingestProduct({
        slug, name, manufacturer, pdfs, hero,
        captionModel: getSetting("captionModel"),
        onProgress: (m) => emit({ type: "tool_start", id: "ingest", tool: "ingest", summary: m }),
      });
      await emit({ type: "done" });
    } catch (err: any) {
      await emit({ type: "error", message: String(err?.message ?? err) });
    }
  });
});

const port = Number(process.env.AGENT_PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`▸ Prox agent service listening on http://localhost:${port}`);
