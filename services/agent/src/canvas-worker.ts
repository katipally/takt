import { streamProvider, type Message } from "@takt/harness";
import { decodeStreamingHtml, type Product, type SseEvent } from "@takt/shared";
import { collectTurn, type Emit } from "./turn.js";
import { safeParseArgs } from "./turn-loop.js";
import { resolveBuild } from "./providers.js";
import { moduleIndex, readDesign } from "./design-catalog.js";
import { lintCanvas, p0, lintFeedback } from "./lint-canvas.js";

const MAX_STEPS = 4;

// The ONE canvas composer, used by BOTH text chat (build_canvas/edit_canvas) and
// live voice (fire-and-forget). It runs a clean-context BUILD model that loads the
// design modules it needs (read_design) then streams ONE `create_canvas({html})`
// page in live (canvas_delta), sanitizes + lints it, and emits canvas_end.

// Slim base prompt — the bulk lives in the on-demand design catalog so the system
// prompt stays lean and the catalog can grow without bloating every call.
function canvasSystemPrompt(): string {
  return `You are Takt's canvas composer for AI TECHNICAL SUPPORT. Compose ONE self-contained HTML page (no <html>/<head>/<body>) that answers the brief, then call create_canvas exactly once. You never write prose to the user.

STREAM IN ORDER: any <style> first → the HTML → any <script> LAST. The design system (fonts, colors, .takt-* classes, the page grid) is ALREADY loaded — use its classes + \`var(--takt-*)\` tokens; never redeclare colors/fonts. Do NOT wrap your output in a \`.takt-page\` div — that wrapper is already applied; emit the blocks directly. LOOK: clean, editorial, precise, technical; make full use of the canvas WITH breathable space; NO gradients, drop shadows, blur, emoji, or marketing filler; headlines are light-weight serif.

SHOW, don't tell — pull at least one real manual figure / 3D part / video / diagram to carry the answer (use ONLY real /assets URLs a tool returned this turn; never invent one). Give each top-level block a stable \`data-takt-id\`.

DESIGN MODULES — before composing, call read_design ONCE with the 2–4 modules that fit THIS answer (ALWAYS include \`workflows\` for a product-support answer — it names the right format), then build from what it returns:
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

const CREATE_CANVAS_TOOL = {
  name: "create_canvas",
  description: "Emit the finished canvas: ONE self-contained HTML fragment (no <html>/<head>/<body>) that fills the page. Stream style first, then the HTML, then any <script> last. Call it exactly once when the page is ready.",
  parameters: {
    type: "object",
    properties: {
      html: { type: "string", description: "The full HTML fragment for the page." },
      title: { type: "string", description: "A short title for this canvas." },
    },
    required: ["html"],
  },
};

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
  return html
    .replace(/<(takt-figure|takt-model|takt-video)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => (badSrc(m) ? "" : m))
    .replace(/<(?:takt-figure|takt-model|takt-video|img)\b[^>]*?\/?>/gi, (m) => (badSrc(m) ? "" : m))
    .replace(/\son\w+=("[^"]*"|'[^']*'|[^\s>]+)/gi, "") // inline event handlers
    .replace(/javascript:/gi, "");
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
    return `You are EDITING an existing canvas page. Return the FULL updated page, keeping everything you don't change byte-identical and reusing the exact same /assets URLs — never invent one. Preserve every block's \`data-takt-id\`.

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
    ? `\nHERO MANDATE: open the page with \`<div class="takt-grid takt-split" data-takt-id="hero">\` whose media child is <takt-${o.hero.tag} src="${o.hero.url}" caption="…"> paired with the eyebrow + serif <h1> + .takt-lead. Do NOT bury this visual lower down.\n`
    : "";
  return `QUESTION: ${o.question ?? o.brief}
BRIEF: ${o.brief}
${heroMandate}

GATHERED MEDIA — embed these EXACT URLs (never invent one): as <takt-figure src="…"> for a manual figure/image, <takt-model src="…"> for a 3D part, <takt-video src="…"> for a clip. Any images shown to you below carry a faint 0–1 coordinate grid FOR YOUR REFERENCE (the user sees them clean) — read feature x,y off that grid for annotations:
${o.mediaHints || figs}

GATHERED FACTS (ground truth — cite manual pages with <takt-cite page="N">, never invent a number):
${o.facts || "(none — build from the brief)"}

Give EACH top-level block a stable \`data-takt-id\` (e.g. "lead", "step-1", "safety", "specs") so the user can select and edit it later. Compose the page with the layout archetype that fits, then call create_canvas ONCE.`;
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

  let emitted = false;
  let rejectedOnce = false;
  try {
    for (let step = 0; step < MAX_STEPS && !emitted && !o.signal.aborted; step++) {
      let lastLen = 0;
      // Stream the html arg → decoded HTML → throttled canvas_delta (full-so-far).
      const onArgDelta: (name: string, args: string) => Promise<void> = async (name, args) => {
        if (name !== "create_canvas") return;
        const html = decodeStreamingHtml(args);
        if (html.length - lastLen < 120) return;
        lastLen = html.length;
        await o.emit({ type: "canvas_delta", canvasId: o.canvasId, html });
      };
      // PLAN THEN PAINT. A brief think lets the model compose a real spread (which
      // archetype, what fills each row) instead of dumping generic blocks — the fix
      // for "artifacts feel generic". "low" keeps the pause short so the page still
      // visibly PAINTS itself token-by-token once create_canvas starts streaming.
      // (reasoningEffort → OpenAI; effort stays off so Anthropic/MiniMax send no
      // thinking params either.)
      void effort;
      const turn = await collectTurn(
        streamProvider(provider, apiKey ?? undefined, { model, messages, tools: [READ_DESIGN_TOOL, CREATE_CANVAS_TOOL], reasoningEffort: "low", maxTokens: 16000 }, o.signal),
        // swallow the worker's prose/reasoning — only the canvas reaches the user
        (e: SseEvent) => { if (e.type !== "text_delta" && e.type !== "reasoning_delta") return o.emit(e); },
        onArgDelta,
      );
      messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls.length ? turn.toolCalls : undefined });
      const call = turn.toolCalls.find((t) => t.name === "create_canvas");
      if (!call) {
        // read_design → hand back the modules and let it compose next turn.
        const designCalls = turn.toolCalls.filter((t) => t.name === "read_design");
        if (designCalls.length) {
          for (const dc of designCalls) {
            const mods = safeParseArgs(dc.arguments).modules;
            messages.push({ role: "tool", callId: dc.id, name: "read_design", result: readDesign(Array.isArray(mods) ? mods.map(String) : []) });
          }
          continue;
        }
        // wrote prose instead of a tool call — nudge once, else stop
        if (step < 2) { messages.push({ role: "user", text: "Call read_design for the modules you need, then create_canvas with the finished page." }); continue; }
        break;
      }
      const rawHtml = String(safeParseArgs(call.arguments).html ?? "");
      const clean = sanitizeCanvasHtml(rawHtml, allowed);
      // A page must carry real content — text or a visual element. An empty or
      // markup-only `html` (a common failure with some models) must NEVER be
      // reported as a built canvas, or the user is told "it's on the canvas"
      // while the stage sits blank.
      const hasContent = clean.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, "").trim().length > 10
        || /<(takt-|img|svg|table|input|button)/i.test(clean);
      const findings = p0(lintCanvas(clean));
      if ((findings.length || !hasContent) && !rejectedOnce) {
        rejectedOnce = true;
        const feedback = !hasContent
          ? "create_canvas received empty or content-less HTML. Put the COMPLETE page — a <style> then the visible HTML (headings, text, and at least one figure/3D/table) — in the `html` argument, then call create_canvas once."
          : lintFeedback(findings);
        messages.push({ role: "tool", callId: call.id, name: "create_canvas", result: feedback, isError: true });
        continue;
      }
      if (!hasContent) break; // second empty attempt → give up (emitted stays false)
      await o.emit({ type: "canvas_end", canvasId: o.canvasId, html: clean, title: o.title });
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
