import { randomUUID } from "node:crypto";
import { catalogModels, type Message } from "@takt/harness";
import type { ChatRequest } from "@takt/shared";
import { getProductBySlug, getManualsByProduct, getEntitiesByType, listMessages } from "@takt/db";
import { buildTaktTools, type Emit } from "./tools.js";
import { runTurnLoop } from "./turn-loop.js";
import { runCanvasWorker } from "./canvas-worker.js";
import { buildSystemPrompt } from "./prompt.js";
import { resolveChat } from "./providers.js";

const MAX_STEPS = 16;

// A final answer that PROMISES an action ("pulling the model now", "building the
// page") is only valid when the turn actually composed something. A model that
// narrates instead of acting poisons the chat history — every later turn imitates
// the pattern — so we detect it and force one corrective pass.
const PROMISE = /\b(build|building|making|creating|generating|composing|pulling|grabbing|preparing|putting)\b[\s\S]{0,80}?\b(now|canvas|page|sheet|viewer|3d|model|diagram|table|chart|for you)\b/i;
export function promisesAction(s: string): boolean { return PROMISE.test(s); }

// The product's measured spec values, one per line — deterministic ground truth
// for the canvas fact-check (spec-check.ts). This is what lets an EDIT turn
// (which re-gathers nothing) still verify every number against the graph.
export function graphSpecFacts(productId: string | null | undefined): string {
  if (!productId) return "";
  try {
    return getEntitiesByType(productId, "spec")
      .filter((e) => e.attrs?.value != null)
      .map((e) => `${e.name} = ${e.attrs.value}${e.attrs.unit ? ` ${e.attrs.unit}` : ""}${e.page ? ` (p.${e.page})` : ""}`)
      .join("\n");
  } catch { return ""; }
}

// Deterministic hero: pick the strongest visual among the assets gathered THIS
// turn — a 3D part beats a tight crop beats a loose photo. Returned to the canvas
// worker as a mandate so the opening is consistent, not model-roulette. Pure.
export function pickHero(figures: string[]): { url: string; tag: "model" | "figure" | "video" } | undefined {
  const glb = figures.find((u) => /\.(glb|gltf)(\?|#|$)/i.test(u));
  if (glb) return { url: glb, tag: "model" };
  const vid = figures.find((u) => /\.(mp4|webm|mov)(\?|#|$)/i.test(u));
  const crop = figures.find((u) => u.includes("/scratch/crops/"));
  if (crop) return { url: crop, tag: "figure" };
  const img = figures.find((u) => /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(u) && !u.includes("/assets/pages/"));
  if (img) return { url: img, tag: "figure" };
  if (vid) return { url: vid, tag: "video" };
  return undefined;
}

// NOTE: the old LLM-judged spec verifier (verifyConditionalSpec) is gone — in
// testing it hallucinated corrections against values that WERE in the retrieved
// facts, contradicting the deterministic graph check shown on the same screen.
// Fact verification is now fully deterministic: spec-check.ts diffs every
// number+unit on the canvas against the gathered facts + the product graph.

async function modelCost(provider: any, model: string): Promise<{ input: number; output: number }> {
  try {
    const meta = await catalogModels(provider.catalogId);
    const c = meta[model]?.cost;
    if (c) return { input: c.input ?? 0, output: c.output ?? 0 };
  } catch { /* offline */ }
  return { input: 0, output: 0 };
}

// The latest canvas on this chat — its canvasId + HTML — read from stored messages.
// Used by edit_canvas to recompose from what's there now. Null if empty.
function currentCanvas(chatId?: string): { canvasId: string; html: string } | null {
  if (!chatId) return null;
  try {
    const msgs = listMessages(chatId);
    for (let i = msgs.length - 1; i >= 0; i--) {
      const blocks = msgs[i]!.content as any[];
      for (let j = blocks.length - 1; j >= 0; j--) {
        if (blocks[j]?.type === "canvas" && blocks[j]?.html) return { canvasId: String(blocks[j].canvasId), html: String(blocks[j].html) };
      }
    }
  } catch { /* best-effort */ }
  return null;
}

// Drive one chat turn: gather on the chat model, compose the canvas on the build
// model (streamed HTML). We own the message list, tool dispatch, and SSE mapping.
export async function runAgent(req: ChatRequest, emit: Emit, signal?: AbortSignal): Promise<void> {
  const product = (req.productSlug ? getProductBySlug(req.productSlug) : null) ?? null;
  if (req.productSlug && !product) { await emit({ type: "error", message: `Unknown product "${req.productSlug}"` }); return; }

  const ac = new AbortController();
  if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener("abort", () => ac.abort(), { once: true }); }

  const manuals = product ? getManualsByProduct(product.id) : [];
  const { provider, model, apiKey } = resolveChat();
  if (!model) { await emit({ type: "error", message: "No model selected. Open Settings → Models and pick a model." }); return; }
  if (!apiKey && !provider.keyless) { await emit({ type: "error", message: `No API key for ${provider.name}. Add one in Settings → Models.` }); return; }

  const messages: Message[] = [
    { role: "system", text: buildSystemPrompt(product, manuals) },
    ...req.messages.map((m) => ({ role: m.role, text: m.text })),
  ];
  if (req.attachments?.length) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) lastUser.images = req.attachments.map((a) => ({ data: a.data, mime: a.mediaType }));
  }

  // Turn accumulators (recorded from tool results by onResult below).
  const retrieved: string[] = [];
  const allowedAssets = new Set<string>();
  const gatheredImages: { data: string; mime: string }[] = [];
  let composedThisTurn = false;
  const question = [...req.messages].reverse().find((m) => m.role === "user")?.text ?? "";

  // build_canvas: compose the full page (title included) and stream it directly —
  // no title shell to wipe. The worker opens the canvas and paints it in place.
  const graphFacts = graphSpecFacts(product?.id);

  const compose = async (brief: string, canvasId?: string): Promise<boolean> => {
    if (ac.signal.aborted) return false;
    const figures = [...allowedAssets].filter((u) => !u.includes("/assets/pages/")); // embeddable crops/meshes/video
    const opts = {
      mode: "build" as const,
      canvasId: canvasId ?? randomUUID().slice(0, 8),
      brief, question,
      facts: retrieved.join("\n---\n").slice(0, 8000),
      graphFacts,
      figures,
      hero: pickHero(figures),
      images: gatheredImages,
      product, emit, signal: ac.signal,
    };
    let ok = await runCanvasWorker(opts);
    // A total build failure (no markers / empty page) is usually a model flake —
    // one fresh-context retry recovers it far more often than not.
    if (!ok && !ac.signal.aborted) {
      console.error("[canvas] build produced no page → one retry");
      ok = await runCanvasWorker(opts);
    }
    if (ok) composedThisTurn = true;
    return ok;
  };

  // edit_canvas: recompose from the current page (no re-gather).
  const edit = async (brief: string, canvasId?: string, target?: string): Promise<boolean> => {
    const cur = currentCanvas(req.chatId);
    if (!cur) return false;
    const ok = await runCanvasWorker({
      mode: "edit", canvasId: canvasId ?? cur.canvasId, currentHtml: cur.html, target, brief,
      graphFacts, // edits re-gather nothing — the graph is their ground truth
      product, emit, signal: ac.signal,
    });
    if (ok) composedThisTurn = true;
    return ok;
  };

  const tools = buildTaktTools({ product, manuals, emit, chatId: req.chatId, context: "main", compose, edit });
  const cost = await modelCost(provider, model);

  try {
    const loopOpts = {
      provider, apiKey: apiKey ?? undefined, model, maxTokens: 8192,
      messages, tools, emit, signal: ac.signal, maxSteps: MAX_STEPS, cost,
      deferLast: (n: string) => n === "build_canvas" || n === "edit_canvas" || n === "ask_user",
      onResult: (_name: string, res: { output?: string; images?: unknown[] }) => {
        for (const m of (res.output || "").matchAll(/\/assets\/[^\s"'?)]+/g)) allowedAssets.add(m[0]);
        if (res.images?.length && gatheredImages.length < 4) gatheredImages.push(...(res.images as typeof gatheredImages));
        if (res.output) retrieved.push(res.output);
      },
    };
    const { text: finalAnswer } = await runTurnLoop(loopOpts);

    // PROMISE GUARDRAIL: the model narrated an action ("building the page now")
    // without composing anything. Left alone, this broken turn poisons the chat —
    // later turns imitate it. Force ONE corrective pass that must actually act.
    if (!composedThisTurn && !ac.signal.aborted && promisesAction(finalAnswer)) {
      console.error("[agent] final text promises an action but nothing was composed → corrective pass");
      messages.push({
        role: "user",
        text: "SYSTEM CHECK: you said you would build/show something but made no tool call, so nothing happened. Do it NOW — gather what you need and call build_canvas. Act; do not narrate.",
      });
      await runTurnLoop({ ...loopOpts, maxSteps: 8 });
    }

    // GUARANTEED CANVAS: gathered real material but never composed → build one now.
    if (!composedThisTurn && !ac.signal.aborted && retrieved.length > 0 && question) {
      try { await compose(`Answer this on the canvas as a designed page from the gathered facts and media: ${question}`); } catch { /* non-fatal */ }
    }
    await emit({ type: "done" });
  } catch (err: any) {
    if (ac.signal.aborted || err?.name === "AbortError") return;
    const raw = String(err?.message ?? err);
    const msg = /invalid api key|authentication|401|403|unauthor|x-api-key|forbidden/i.test(raw)
      ? `${provider.name} rejected the API key. Open Settings → Models and paste a valid key.`
      : raw;
    await emit({ type: "error", message: msg });
  }
}

// ── self-check: `tsx src/agent.ts` ──────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  // promise guardrail: narrated actions are detected; answers and questions are not.
  a(promisesAction("Pulling the Nextruder fan model now.Building the 3D viewer for you now."), "detects a narrated build");
  a(promisesAction("Cheat sheet time — building the temp cheat sheet now."), "detects a narrated sheet build");
  a(!promisesAction("215 °C nozzle, 50–60 °C bed — full PLA profile on the canvas."), "ignores a delivered answer");
  a(!promisesAction("Turn the tension knob clockwise until it clicks."), "ignores an instruction");
  // hero picker priority: 3D beats crop beats loose photo; full pages never lead.
  a(pickHero(["/assets/products/x/media/gear.glb", "/assets/scratch/crops/a.png"])?.tag === "model", "3D wins the hero");
  a(pickHero(["/assets/scratch/crops/a.png", "/assets/products/x/media/photo.jpg"])?.url.includes("/crops/") === true, "crop beats a loose photo");
  a(pickHero(["/assets/pages/m/12.png"]) === undefined, "a full manual page is never the hero");
  console.log("agent verify self-check ok");
}
