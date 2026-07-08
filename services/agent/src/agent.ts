import { streamProvider, catalogModels, type Message } from "@takt/harness";
import type { ChatRequest } from "@takt/shared";
import { getProductBySlug, getManualsByProduct } from "@takt/db";
import { buildTaktTools, type Emit } from "./tools.js";
import { runBuildSubagent } from "./subagent.js";
import { collectTurn } from "./turn.js";
import { buildSystemPrompt } from "./prompt.js";
import { resolveChat, resolveLive } from "./providers.js";

const MAX_STEPS = 16;

// A numeric spec whose value depends on a CONDITION (process, input voltage,
// material, mode) — the class of fact the model most often cross-wires (e.g.
// stating the TIG continuous current for a MIG question). We fact-check ONLY
// these against what was actually retrieved; casual/non-numeric answers skip it.
const CONDITIONAL_SPEC = /\b\d[\d.,]*\s?(%|amps?|volts?|ipm|psi|lbs?|degrees?|°\s?[cf]|[av])(?![a-z])/i;
export function hasConditionalSpec(s: string): boolean { return CONDITIONAL_SPEC.test(s); }

// Lenient {ok, fix} extraction from the verifier's reply. Null → couldn't parse
// (treated as "don't touch the answer" — a verifier failure never blocks a reply).
function parseVerdict(raw: string): { ok: boolean; fix?: string } | null {
  try {
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    if (typeof j?.ok === "boolean") return { ok: j.ok, fix: typeof j.fix === "string" ? j.fix : undefined };
  } catch { /* not JSON */ }
  return null;
}

// Narrow, cheap fact-check: only when the final answer states a conditional spec
// AND the turn retrieved sources. Runs on the FAST live model (already configured
// for low latency), reads only what the agent retrieved, and on a same-condition
// mismatch appends ONE grounded correction line. Never blocks or delays a normal
// answer. ponytail: append the verifier's grounded fix rather than re-running the
// whole agent turn; a wrong verifier could over-correct, but it only fires on a
// conditional spec and the fix is drawn from the retrieved facts, not free memory.
async function verifyConditionalSpec(answer: string, retrieved: string[], emit: Emit, signal: AbortSignal): Promise<void> {
  if (signal.aborted || !answer || !retrieved.length || !hasConditionalSpec(answer)) return;
  const { provider, model, apiKey } = resolveLive();
  if (!model || (!apiKey && !provider.keyless)) return; // can't verify → leave the answer as-is
  const facts = retrieved.join("\n---\n").slice(0, 6000);
  const prompt = `A product-support answer may state a spec that depends on a condition (process, input voltage, material, mode). Check ONLY the numeric specs.
ANSWER: ${answer}
RETRIEVED FACTS (the only ground truth): ${facts}
Does every numeric spec in ANSWER match a RETRIEVED fact FOR THE SAME CONDITION (right process AND right voltage/mode)? A value that matches a DIFFERENT condition's number is wrong.
Return ONLY JSON: {"ok":true} or {"ok":false,"fix":"<one short corrected sentence with the right value and its condition>"}`;
  let raw = "";
  try {
    for await (const ev of streamProvider(provider, apiKey ?? undefined, { model, messages: [{ role: "user", text: prompt }], tools: [], maxTokens: 300 }, signal)) {
      if (ev.type === "text") raw += ev.delta;
    }
  } catch { return; } // verifier failed → don't touch a real answer
  const v = parseVerdict(raw);
  if (v && v.ok === false && v.fix?.trim() && !signal.aborted) {
    await emit({ type: "text_delta", text: `\n\n— Correction: ${v.fix.trim()}` });
  }
}

// Per-1M-token prices for the chosen model, from the models.dev catalog
// (cached ~24h). Unknown → zero, so cost just shows $0 rather than breaking.
async function modelCost(provider: any, model: string): Promise<{ input: number; output: number }> {
  try {
    const meta = await catalogModels(provider.catalogId);
    const c = meta[model]?.cost;
    if (c) return { input: c.input ?? 0, output: c.output ?? 0 };
  } catch { /* offline / no catalog */ }
  return { input: 0, output: 0 };
}

// Drive one chat turn through our own provider-agnostic loop (replaces the
// Claude Agent SDK's query()). We own the message list, tool dispatch, and the
// mapping from the normalized ProviderEvent stream to our SSE frames.
export async function runAgent(req: ChatRequest, emit: Emit, signal?: AbortSignal): Promise<void> {
  // No slug → master mode (search across all products). A slug that doesn't
  // resolve is still an error (stale link / typo).
  const product = (req.productSlug ? getProductBySlug(req.productSlug) : null) ?? null;
  if (req.productSlug && !product) { await emit({ type: "error", message: `Unknown product "${req.productSlug}"` }); return; }

  // Tear down the turn when the user presses Stop (or navigates away): the web
  // proxy forwards its request abort signal all the way here.
  const ac = new AbortController();
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener("abort", () => ac.abort(), { once: true });
  }

  const manuals = product ? getManualsByProduct(product.id) : [];
  const { provider, model, apiKey, effort } = resolveChat();
  if (!model) { await emit({ type: "error", message: "No model selected. Open Settings → Models and pick a model." }); return; }
  if (!apiKey && !provider.keyless) {
    await emit({ type: "error", message: `No API key for ${provider.name}. Add one in Settings → Models.` });
    return;
  }

  // Background BUILD subagents the main agent delegates to (delegate_build). They
  // run concurrently — the main agent keeps answering while they compose surfaces
  // — and the turn stays open until they finish (awaited before `done`).
  const pendingBuilds: Promise<void>[] = [];
  const spawnBuild = (brief: string, key?: string) => {
    const ctxMsgs = req.messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    pendingBuilds.push(runBuildSubagent({ brief, key, product, manuals, context: ctxMsgs, emit, signal: ac.signal }));
  };

  const tools = buildTaktTools({ product, manuals, emit, chatId: req.chatId, spawnBuild, context: "main" });
  const toolDefs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

  // Proper role-alternating history (like live mode) — NOT one flattened user
  // blob. The model must see its own prior replies as real assistant turns, or
  // it has no sense of "I already said/offered this" and repeats itself.
  const messages: Message[] = [
    { role: "system", text: buildSystemPrompt(product, manuals) },
    ...req.messages.map((m) => ({ role: m.role, text: m.text })),
  ];
  // Attach any user images to the last user turn (where the photo belongs).
  if (req.attachments?.length) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) lastUser.images = req.attachments.map((a) => ({ data: a.data, mime: a.mediaType }));
  }

  const cost = await modelCost(provider, model);

  // For the narrow post-answer fact-check: what the agent actually retrieved this
  // turn (tool outputs), and the final spoken answer text.
  const retrieved: string[] = [];
  let finalAnswer = "";

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (ac.signal.aborted) return;
      const turn = await collectTurn(
        streamProvider(provider, apiKey ?? undefined, { model, messages, tools: toolDefs, effort, maxTokens: 8192 }, ac.signal),
        emit,
      );
      messages.push({
        role: "assistant",
        text: turn.text,
        reasoning: turn.reasoning || undefined,
        reasoningSignature: turn.reasoningSignature,
        toolCalls: turn.toolCalls.length ? turn.toolCalls : undefined,
      });
      await emit({
        type: "usage",
        contextTokens: turn.usage.input,
        outputTokens: turn.usage.output,
        costUsd: (turn.usage.input * cost.input + turn.usage.output * cost.output) / 1_000_000,
      });
      if (!turn.toolCalls.length) { finalAnswer = turn.text; break; } // no tools → done

      for (const tc of turn.toolCalls) {
        if (ac.signal.aborted) return;
        const tool = tools.find((t) => t.name === tc.name);
        if (!tool) {
          messages.push({ role: "tool", callId: tc.id, name: tc.name, result: `Unknown tool "${tc.name}".`, isError: true });
          continue;
        }
        let res;
        try { res = await tool.execute(safeParseArgs(tc.arguments)); }
        catch (e: any) { res = { output: `Error: ${String(e?.message ?? e)}`, isError: true as const }; }
        messages.push({
          role: "tool", callId: tc.id, name: tc.name,
          result: res.output, images: res.images, isError: res.isError,
        });
        if (!res.isError && res.output) retrieved.push(String(res.output));
      }
    }
    // Narrow, cheap fact-check of a conditional numeric spec against what was
    // actually retrieved — before we close the turn (see verifyConditionalSpec).
    await verifyConditionalSpec(finalAnswer, retrieved, emit, ac.signal);
    // Keep the stream open until any delegated builds finish landing on the stage.
    if (pendingBuilds.length) await Promise.allSettled(pendingBuilds);
    await emit({ type: "done" });
  } catch (err: any) {
    // User pressed Stop — not an error. The partial turn is persisted upstream.
    if (ac.signal.aborted || err?.name === "AbortError") return;
    const raw = String(err?.message ?? err);
    // Turn an opaque auth failure into an actionable, provider-named message.
    const msg = /invalid api key|authentication|401|403|unauthor|x-api-key|forbidden/i.test(raw)
      ? `${provider.name} rejected the API key. Open Settings → Models and paste a valid key.`
      : raw;
    await emit({ type: "error", message: msg });
  }
}

// Tool args arrive as a streamed JSON string; tolerate an empty/blank one.
function safeParseArgs(s: string): any {
  const t = (s ?? "").trim();
  if (!t) return {};
  try { return JSON.parse(t); } catch { return {}; }
}

// ── self-check: `tsx src/agent.ts` ──────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  a(hasConditionalSpec("115A on 240V"), "detects an amperage/voltage spec");
  a(hasConditionalSpec("the duty cycle is 25%"), "detects a percentage spec");
  a(!hasConditionalSpec("turn the tension knob clockwise"), "ignores a non-numeric answer");
  a(parseVerdict('{"ok":false,"fix":"115 A on 240 V"}')?.ok === false, "parses a not-ok verdict");
  a(parseVerdict('sure — {"ok":true} done')?.ok === true, "parses ok verdict amid prose");
  a(parseVerdict("garbage") === null, "returns null on non-JSON");
  console.log("agent verify self-check ok");
}
