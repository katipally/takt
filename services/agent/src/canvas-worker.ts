import { streamProvider, type Message } from "@takt/harness";
import { extractCanvas, extractCanvasStream, type Product, type SseEvent } from "@takt/shared";
import { collectTurn, type Emit } from "./turn.js";
import { safeParseArgs } from "./turn-loop.js";
import { resolveBuild } from "./providers.js";
import { moduleIndex, readDesign } from "./design-catalog.js";
import { lintCanvas, p0, lintFeedback } from "./lint-canvas.js";
import { checkSpecValues, specFeedback } from "./spec-check.js";
import { CRAFT_CORE, TEMPLATES } from "./design-standard.js";

const MAX_STEPS = 4;
// Extra rounds allowed to finish a page the token cap cut mid-stream.
const MAX_CONTINUE = 2;

// The ONE canvas composer, used by BOTH text chat (build_canvas/edit_canvas) and
// live voice (fire-and-forget). It runs a clean-context BUILD model that loads the
// design modules it needs (read_design), writes a short token PLAN as prose, then
// streams the page as PLAIN TEXT between <takt:canvas> markers — no JSON escaping,
// so any model can emit it, and a max_tokens truncation is just an unclosed marker
// we ask the model to continue. Design quality lives UPSTREAM (plan, blessed
// skeletons, craft law, lint) — no post-render layout verify; that's Claude's
// trade. FACTS are different: after the page arrives we run a deterministic
// number+unit check against the gathered facts (spec-check.ts) — one repair
// round on a mismatch, and the result ships on canvas_end as `specCheck`.

function canvasSystemPrompt(): string {
  return `You are Takt's canvas composer and DESIGN LEAD for AI TECHNICAL SUPPORT. For each answer you design ONE self-contained HTML page (no <html>/<head>/<body>). You never write prose to the user — your text output is consumed by the pipeline.

OUTPUT CONTRACT — one response, two parts, in order:
1. PLAN (plain text, ≤6 short lines): Skeleton: <explainer|step-guide|troubleshooter|calculator|spec-compare|freeform>. Color: 4–6 named hex (accent from the subject's world). Type: display + body roles. Layout: 1–2 sentences. Derive every decision in the page from this plan.
2. THE PAGE between markers, nothing after the closing one, never inside code fences:
<takt:canvas title="Short title">
<style>.takt-page{--takt-accent:…}</style>  ← identity FIRST, from your plan
…the HTML, structure from the skeleton…
<script>…</script>                          ← any script LAST
</takt:canvas>
If your output is ever cut off, you will be asked to continue — resume EXACTLY where you stopped, no repetition.

DESIGN THE IDENTITY FIRST — a Prusa printer, a filament spec, and a wiring fault should NOT look identical. The identity <style> sets palette + type for THIS subject on .takt-page (plus a .dark .takt-page override if an accent needs it); the whole page inherits those tokens. Then compose the STRUCTURE from the blessed skeleton with the reliable classes (.takt-grid/.takt-split/.takt-cols-*, .takt-card/.takt-panel/.takt-callout/.takt-stat/.takt-chips, <table>, the islands) — the page grid already routes prose to a readable column and breaks grids/tables/figures wider. Do NOT wrap your output in a .takt-page div — that wrapper is already applied. No blur or marketing filler; gradients/shadows only if the subject genuinely calls for it; no emoji as decoration.

SHOW, don't tell — lead with a real manual figure / 3D part / video / diagram (use ONLY real /assets URLs given this turn; never invent one; compose it IN, don't drop it in a box). Give each top-level block a stable data-takt-id.

${TEMPLATES}

${CRAFT_CORE}

DESIGN MODULES — before your plan, call read_design ONCE with the 2–4 modules that fit THIS answer (ALWAYS include \`workflows\` for a product-support answer — it names the right format), then build from what it returns:
${moduleIndex()}
e.g. a diagnosis ("why won't it feed") → [workflows, layout, mermaid, figures]; "show me the part" → [workflows, figures, components]; a spec/product card → [workflows, components, chart]; "which one should I use" / a sizing question → [workflows, interactive, components].`;
}

const READ_DESIGN_TOOL = {
  name: "read_design",
  description: "Load the design modules you need before composing the canvas. Call this ONCE with the 2–4 module names that fit this answer; it returns their guidance + component snippets.",
  parameters: {
    type: "object",
    properties: { modules: { type: "array", items: { type: "string" }, description: "Module names from the list, e.g. [\"layout\",\"figures\",\"chart\"]" } },
    required: ["modules"],
  },
};

const CONTINUE_MSG = "Your output hit the token limit mid-page. Continue EXACTLY where you stopped — output ONLY the remaining HTML (no preamble, repeat nothing already sent) and finish with </takt:canvas>.";

// Strip media whose /assets src wasn't gathered this turn (invented → 404), and
// neutralize obvious injection vectors. The client re-sanitizes with DOMPurify
// and runs scripts only after this authoritative page arrives.
function sanitizeCanvasHtml(html: string, allowed: Set<string>): string {
  const assetPath = (s: string) => s.match(/\/assets\/[^"'?\s)]+/)?.[0] ?? null;
  const badSrc = (tag: string) => {
    const s = tag.match(/src=["']([^"']+)["']/i)?.[1];
    const p = s ? assetPath(s) : null;
    return p ? !allowed.has(p) : false; // only judge /assets srcs; leave data:/others
  };
  // Split out scripts first so text-level fixes never touch code.
  const parts = html.split(/(<script[\s\S]*?<\/script>)/gi);
  const fixed = parts.map((p, i) => {
    if (i % 2 === 1) return p; // a <script> block — leave verbatim
    return p
      .replace(/<(takt-figure|takt-model|takt-video)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => (badSrc(m) ? "" : m))
      .replace(/<(?:takt-figure|takt-model|takt-video|img)\b[^>]*?\/?>/gi, (m) => (badSrc(m) ? "" : m))
      .replace(/\son\w+=("[^"]*"|'[^']*'|[^\s>]+)/gi, "") // inline event handlers
      .replace(/javascript:/gi, "")
      // "…<strong>PLA sheet advice</strong>Use a clean…" — a missing space after an
      // inline-emphasis close is a recurring weak-model tell; fix it deterministically.
      .replace(/<\/(strong|b|em)>(?=[A-Za-z0-9(])/gi, "</$1> ");
  });
  return fixed.join("");
}

export interface CanvasWorkerOpts {
  mode: "build" | "edit";
  canvasId: string;
  title?: string;
  brief: string;
  /** build: the user's question + gathered material */
  question?: string;
  facts?: string;
  mediaHints?: string;
  figures?: string[]; // real /assets URLs the page may embed
  hero?: { url: string; tag: "model" | "figure" | "video" }; // deterministic hero the page MUST lead with
  /** edit: the current page + optional single-block target */
  currentHtml?: string;
  target?: string;
  images?: { data: string; mime: string }[]; // gridded crops the worker can SEE
  frame?: { url: string; image: { data: string; mime: string } };
  product: Product | null;
  emit: Emit;
  signal: AbortSignal;
}

function buildUserMessage(o: CanvasWorkerOpts): string {
  if (o.mode === "edit") {
    return `You are EDITING an existing canvas page. Return the FULL updated page between <takt:canvas> markers, keeping everything you don't change byte-identical and reusing the exact same /assets URLs — never invent one. Preserve every block's \`data-takt-id\`.

EDIT INSTRUCTION: ${o.brief}
${o.target ? `Change ONLY the block with data-takt-id="${o.target}"; leave every other block exactly as-is.` : "Apply the change where it belongs; leave unrelated blocks as-is."}

CURRENT PAGE HTML:
${o.currentHtml ?? ""}`;
  }
  const figs = o.figures?.length
    ? o.figures.map((u) => `- ${u}`).join("\n")
    : "(none gathered — use an inline <svg> or text only, no <img>)";
  // Deterministic hero: the gather step already chose the strongest visual (a 3D
  // part beats a crop beats a photo). The worker MUST lead with it in the hero
  // pair — this is what makes the opening consistent instead of model-roulette.
  const heroMandate = o.hero
    ? `\nHERO: open the page leading with this key visual — <takt-${o.hero.tag} src="${o.hero.url}" caption="…"> — paired with the eyebrow + display <h1> + lead. DESIGN the opening composition to suit the subject (a two-column split, or a full-bleed lead figure with the title beside/over it via \`data-variant="lead"\`) — just don't bury the visual lower down or leave the hero a lonely headline. Keep the paired columns close in height.\n`
    : "";
  return `QUESTION: ${o.question ?? o.brief}
BRIEF: ${o.brief}
${heroMandate}

GATHERED MEDIA — embed these EXACT URLs (never invent one): as <takt-figure src="…"> for a manual figure/image, <takt-model src="…"> for a 3D part, <takt-video src="…"> for a clip. Any images shown to you below carry a faint 0–1 coordinate grid FOR YOUR REFERENCE (the user sees them clean) — read feature x,y off that grid for annotations:
${o.mediaHints || figs}

GATHERED FACTS (ground truth — cite manual pages with <takt-cite page="N">, never invent a number):
${o.facts || "(none — build from the brief)"}

Give EACH top-level block a stable \`data-takt-id\` (e.g. "lead", "step-1", "safety", "specs") so the user can select and edit it later. Call read_design, write your PLAN, then the page between <takt:canvas> markers.`;
}

/** Compose (or edit) the canvas. Returns true if a page was emitted. */
export async function runCanvasWorker(o: CanvasWorkerOpts): Promise<boolean> {
  const { provider, apiKey, model, effort } = resolveBuild();
  if (!model || o.signal.aborted) return false;

  const allowed = new Set<string>(o.figures ?? []);
  if (o.frame) { const p = o.frame.url.match(/\/assets\/[^"'?\s)]+/)?.[0]; if (p) allowed.add(p); }
  // In edit mode, every /assets URL already on the page is allowed (reused).
  if (o.currentHtml) for (const m of o.currentHtml.matchAll(/\/assets\/[^"'?\s)]+/g)) allowed.add(m[0]);

  const sys = canvasSystemPrompt();
  const user: Message = { role: "user", text: buildUserMessage(o) };
  const seed = o.images?.length ? o.images.slice(-4) : (o.frame ? [o.frame.image] : undefined);
  if (seed) user.images = seed;
  const messages: Message[] = [{ role: "system", text: sys }, user];

  await o.emit({ type: "canvas_start", canvasId: o.canvasId, title: o.title });

  // Text accumulated across a step's turns (incl. continuations). The stream
  // handler pulls the page out of it live and emits throttled canvas_delta.
  let soFar = "";
  let lastLen = 0;
  const workerEmit = async (e: SseEvent) => {
    if (e.type === "reasoning_delta") return; // never shown
    if (e.type === "text_delta") {
      soFar += e.text;
      const html = extractCanvasStream(soFar);
      if (html && html.length - lastLen >= 120) {
        lastLen = html.length;
        // Sanitize the partial too — the client paints deltas live now, so the
        // preview must carry the same guarantees as the final page.
        await o.emit({ type: "canvas_delta", canvasId: o.canvasId, html: sanitizeCanvasHtml(html, allowed) });
      }
      return;
    }
    return o.emit(e);
  };

  // Build reasoning: ON for providers whose reasoning is FAST (OpenAI Responses,
  // Anthropic) — it plans a stronger, well-formed spread. OFF for MiniMax, whose
  // adaptive thinking runs for minutes on a design-heavy prompt; its quality
  // comes from the plan step + blessed skeletons instead.
  const buildEffort = provider.id === "minimax" ? undefined : (effort ?? "medium");
  const stream = () => streamProvider(provider, apiKey ?? undefined, { model, messages, tools: [READ_DESIGN_TOOL], effort: buildEffort, maxTokens: 20000 }, o.signal);

  let emitted = false;
  let rejectedOnce = false;
  let specFixedOnce = false;
  try {
    for (let step = 0; step < MAX_STEPS && !emitted && !o.signal.aborted; step++) {
      soFar = ""; lastLen = 0;
      let turn = await collectTurn(stream(), workerEmit);
      messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls.length ? turn.toolCalls : undefined });

      // read_design → hand back the modules (always answer tool calls, or the
      // next request is rejected for a dangling tool_use).
      const designCalls = turn.toolCalls.filter((t) => t.name === "read_design");
      for (const dc of designCalls) {
        const mods = safeParseArgs(dc.arguments).modules;
        messages.push({ role: "tool", callId: dc.id, name: "read_design", result: readDesign(Array.isArray(mods) ? mods.map(String) : []) });
      }

      // Truncated mid-page? Ask it to continue, bounded. The continuation streams
      // into the same soFar, so the preview and the final extraction just work.
      for (let c = 0; c < MAX_CONTINUE; c++) {
        const b = extractCanvas(soFar);
        if (turn.stopReason !== "max_tokens" || !b || b.closed || o.signal.aborted) break;
        console.error(`[canvas] output truncated at ${soFar.length} chars → continuing (${c + 1}/${MAX_CONTINUE})`);
        messages.push({ role: "user", text: CONTINUE_MSG });
        turn = await collectTurn(stream(), workerEmit);
        messages.push({ role: "assistant", text: turn.text || "…" });
      }

      const block = extractCanvas(soFar);
      if (!block) {
        if (designCalls.length) continue; // modules loaded → compose next turn
        // wrote prose without the page — nudge once, else stop
        if (step < 2) { messages.push({ role: "user", text: "Output the page now: your short PLAN, then the full HTML between <takt:canvas title=\"…\"> and </takt:canvas>." }); continue; }
        break;
      }
      if (!block.closed) console.error("[canvas] page still unclosed after continuation budget — shipping what arrived (frame normalizes tags)");

      const clean = sanitizeCanvasHtml(block.html, allowed);
      // A page must carry real content — text or a visual element. An empty or
      // markup-only page (a common failure with some models) must NEVER be
      // reported as built, or the user is told "it's on the canvas" while the
      // stage sits blank.
      const hasContent = clean.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, "").trim().length > 10
        || /<(takt-|img|svg|table|input|button)/i.test(clean);
      const findings = p0(lintCanvas(clean));
      if ((findings.length || !hasContent) && !rejectedOnce) {
        rejectedOnce = true;
        const feedback = !hasContent
          ? "The canvas block was empty or content-less. Write the COMPLETE page — a <style> then the visible HTML (headings, text, and at least one figure/3D/table) — between the <takt:canvas> markers."
          : lintFeedback(findings);
        messages.push({ role: "user", text: feedback });
        continue;
      }
      if (!hasContent) break; // second empty attempt → give up (emitted stays false)
      // Deterministic fact-check: every number+unit on the page must exist in
      // the gathered facts. One repair round; then ship with the result attached
      // (the client shows it as a verified/unverified badge).
      const ground = o.mode === "build" ? `${o.facts ?? ""}\n${o.mediaHints ?? ""}` : "";
      const spec = ground.trim() ? checkSpecValues(clean, ground) : undefined;
      if (spec?.flagged.length && !specFixedOnce) {
        specFixedOnce = true;
        messages.push({ role: "user", text: specFeedback(spec) });
        continue;
      }
      await o.emit({
        type: "canvas_end", canvasId: o.canvasId, html: clean, title: block.title ?? o.title,
        specCheck: spec ? { checked: spec.checked, flagged: spec.flagged.length } : undefined,
      });
      emitted = true;
    }
  } catch (e: any) {
    if (o.signal.aborted || e?.name === "AbortError") return emitted;
    // Surface the failure instead of swallowing it — otherwise a broken build is
    // invisible and the stage sticks on the skeleton.
    if (!emitted) await o.emit({ type: "canvas_error", canvasId: o.canvasId, message: String(e?.message ?? e).slice(0, 200) });
  }
  // Never leave the client stuck on the build skeleton: if nothing usable was
  // emitted, tell it the build failed so it clears the skeleton and keeps the
  // chat answer.
  if (!emitted && !o.signal.aborted) {
    await o.emit({ type: "canvas_error", canvasId: o.canvasId, message: "The canvas build produced no usable page." });
  }
  return emitted;
}
