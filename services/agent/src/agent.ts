import { randomUUID } from "node:crypto";
import { streamProvider, catalogModels, type Message } from "@takt/harness";
import type { ChatRequest } from "@takt/shared";
import { getProductBySlug, getManualsByProduct, listMessages } from "@takt/db";
import { buildTaktTools, type Emit } from "./tools.js";
import { runTurnLoop } from "./turn-loop.js";
import { runCanvasWorker } from "./canvas-worker.js";
import { buildSystemPrompt } from "./prompt.js";
import { resolveChat } from "./providers.js";

const MAX_STEPS = 16;

// A numeric spec whose value depends on a CONDITION (process, voltage, material,
// mode) — the class of fact the model most often cross-wires. We fact-check ONLY
// these against what was retrieved; casual/non-numeric answers skip it.
const CONDITIONAL_SPEC = /\b\d[\d.,]*\s?(%|amps?|volts?|ipm|psi|lbs?|degrees?|°\s?[cf]|[av])(?![a-z])/i;
export function hasConditionalSpec(s: string): boolean { return CONDITIONAL_SPEC.test(s); }

function parseVerdict(raw: string): { ok: boolean; fix?: string } | null {
  try {
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    if (typeof j?.ok === "boolean") return { ok: j.ok, fix: typeof j.fix === "string" ? j.fix : undefined };
  } catch { /* not JSON */ }
  return null;
}

// Narrow, cheap fact-check: only when the final answer states a conditional spec
// AND the turn retrieved sources. Runs on the CHAT model (minimal reasoning), reads
// only what was retrieved, and on a same-condition mismatch appends ONE grounded
// correction line. Never blocks a normal answer.
async function verifyConditionalSpec(answer: string, retrieved: string[], emit: Emit, signal: AbortSignal): Promise<void> {
  if (signal.aborted || !answer || !retrieved.length || !hasConditionalSpec(answer)) return;
  const { provider, model, apiKey } = resolveChat();
  if (!model || (!apiKey && !provider.keyless)) return;
  const facts = retrieved.join("\n---\n").slice(0, 6000);
  const prompt = `A product-support answer may state a spec that depends on a condition (process, input voltage, material, mode). Check ONLY the numeric specs.
ANSWER: ${answer}
RETRIEVED FACTS (the only ground truth): ${facts}
Does every numeric spec in ANSWER match a RETRIEVED fact FOR THE SAME CONDITION? A value matching a DIFFERENT condition's number is wrong.
Return ONLY JSON: {"ok":true} or {"ok":false,"fix":"<one short corrected sentence with the right value and its condition>"}`;
  let raw = "";
  try {
    for await (const ev of streamProvider(provider, apiKey ?? undefined, { model, messages: [{ role: "user", text: prompt }], tools: [], maxTokens: 300, reasoningEffort: "minimal" }, signal)) {
      if (ev.type === "text") raw += ev.delta;
    }
  } catch { return; }
  const v = parseVerdict(raw);
  if (v && v.ok === false && v.fix?.trim() && !signal.aborted) {
    await emit({ type: "text_delta", text: `\n\n— Correction: ${v.fix.trim()}` });
  }
}

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
  const compose = async (brief: string, canvasId?: string): Promise<boolean> => {
    if (ac.signal.aborted) return false;
    const figures = [...allowedAssets].filter((u) => !u.includes("/assets/pages/")); // embeddable crops/meshes/video
    const ok = await runCanvasWorker({
      mode: "build",
      canvasId: canvasId ?? randomUUID().slice(0, 8),
      brief, question,
      facts: retrieved.join("\n---\n").slice(0, 8000),
      figures,
      images: gatheredImages,
      product, emit, signal: ac.signal,
    });
    if (ok) composedThisTurn = true;
    return ok;
  };

  // edit_canvas: recompose from the current page (no re-gather).
  const edit = async (brief: string, canvasId?: string, target?: string): Promise<boolean> => {
    const cur = currentCanvas(req.chatId);
    if (!cur) return false;
    const ok = await runCanvasWorker({
      mode: "edit", canvasId: canvasId ?? cur.canvasId, currentHtml: cur.html, target, brief,
      product, emit, signal: ac.signal,
    });
    if (ok) composedThisTurn = true;
    return ok;
  };

  const tools = buildTaktTools({ product, manuals, emit, chatId: req.chatId, context: "main", compose, edit });
  const cost = await modelCost(provider, model);

  try {
    const { text: finalAnswer } = await runTurnLoop({
      provider, apiKey: apiKey ?? undefined, model, maxTokens: 8192,
      messages, tools, emit, signal: ac.signal, maxSteps: MAX_STEPS, cost,
      deferLast: (n) => n === "build_canvas" || n === "edit_canvas" || n === "ask_user",
      onResult: (_name, res) => {
        for (const m of (res.output || "").matchAll(/\/assets\/[^\s"'?)]+/g)) allowedAssets.add(m[0]);
        if (res.images?.length && gatheredImages.length < 4) gatheredImages.push(...res.images);
        if (res.output) retrieved.push(res.output);
      },
    });

    // GUARANTEED CANVAS: gathered real material but never composed → build one now.
    if (!composedThisTurn && !ac.signal.aborted && retrieved.length > 0 && question) {
      try { await compose(`Answer this on the canvas as a designed page from the gathered facts and media: ${question}`); } catch { /* non-fatal */ }
    }
    await verifyConditionalSpec(finalAnswer, retrieved, emit, ac.signal);
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
  a(hasConditionalSpec("115A on 240V"), "detects an amperage/voltage spec");
  a(hasConditionalSpec("the duty cycle is 25%"), "detects a percentage spec");
  a(!hasConditionalSpec("turn the tension knob clockwise"), "ignores a non-numeric answer");
  a(parseVerdict('{"ok":false,"fix":"115 A on 240 V"}')?.ok === false, "parses a not-ok verdict");
  a(parseVerdict("garbage") === null, "returns null on non-JSON");
  console.log("agent verify self-check ok");
}
