import { streamProvider, type Message } from "@takt/harness";
import { decodeStreamingHtml, type Product, type SseEvent } from "@takt/shared";
import { collectTurn, type Emit } from "./turn.js";
import { safeParseArgs } from "./turn-loop.js";
import { resolveBuild } from "./providers.js";
import { CANVAS_GUIDE } from "./prompt.js";
import { lintCanvas, p0, lintFeedback } from "./lint-canvas.js";

const MAX_STEPS = 3;

// The ONE canvas composer, used by BOTH text chat (build_canvas/edit_canvas) and
// live voice (fire-and-forget). It runs a clean-context BUILD model with a single
// `create_canvas({html})` tool, streams the HTML page in live (canvas_delta), then
// sanitizes + lints it and emits the authoritative canvas_end. Replaces the old
// compose lane (agent.ts) AND the separate build subagent.

const CREATE_CANVAS_TOOL = {
  name: "create_canvas",
  description: "Emit the finished canvas: ONE self-contained HTML fragment (no <html>/<head>/<body>) that fills the page. Stream style first, then the HTML, then any <script> last. This is your only tool — call it exactly once when the page is ready.",
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
  return `QUESTION: ${o.question ?? o.brief}
BRIEF: ${o.brief}

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

  const sys = `You are Takt's canvas composer. Compose ONE designed HTML page that answers the brief, then call create_canvas exactly once. You never write prose to the user.
${CANVAS_GUIDE}`;
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
      const turn = await collectTurn(
        streamProvider(provider, apiKey ?? undefined, { model, messages, tools: [CREATE_CANVAS_TOOL], effort: o.mode === "build" ? effort : undefined, maxTokens: 16000 }, o.signal),
        // swallow the worker's prose/reasoning — only the canvas reaches the user
        (e: SseEvent) => { if (e.type !== "text_delta" && e.type !== "reasoning_delta") return o.emit(e); },
        onArgDelta,
      );
      messages.push({ role: "assistant", text: turn.text, toolCalls: turn.toolCalls.length ? turn.toolCalls : undefined });
      const call = turn.toolCalls.find((t) => t.name === "create_canvas");
      if (!call) {
        // model wrote prose instead of calling the tool — nudge once, else stop
        if (step === 0) { messages.push({ role: "user", text: "Call create_canvas now with the finished HTML page." }); continue; }
        break;
      }
      const rawHtml = String(safeParseArgs(call.arguments).html ?? "");
      const clean = sanitizeCanvasHtml(rawHtml, allowed);
      const findings = p0(lintCanvas(clean));
      if (findings.length && !rejectedOnce) {
        rejectedOnce = true;
        messages.push({ role: "tool", callId: call.id, name: "create_canvas", result: lintFeedback(findings), isError: true });
        continue;
      }
      await o.emit({ type: "canvas_end", canvasId: o.canvasId, html: clean, title: o.title });
      emitted = true;
    }
  } catch (e: any) {
    if (o.signal.aborted || e?.name === "AbortError") return emitted;
    // non-fatal: the caller already answered in chat
  }
  return emitted;
}
