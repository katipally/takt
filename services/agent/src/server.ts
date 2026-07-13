import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import type { ChatRequest, SseEvent } from "@takt/shared";
import { askAnswerPayloadSchema } from "@takt/shared";
import { getProductBySlug, createChat, listChats, listMasterChats, addMessage, renameChat, loadEnv } from "@takt/db";
import { ingestProduct, countPdfPages } from "@takt/ingest";
import { extname } from "node:path";
import { catalogModels } from "@takt/harness";
import { makeBlockEmit } from "./block-emit.js";
import { ensureSeedProviders, resolveCaption } from "./providers.js";

// Per-1M-token prices for a caption model, from the models.dev catalog (cached).
async function captionCost(provider: any, model: string): Promise<{ input: number; output: number }> {
  try {
    const meta = await catalogModels(provider.catalogId);
    const c = meta[model]?.cost;
    if (c) return { input: c.input ?? 0, output: c.output ?? 0 };
  } catch { /* offline / no catalog */ }
  return { input: 0, output: 0 };
}
import { runAgent } from "./agent.js";
import { resolveAnswers } from "./pending.js";
import type { Server } from "node:http";

loadEnv();
ensureSeedProviders();

// Shared-secret gate + locked CORS. The agent is meant to sit behind the Next
// proxy on localhost / inside the container; this closes the hole if :8787 is
// ever reachable. The secret is opt-in: when unset (pure local dev) the gate is
// skipped; the Next proxy forwards TAKT_AGENT_SECRET on every call when set, and
// the container always sets one (docker-entrypoint).
const AGENT_SECRET = process.env.TAKT_AGENT_SECRET?.trim() || "";
const WEB_ORIGIN = process.env.WEB_PUBLIC_URL?.trim() || "http://localhost:3000";

const app = new Hono();
app.use("*", cors({ origin: WEB_ORIGIN }));
app.use("*", async (c, next) => {
  if (!AGENT_SECRET || c.req.path === "/health") return next();
  if (c.req.header("x-takt-secret") !== AGENT_SECRET) return c.json({ error: "unauthorized" }, 401);
  return next();
});

app.get("/health", (c) => c.json({ ok: true }));

app.post("/chat", async (c) => {
  const req = (await c.req.json()) as ChatRequest;
  const product = req.productSlug ? getProductBySlug(req.productSlug) : undefined;
  const lastUser = req.messages[req.messages.length - 1]?.text ?? "";
  const isFirstTurn = req.messages.length <= 1;

  // Create the chat (master chats have a null product_id).
  if (req.chatId) createChat(product?.id ?? null, req.chatId);

  return streamSSE(c, async (stream) => {
    // Accumulate the assistant turn as an ordered block list (so reasoning, tool
    // rows, text, sources, and the canvas replay in order on reload) AND forward
    // each event, serializing writes so concurrent emitters can't interleave.
    const { emit, blocks } = makeBlockEmit((e: SseEvent) => stream.writeSSE({ data: JSON.stringify(e) }));

    try {
      if (req.chatId) addMessage(req.chatId, "user", [{ type: "text", text: lastUser }]);
      if (isFirstTurn && req.chatId) {
        const title = lastUser.replace(/\s+/g, " ").trim().slice(0, 48) || "New chat";
        renameChat(req.chatId, title);
        await emit({ type: "title", title });
      }
      await runAgent(req, emit, c.req.raw.signal);
    } catch (err: any) {
      // Stop is not an error — runAgent swallows aborts. Anything else is real.
      if (!c.req.raw.signal.aborted && err?.name !== "AbortError")
        await stream.writeSSE({ data: JSON.stringify({ type: "error", message: String(err?.message ?? err) }) });
    } finally {
      // Persist the assistant turn even on Stop, so reopening the chat shows the
      // partial reply, ask_user panel, and page images exactly as they streamed.
      if (req.chatId && blocks.length) addMessage(req.chatId, "assistant", blocks);
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
  const slug = c.req.query("product") ?? "";
  // "master" (or empty) → the no-product chat list; otherwise this product's.
  if (!slug || slug === "master") return c.json(listMasterChats());
  const product = getProductBySlug(slug);
  return c.json(product ? listChats(product.id) : []);
});

// Pre-ingest estimate: count pages (cheap, no captioning) so the UI can show
// page count + model + an estimated cost and let the user confirm before spend.
app.post("/ingest/estimate", async (c) => {
  const form = await c.req.formData();
  const files = (k: string) => form.getAll(k).filter((f) => typeof f !== "string") as unknown as File[];
  // Only PDFs are uploaded (their pages must be counted). Everything else is sent
  // as a COUNT — no need to upload big media/STLs just to estimate.
  const pdfFiles = files("pdfs");
  const num = (k: string) => { const n = Math.floor(Number(form.get(k) ?? 0)); return Number.isFinite(n) && n > 0 ? n : 0; };
  const images = num("imagesCount");
  const videos = num("videosCount");
  const audios = num("audiosCount");
  const models = num("modelsCount");
  if (!pdfFiles.length && !images && !videos && !models) {
    return c.json({ error: "Add at least one PDF, image, video, or 3D part." }, 400);
  }
  const perFile = await Promise.all(pdfFiles.map(async (f) => {
    try { return { name: f.name, pages: countPdfPages(new Uint8Array(await f.arrayBuffer())) }; }
    catch { return { name: f.name, pages: 0 }; }
  }));
  const pdfPages = perFile.reduce((n, f) => n + f.pages, 0);
  // Cost is per vision call ≈ per page. Each image is ~1 call; each video's
  // chaptering samples ~12 frames in one call, ~2 pages of tokens. Audio (local
  // transcription) and 3D (pure geometry) cost nothing, so they don't add to $.
  const imageUnits = images;
  const videoUnits = videos * 2;
  const cap = resolveCaption();
  const cost = cap.model ? await captionCost(cap.provider, cap.model) : { input: 0, output: 0 };
  return c.json({
    perFile,
    totalPages: pdfPages + imageUnits + videoUnits,
    pdfPages,
    images,
    videos,
    audios,
    models,
    model: cap.model,
    provider: cap.provider.name,
    cost: cost.input || cost.output ? cost : null,
    hasKey: !!cap.apiKey || !!cap.provider.keyless,
  });
});

// Add a product by uploading its manuals. Streams progress as SSE.
app.post("/ingest", async (c) => {
  const form = await c.req.formData();
  const name = String(form.get("name") ?? "").trim();
  const slug = String(form.get("slug") ?? "").trim();
  const manufacturer = String(form.get("manufacturer") ?? "").trim() || null;
  const pdfFiles = form.getAll("pdfs").filter((f) => typeof f !== "string") as unknown as File[];
  // Web/YouTube source URLs (newline- or comma-separated), text-only.
  const urls = String(form.get("urls") ?? "").split(/[\n,]+/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u));
  const heroFile = form.get("hero");
  // 3D part models (.stl → .glb), walkthrough videos (each chaptered), and loose
  // images (each vision-captioned). Multiple of each; `video` kept for back-compat.
  const modelFiles = form.getAll("models").filter((f) => typeof f !== "string") as unknown as File[];
  const videoFiles = form.getAll("videos").filter((f) => typeof f !== "string") as unknown as File[];
  const legacyVideo = form.get("video");
  if (legacyVideo && typeof legacyVideo !== "string") videoFiles.push(legacyVideo as unknown as File);
  const imageFiles = form.getAll("images").filter((f) => typeof f !== "string") as unknown as File[];
  const audioFiles = form.getAll("audios").filter((f) => typeof f !== "string") as unknown as File[];

  // A folder upload sends each file's RELATIVE PATH as its name ("prusa/…/x.pdf").
  // Strip to the basename before it becomes a disk path (else writes ENOENT into a
  // non-existent subdir). Models keep the path so the subsystem can be derived first.
  const base = (n: string) => n.split("/").filter(Boolean).pop() ?? n;

  return streamSSE(c, async (stream) => {
    const emit = (e: SseEvent) => stream.writeSSE({ data: JSON.stringify(e) });
    if (!name || !slug || (!pdfFiles.length && !urls.length)) { await emit({ type: "error", message: "A name and at least one PDF or source URL are required." }); return; }
    const cap = resolveCaption();
    // A model is only strictly required when captioning PDF pages; URL-only
    // products are text-only, but we still want a model for starter questions.
    if (pdfFiles.length && !cap.model) { await emit({ type: "error", message: "No ingestion model selected. Pick one in Settings → Models before adding a product." }); return; }
    if (pdfFiles.length && !cap.apiKey && !cap.provider.keyless) { await emit({ type: "error", message: `No API key for ${cap.provider.name}. Add your key in Settings → Models before adding a product.` }); return; }
    try {
      // Dedup identical PDFs (Prusa ships the same parts catalog in two folders) —
      // by basename+size, so we don't caption + author the same doc twice.
      const seenPdf = new Set<string>();
      const pdfs = (await Promise.all(pdfFiles.map(async (f) => ({ filename: base(f.name), data: new Uint8Array(await f.arrayBuffer()) }))))
        .filter((p) => { const k = `${p.filename}:${p.data.byteLength}`; if (seenPdf.has(k)) return false; seenPdf.add(k); return true; });
      const hero = heroFile && typeof heroFile !== "string"
        ? { ext: extname((heroFile as File).name) || ".png", data: new Uint8Array(await (heroFile as File).arrayBuffer()) }
        : undefined;
      // A model's filename may carry its folder path (from the web folder-drop) —
      // derive the subsystem from the parent folder, ignoring format-only folders.
      const models = await Promise.all(modelFiles.map(async (f) => {
        const segs = f.name.split("/").filter(Boolean);
        const filename = segs[segs.length - 1] ?? f.name;
        let subsystem: string | undefined = segs.length >= 2 ? segs[segs.length - 2] : undefined;
        if (subsystem && /^(print_files|model_files|files|stl|step|stp|3mf|glb|gltf)$/i.test(subsystem)) subsystem = undefined;
        return { filename, data: new Uint8Array(await f.arrayBuffer()), subsystem };
      }));
      const videos = await Promise.all(videoFiles.map(async (f) => ({ filename: base(f.name), data: new Uint8Array(await f.arrayBuffer()) })));
      const images = await Promise.all(imageFiles.map(async (f) => ({ filename: base(f.name), data: new Uint8Array(await f.arrayBuffer()) })));
      const audios = await Promise.all(audioFiles.map(async (f) => ({ filename: base(f.name), data: new Uint8Array(await f.arrayBuffer()) })));
      const result = await ingestProduct({
        slug, name, manufacturer, pdfs, webSources: urls.map((url) => ({ url })), hero, models, videos, images, audios,
        captionProvider: cap.provider, captionModel: cap.model, apiKey: cap.apiKey ?? undefined,
        onProgress: (m) => emit({ type: "tool_start", id: "ingest", tool: "ingest", summary: m }),
      });
      const price = await captionCost(cap.provider, cap.model);
      const costUsd = (result.inputTokens * price.input + result.outputTokens * price.output) / 1_000_000;
      await emit({ type: "done", inputTokens: result.inputTokens, outputTokens: result.outputTokens, pages: result.pages, costUsd });
    } catch (err: any) {
      await emit({ type: "error", message: String(err?.message ?? err) });
    }
  });
});

const port = Number(process.env.AGENT_PORT ?? 8787);
const server = serve({ fetch: app.fetch, port }) as unknown as Server;
console.log(`▸ Takt agent service listening on http://localhost:${port}`);

// A clear message on a busy port instead of an unhandled-'error' crash, and a
// graceful shutdown so `tsx watch` restarts (SIGTERM) release the port cleanly —
// otherwise the next boot hits EADDRINUSE and orphans pile up.
server.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EADDRINUSE") console.error(`[agent] port ${port} is already in use — kill the old process or set AGENT_PORT.`);
  else console.error("[agent] server error:", e);
  process.exit(1);
});
let closing = false;
function shutdown() {
  if (closing) return; closing = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref(); // don't hang on a stuck socket
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
