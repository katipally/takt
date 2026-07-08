import { streamProvider, catalogModels, type Message } from "@takt/harness";
import type { ChatRequest } from "@takt/shared";
import { getProductBySlug, getManualsByProduct, listMessages } from "@takt/db";
import { buildTaktTools, type Emit } from "./tools.js";
import { collectTurn } from "./turn.js";
import { buildSystemPrompt, DESIGN_GUIDE, UI_SHAPE } from "./prompt.js";
import { resolveChat, resolveLive, resolveBuild } from "./providers.js";

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
  const { provider, model, apiKey } = resolveChat();
  if (!model) { await emit({ type: "error", message: "No model selected. Open Settings → Models and pick a model." }); return; }
  if (!apiKey && !provider.keyless) {
    await emit({ type: "error", message: `No API key for ${provider.name}. Add one in Settings → Models.` });
    return;
  }

  // ARTIFACT-FIRST, split models. The main agent GATHERS on the (cheap, fast) chat
  // model, then hands off to a COMPOSE model that writes the Page and streams it.
  // The compose model is Settings → Build model (resolveBuild), which falls back to
  // the chat model when unset — so leaving it blank = one model does both, and
  // setting a stronger one = cheap gather + strong compose. Track /assets URLs so
  // compose's emit_ui allow-list can strip invented (404-ing) media.
  const allowedAssets = new Set<string>();

  // Role-alternating history (like live) — the model sees its own prior replies as
  // real turns, so it doesn't repeat itself.
  const messages: Message[] = [
    { role: "system", text: buildSystemPrompt(product, manuals) },
    ...req.messages.map((m) => ({ role: m.role, text: m.text })),
  ];
  // Attach any user images to the last user turn (where the photo belongs).
  if (req.attachments?.length) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) lastUser.images = req.attachments.map((a) => ({ data: a.data, mime: a.mediaType }));
  }

  // COMPOSE: a (possibly stronger) model writes the artifact from the material the
  // gather loop already pulled. It's seeded with the full turn so far and restricted
  // to emit_ui — it never re-gathers, so there's no second gather gap.
  const build = resolveBuild();
  const composeTools = buildTaktTools({ product, manuals, emit, chatId: req.chatId, context: "build", allowedAssets })
    .filter((t) => t.name === "emit_ui");
  const composeDefs = composeTools.map(({ name, description, parameters }) => ({ name, description, parameters }));
  // Gridded crop images the gather step SAW — handed to the compose model so it can
  // read feature positions for accurate annotations (Phase 3 vision).
  const gatheredImages: { data: string; mime: string }[] = [];
  // Did an artifact actually land on the canvas this turn? If the agent gathered but
  // never composed (deliberation spiral / ran out of steps), we auto-build one after
  // the loop so a substantive answer ALWAYS produces an artifact (Takt's whole job).
  let composedThisTurn = false;
  // The lineage key start_canvas minted this turn (title shell on the canvas).
  // build_canvas defaults to it so the streamed page REPLACES the shell in place
  // instead of spawning a second artifact.
  let turnCanvasKey: string | undefined;

  // Shared compose runner: ONE focused, CLEAN-context call to the compose model that
  // ends in exactly one emit_ui. We do NOT replay the gather transcript (another
  // model's tool-calls + reasoning signatures make it flaky/slow); we hand a tight
  // brief instead. Low reasoning effort so it streams out fast instead of thinking
  // for minutes. Used for a fresh build AND a surgical edit.
  async function runCompose(userText: string, opts: { key?: string; images?: { data: string; mime: string }[] } = {}): Promise<boolean> {
    if (ac.signal.aborted || !build.model) return false;
    const sys = `You are Takt's BUILD worker. Compose ONE designed PAGE artifact, then stop. You never write prose to the user — you emit a surface.\n${DESIGN_GUIDE}\n${UI_SHAPE}`;
    const user: Message = { role: "user", text: userText };
    if (opts.images?.length) user.images = opts.images.slice(-4);
    const cm: Message[] = [{ role: "system", text: sys }, user];
    await emit({ type: "status", text: "Designing the artifact…" });
    let emitted = false;
    try {
      for (let s = 0; s < 3 && !ac.signal.aborted && !emitted; s++) {
        // No reasoning on compose: thinking here is a pre-write PAUSE — the user
        // stares at the skeleton while the model deliberates, then the page dumps.
        // Dropping it makes the emit_ui args start streaming immediately, so the
        // page visibly builds token-by-token. ponytail: compose follows the design
        // guide + gathered brief; re-add an effort here only if page quality drops.
        const t = await collectTurn(
          streamProvider(build.provider, build.apiKey ?? undefined, { model: build.model, messages: cm, tools: composeDefs, maxTokens: 16000 }, ac.signal),
          emit,
        );
        cm.push({ role: "assistant", text: t.text, toolCalls: t.toolCalls.length ? t.toolCalls : undefined });
        if (!t.toolCalls.length) break;
        for (const tc of t.toolCalls) {
          const tool = composeTools.find((x) => x.name === tc.name);
          if (!tool) { cm.push({ role: "tool", callId: tc.id, name: tc.name, result: "Only emit_ui is available here — compose the Page now.", isError: true }); continue; }
          let res; try { res = await tool.execute(safeParseArgs(tc.arguments)); } catch (e: any) { res = { output: `Error: ${String(e?.message ?? e)}`, isError: true as const }; }
          cm.push({ role: "tool", callId: tc.id, name: tc.name, result: res.output, images: res.images, isError: res.isError });
          if (!res.isError) emitted = true;
        }
      }
    } catch (e) { await emit({ type: "status", text: null }); throw e; }
    await emit({ type: "status", text: null });
    if (emitted) composedThisTurn = true;
    return emitted;
  }

  // BUILD a fresh artifact from the material the gather loop just pulled.
  async function composeCanvas(brief: string, key?: string): Promise<boolean> {
    const useKey = key ?? turnCanvasKey; // fill the start_canvas shell if the model omitted the key
    const question = [...req.messages].reverse().find((m) => m.role === "user")?.text ?? brief;
    const figures = [...allowedAssets].filter((u) => /\.(png|jpe?g|webp)$/i.test(u));
    const facts = retrieved.join("\n---\n").slice(0, 8000);
    const userText = `QUESTION: ${question}\nBRIEF: ${brief}\n\nGATHERED FIGURES — embed these EXACT URLs in <takt-figure src="…"> (never invent a URL; the design system crops them into paper cards). Any images shown to you below carry a faint 0–1 coordinate grid FOR YOUR REFERENCE (the user sees them clean) — read feature x,y off that grid if you add annotations:\n${figures.length ? figures.map((u) => `- ${u}`).join("\n") : "(none gathered — use an inline <svg> or text only, no <img>)"}\n\nGATHERED FACTS (ground truth — cite manual pages with <takt-cite page="N">, never invent a number):\n${facts || "(none — build from the brief)"}\n\nGive EACH top-level block a stable \`data-takt-id\` (e.g. data-takt-id="lead", "step-1", "safety", "specs") so the user can select and edit it later. Call emit_ui EXACTLY ONCE: root a single \`Page\` node${useKey ? ` with key "${useKey}"` : ""}, picking the layout archetype that fits so it fills the canvas. Do NOT call any other tool.`;
    return runCompose(userText, { key: useKey, images: gatheredImages });
  }

  // SURGICAL EDIT — recompose from the CURRENT page HTML (no re-gather), changing
  // only what the brief asks (optionally just one data-takt-id block).
  async function editCanvas(brief: string, key?: string, target?: string): Promise<boolean> {
    const cur = currentSurface(req.chatId);
    if (!cur) return false;
    const useKey = key || cur.key;
    const userText = `You are EDITING an existing canvas page. Return the FULL updated page via emit_ui with key "${useKey}", keeping everything you don't change byte-identical and reusing the exact same /assets URLs — never invent one. Preserve every block's \`data-takt-id\`.\n\nEDIT INSTRUCTION: ${brief}\n${target ? `Change ONLY the block with data-takt-id="${target}"; leave every other block exactly as-is.` : "Apply the change where it belongs; leave unrelated blocks as-is."}\n\nCURRENT PAGE HTML:\n${cur.html}`;
    return runCompose(userText, { key: useKey });
  }

  const tools = buildTaktTools({ product, manuals, emit, chatId: req.chatId, context: "main", allowedAssets, compose: composeCanvas, edit: editCanvas, onCanvasKey: (k) => { turnCanvasKey = k; } });
  const toolDefs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

  const cost = await modelCost(provider, model);

  // For the narrow post-answer fact-check: what the agent actually retrieved this
  // turn (tool outputs), and the final spoken answer text.
  const retrieved: string[] = [];
  let finalAnswer = "";

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (ac.signal.aborted) return;
      // No reasoning on the GATHER loop — it only picks the next tool (grep,
      // find_entity, crop), which doesn't need extended thinking, and thinking
      // fires on EVERY step (up to MAX_STEPS) → the loop's main latency sink.
      // Reasoning stays where it earns its keep: compose owns the answer's quality.
      // ponytail: thinking off for gather; re-add an `effort` here only if tool
      // selection measurably degrades.
      const turn = await collectTurn(
        streamProvider(provider, apiKey ?? undefined, { model, messages, tools: toolDefs, maxTokens: 8192 }, ac.signal),
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

      // PARALLEL WORK. Retrieval tools are independent reads → run them all at once
      // instead of one-at-a-time. Canvas-building tools (build_canvas/edit_canvas)
      // and ask_user run AFTER, in order: build consumes what was just gathered and
      // two builds must not race. So a turn's gather fans out, then the build lands.
      const runOne = async (tc: (typeof turn.toolCalls)[number]) => {
        const tool = tools.find((t) => t.name === tc.name);
        if (!tool) return { tc, res: { output: `Unknown tool "${tc.name}".`, isError: true as const } };
        try { return { tc, res: await tool.execute(safeParseArgs(tc.arguments)) }; }
        catch (e: any) { return { tc, res: { output: `Error: ${String(e?.message ?? e)}`, isError: true as const } }; }
      };
      const deferLast = (n: string) => n === "build_canvas" || n === "edit_canvas" || n === "ask_user";
      // Register a result's side effects (asset allow-list, vision crops, facts) —
      // gather results MUST be recorded before a same-turn build composes.
      const record = (res: { output?: string; images?: { data: string; mime: string }[]; isError?: boolean }) => {
        if (res.isError) return;
        for (const m of (res.output || "").matchAll(/\/assets\/[^\s"'?)]+/g)) allowedAssets.add(m[0]);
        if (res.images?.length && gatheredImages.length < 4) gatheredImages.push(...res.images);
        if (res.output) retrieved.push(String(res.output));
      };
      const gathered = await Promise.all(turn.toolCalls.filter((t) => !deferLast(t.name)).map(runOne));
      for (const { res } of gathered) record(res);
      const built: Awaited<ReturnType<typeof runOne>>[] = [];
      for (const tc of turn.toolCalls.filter((t) => deferLast(t.name))) {
        if (ac.signal.aborted) return;
        const r = await runOne(tc); record(r.res); built.push(r);
      }
      // Push tool results in the original call order (each keyed by its callId).
      const byId = new Map([...gathered, ...built].map(({ tc, res }) => [tc.id, res]));
      for (const tc of turn.toolCalls) {
        const res = byId.get(tc.id)!;
        messages.push({ role: "tool", callId: tc.id, name: tc.name, result: res.output, images: res.images, isError: res.isError });
      }
    }
    // GUARANTEED ARTIFACT: if the agent gathered real material but never composed a
    // canvas this turn (it deliberated too long, ran out of steps, or answered in
    // chat when it shouldn't have), auto-build one now from what it gathered. Takt's
    // job is the artifact — a substantive turn must never end with an empty canvas.
    // Skipped for pure chat (no gathering) and when the user aborted.
    if (!composedThisTurn && !ac.signal.aborted && retrieved.length > 0) {
      const q = [...req.messages].reverse().find((m) => m.role === "user")?.text ?? "";
      if (q) { try { await composeCanvas(`Answer this on the canvas as a designed page from the gathered facts and figures: ${q}`); } catch { /* non-fatal */ } }
    }
    // Narrow, cheap fact-check of a conditional numeric spec against what was
    // actually retrieved — before we close the turn (see verifyConditionalSpec).
    await verifyConditionalSpec(finalAnswer, retrieved, emit, ac.signal);
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

// The latest Page surface on the canvas for this chat — its lineage key + raw HTML,
// read from stored messages. Used by editCanvas to recompose from what's there now
// instead of re-gathering. Returns null if the canvas is empty.
function currentSurface(chatId?: string): { key: string; html: string } | null {
  if (!chatId) return null;
  try {
    const msgs = listMessages(chatId);
    for (let i = msgs.length - 1; i >= 0; i--) {
      const blocks = msgs[i]!.content as any[];
      for (let j = blocks.length - 1; j >= 0; j--) {
        const s = blocks[j]?.type === "ui" ? blocks[j].surface : null;
        if (!s) continue;
        const page = (s.nodes ?? []).find((n: any) => n.id === s.root && n.type === "Page");
        if (page?.props?.html) return { key: String(s.key ?? s.title ?? s.id ?? "answer"), html: String(page.props.html) };
      }
    }
  } catch { /* db read best-effort */ }
  return null;
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
