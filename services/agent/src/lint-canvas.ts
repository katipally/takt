// Anti-AI-slop linter for a streamed canvas (raw HTML). A cheap, grep-based check
// (no HTML parse) that hunts the tells making generated UI look generic/AI-made,
// plus walls-of-text. P0 findings are fed back to the canvas worker for ONE
// self-correction pass before the page is shown. The design system already owns
// colors/type, so the model should compose structure, not reinvent styling.

export type LintLevel = "P0" | "P1" | "P2";
export interface LintFinding { level: LintLevel; rule: string; message: string; }

// The known AI-default accent palette (Tailwind indigo/violet) — the single most
// common tell. The design system already owns the accent.
const SLOP_HEX = /#(6366f1|4f46e5|4338ca|818cf8|7c3aed|8b5cf6|a855f7|c084fc|6d28d9)\b/i;
const SLOP_COLOR_NAME = /\b(indigo|violet)\b/i;
// purple/indigo → blue/cyan "trust gradient". Length-capped so adjacent runs
// can't backtrack quadratically on model-controlled input.
const TRUST_GRADIENT = /linear-gradient[^;{}]{0,120}(#(6366f1|8b5cf6|a855f7|7c3aed)|indigo|violet|purple)[^;{}]{0,120}(blue|cyan|#(3b82f6|06b6d4|0ea5e9))/i;
// "robust" is intentionally NOT here — it's a legitimate engineering term.
const AI_VOCAB = /\b(seamless(ly)?|leverage|delve|synerg\w*|cutting-edge|game-chang\w*|in today'?s (world|fast-paced|digital)|unlock (the|your) potential)\b/i;
// emoji feature-icons/bullets — pictograph blocks only, so ✓ and → don't count.
const EMOJI = /[\u{2600}-\u{26FF}\u{1F300}-\u{1FAFF}]/gu;
const STRUCTURE = /<(table|ol|ul|svg|h2|h3|takt-figure|takt-model|takt-video|takt-mermaid)\b|class="[^"]*\btakt-(grid|card|panel|stat|callout|split|cols-)/i;
const VISUAL = /<(svg|table|takt-figure|takt-model|takt-video|takt-mermaid|img)\b/i;
const SVG_DARK_FILL = /<rect\b[^>]*\bfill=(["'])(#000(000)?|black)\1/i;

// A connector <path> (arrow marker) with no fill:none renders as a black blob.
function svgConnectorBlob(html: string): boolean {
  for (const m of html.matchAll(/<path\b[^>]*>/gi)) {
    const tag = m[0];
    if (/marker-(end|start)=/i.test(tag) && !/fill=(["'])none\1/i.test(tag) && !/fill:\s*none/i.test(tag)) return true;
  }
  return false;
}
function svgNoViewBox(html: string): boolean {
  for (const m of html.matchAll(/<svg\b[^>]*>/gi)) if (!/viewBox=/i.test(m[0])) return true;
  return false;
}

/** Lint a canvas HTML string. Any inline <style> is part of the html, so one
 *  argument covers both structure and styling. */
export function lintCanvas(html: string): LintFinding[] {
  const out: LintFinding[] = [];
  const add = (level: LintLevel, rule: string, message: string) => out.push({ level, rule, message });

  // P0 — hard style/quality failures
  if (SLOP_HEX.test(html) || SLOP_COLOR_NAME.test(html))
    add("P0", "slop-accent", "Uses the default AI indigo/violet accent. Don't declare accent colors — the design system already provides them; remove the custom color.");
  if (TRUST_GRADIENT.test(html))
    add("P0", "trust-gradient", "A purple→blue 'trust' gradient — a classic AI-slop tell. Remove it; use a flat surface or the design-system tokens.");
  if (/lorem ipsum/i.test(html))
    add("P0", "lorem", "Contains lorem ipsum / filler. Use the real, cited product facts instead.");
  if (/<img[^>]+\/assets\/pages\//i.test(html))
    add("P0", "whole-page-img", "Embeds a whole manual PAGE as a raw <img>. Crop to the relevant region and use <takt-figure> instead.");
  if (html.length > 1400 && !STRUCTURE.test(html))
    add("P0", "wall-of-text", "This is a wall of text with no structure. Break it into a grid, cards, steps (<ol>), a spec <table>, and a figure — use the whole canvas.");

  // P0 — a drawn <svg> that will render visibly broken
  if (/<svg\b/i.test(html)) {
    if (svgConnectorBlob(html))
      add("P0", "svg-blob", "An SVG connector <path> carries an arrow marker but has no fill=\"none\", so it renders as a black blob. Add fill=\"none\" to every connector <path>/<line>.");
    if (SVG_DARK_FILL.test(html))
      add("P0", "svg-dark-bg", "A solid black <rect> fills the SVG background — it vanishes in dark mode and reads as a broken black box. Remove it; leave the background transparent.");
  }

  // P1 — should fix
  if (svgNoViewBox(html))
    add("P1", "svg-viewbox", "An <svg> has no viewBox, so it won't scale with its column. Use <svg width=\"100%\" viewBox=\"0 0 680 H\"> and compute H from the lowest element.");
  if (/<img\b(?![^>]*data:)/i.test(html) && /\/assets\//i.test(html))
    add("P1", "raw-asset-img", "Uses a plain <img> for grounded media. Use <takt-figure src=… caption=…> so it's captioned and consistent.");
  if (html.length > 500 && !VISUAL.test(html))
    add("P1", "no-visual", "No visual at all (figure / 3D / table / chart). Show, don't tell — add the relevant figure, 3D part, or a chart/table.");
  if ((html.match(EMOJI) || []).length > 2)
    add("P1", "emoji", "Emoji used as icons/bullets read as AI slop. Drop them or use a real figure.");
  if (AI_VOCAB.test(html))
    add("P1", "ai-vocab", "Marketing/AI filler vocabulary (seamless, leverage, robust, delve…). Write plain, specific, factual copy.");

  return out;
}

export const p0 = (findings: LintFinding[]) => findings.filter((f) => f.level === "P0");

/** Format findings as a self-correction instruction for the canvas worker. */
export function lintFeedback(findings: LintFinding[]): string {
  return `Design check found issues to fix before this page is good — revise and call create_canvas again:\n- ${findings.map((f) => `[${f.level}] ${f.message}`).join("\n- ")}`;
}

// ── self-check: `tsx src/lint-canvas.ts` ─────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  assert(lintCanvas("<h1>Hi</h1>").length === 0, "a clean short page has no findings");
  assert(p0(lintCanvas('<h1 style="color:#6366f1">Hi</h1>')).some((f) => f.rule === "slop-accent"), "flags the indigo slop accent");
  assert(p0(lintCanvas('<div><img src="/assets/pages/abc/1.png"></div>')).some((f) => f.rule === "whole-page-img"), "flags a whole manual page image");
  const wall = "<p>" + "the extruder feeds filament and it is important. ".repeat(40) + "</p>";
  assert(p0(lintCanvas(wall)).some((f) => f.rule === "wall-of-text"), "flags a long wall of text");
  assert(lintCanvas(wall + '<div class="takt-grid takt-cols-2"><div class="takt-card">x</div></div>').every((f) => f.rule !== "wall-of-text"), "structure clears wall-of-text");
  const svg = (inner: string) => `<h1>D</h1><svg width="100%" viewBox="0 0 680 100">${inner}</svg>`;
  assert(p0(lintCanvas(svg('<path d="M0 0L10 10" marker-end="url(#arrow)" stroke="#333"/>'))).some((f) => f.rule === "svg-blob"), "flags connector path missing fill=none");
  assert(lintCanvas(svg('<path d="M0 0L10 10" fill="none" marker-end="url(#arrow)" stroke="#333"/>')).every((f) => f.rule !== "svg-blob"), "fill=none clears blob");
  assert(p0(lintCanvas(svg('<rect fill="#000" width="680" height="100"/>'))).some((f) => f.rule === "svg-dark-bg"), "flags black svg background");
  console.log("lint-canvas self-check ok");
}
