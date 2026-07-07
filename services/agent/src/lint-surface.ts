import type { UISurface } from "@takt/shared";

// Anti-AI-slop linter for a freeform `Page` surface (open-design's approach: a
// cheap, grep-based check — no HTML parse). It hunts the tells that make
// generated UI look generic/AI-made and the walls-of-text we're trying to kill,
// then feeds P0 findings back to the build worker for ONE self-correction pass
// before the page is shown. The design system already provides the good colors/
// type, so the model should compose structure, not reinvent styling.

export type LintLevel = "P0" | "P1" | "P2";
export interface LintFinding { level: LintLevel; rule: string; message: string; }

// Pull the html+css out of a surface IF it is a freeform Page (only those need
// linting — catalog surfaces are pre-styled and can't carry slop).
function pageSource(surface: UISurface): { html: string; css: string } | null {
  const root = surface.nodes.find((n) => n.id === surface.root);
  if (!root || root.type !== "Page") return null;
  const p = (root.props ?? {}) as { html?: unknown; css?: unknown };
  return { html: typeof p.html === "string" ? p.html : "", css: typeof p.css === "string" ? p.css : "" };
}

// The known AI-default accent palette (Tailwind indigo/violet) — the single most
// common tell. The design system already owns the accent, so any of these hexes
// is the model reinventing styling with the slop color.
const SLOP_HEX = /#(6366f1|4f46e5|4338ca|818cf8|7c3aed|8b5cf6|a855f7|c084fc|6d28d9)\b/i;
const SLOP_COLOR_NAME = /\b(indigo|violet)\b/i;
// purple/indigo → blue/cyan "trust gradient". Spans are length-capped so the
// two adjacent runs can't backtrack quadratically on model-controlled input.
const TRUST_GRADIENT = /linear-gradient[^;{}]{0,120}(#(6366f1|8b5cf6|a855f7|7c3aed)|indigo|violet|purple)[^;{}]{0,120}(blue|cyan|#(3b82f6|06b6d4|0ea5e9))/i;
// "robust" is intentionally NOT here — it's a legitimate engineering term.
const AI_VOCAB = /\b(seamless(ly)?|leverage|delve|synerg\w*|cutting-edge|game-chang\w*|in today'?s (world|fast-paced|digital)|unlock (the|your) potential)\b/i;
// emoji feature-icons/bullets, a strong AI tell — pictograph blocks only, so the
// technical marks ✓ (dingbats) and → (arrows) don't count as emoji.
const EMOJI = /[\u{2600}-\u{26FF}\u{1F300}-\u{1FAFF}]/gu;
// any structural element that makes a page read as designed, not a text dump.
const STRUCTURE = /<(table|ol|ul|svg|h2|h3|takt-figure|takt-model|takt-video)\b|class="[^"]*\btakt-(grid|card|panel|stat|callout|split|cols-)/i;
const VISUAL = /<(svg|table|takt-figure|takt-model|takt-video|img)\b/i;

// A solid black/near-black <rect> painted as an SVG background — invisible in
// dark mode, reads as a broken black box. Tokens are never pure black here.
const SVG_DARK_FILL = /<rect\b[^>]*\bfill=(["'])(#000(000)?|black)\1/i;

// A connector <path> (it carries an arrow marker) with no fill:none renders as a
// black blob — SVG fills paths black by default. Scanned per-tag (linear, no
// backtracking on model-controlled input — see TRUST_GRADIENT note above).
function svgConnectorBlob(html: string): boolean {
  for (const m of html.matchAll(/<path\b[^>]*>/gi)) {
    const tag = m[0];
    if (/marker-(end|start)=/i.test(tag) && !/fill=(["'])none\1/i.test(tag) && !/fill:\s*none/i.test(tag)) return true;
  }
  return false;
}

// An <svg> with no viewBox won't scale with its column (breaks the responsive
// contract — every diagram must be `<svg width="100%" viewBox="0 0 680 H">`).
function svgNoViewBox(html: string): boolean {
  for (const m of html.matchAll(/<svg\b[^>]*>/gi)) if (!/viewBox=/i.test(m[0])) return true;
  return false;
}

export function lintSurface(surface: UISurface): LintFinding[] {
  const src = pageSource(surface);
  if (!src) return [];
  const { html, css } = src;
  const hay = `${html}\n${css}`;
  const out: LintFinding[] = [];
  const add = (level: LintLevel, rule: string, message: string) => out.push({ level, rule, message });

  // P0 — hard style/quality failures
  if (SLOP_HEX.test(hay) || SLOP_COLOR_NAME.test(css))
    add("P0", "slop-accent", "Uses the default AI indigo/violet accent. Don't declare accent colors — the design system already provides them; remove the custom color.");
  if (TRUST_GRADIENT.test(hay))
    add("P0", "trust-gradient", "A purple→blue 'trust' gradient — a classic AI-slop tell. Remove it; use a flat surface or the design-system tokens.");
  if (/lorem ipsum/i.test(hay))
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
  const emojiCount = (html.match(EMOJI) || []).length;
  if (emojiCount > 2)
    add("P1", "emoji", "Emoji used as icons/bullets read as AI slop. Drop them or use a real figure.");
  if (AI_VOCAB.test(html))
    add("P1", "ai-vocab", "Marketing/AI filler vocabulary (seamless, leverage, robust, delve…). Write plain, specific, factual copy.");

  return out;
}

export const p0 = (findings: LintFinding[]) => findings.filter((f) => f.level === "P0");

// Format findings as a self-correction instruction for the build worker.
export function lintFeedback(findings: LintFinding[]): string {
  return `Design check found issues to fix before this page is good — revise the Page and call emit_ui again with the SAME key:\n- ${findings.map((f) => `[${f.level}] ${f.message}`).join("\n- ")}`;
}

// ── self-check: `tsx src/lint-surface.ts` ─────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  const page = (html: string, css = ""): UISurface => ({ id: "s", root: "pg", nodes: [{ id: "pg", type: "Page", props: { html, css } }] });

  assert(lintSurface(page("<h1>Hi</h1>")).length === 0, "a clean short page has no findings");
  assert(p0(lintSurface(page("<h1 style=\"color:#6366f1\">Hi</h1>"))).some((f) => f.rule === "slop-accent"), "flags the indigo slop accent");
  assert(p0(lintSurface(page('<div><img src="/assets/pages/abc/1.png"></div>'))).some((f) => f.rule === "whole-page-img"), "flags a whole manual page image");
  const wall = "<p>" + "the extruder feeds filament and it is important. ".repeat(40) + "</p>";
  assert(p0(lintSurface(page(wall))).some((f) => f.rule === "wall-of-text"), "flags a long wall of text with no structure");
  assert(lintSurface(page(wall + '<div class="takt-grid takt-cols-2"><div class="takt-card">x</div></div>')).every((f) => f.rule !== "wall-of-text"), "structure clears the wall-of-text finding");
  // a catalog (non-Page) surface is never linted
  assert(lintSurface({ id: "s", root: "r", nodes: [{ id: "r", type: "Prose", props: { markdown: "#6366f1 lorem ipsum" } }] }).length === 0, "non-Page surfaces are not linted");

  // SVG diagram checks
  const svg = (inner: string) => `<h1>D</h1><svg width="100%" viewBox="0 0 680 100">${inner}</svg>`;
  assert(p0(lintSurface(page(svg('<path d="M0 0L10 10" marker-end="url(#arrow)" stroke="#333"/>')))).some((f) => f.rule === "svg-blob"), "flags a connector path missing fill=none");
  assert(lintSurface(page(svg('<path d="M0 0L10 10" fill="none" marker-end="url(#arrow)" stroke="#333"/>'))).every((f) => f.rule !== "svg-blob"), "fill=none clears the blob finding");
  assert(p0(lintSurface(page(svg('<rect fill="#000" width="680" height="100"/>')))).some((f) => f.rule === "svg-dark-bg"), "flags a black svg background rect");
  assert(lintSurface(page('<h1>D</h1><svg width="200" height="100"><rect/></svg>')).some((f) => f.rule === "svg-viewbox"), "flags an svg with no viewBox");
  assert(p0(lintSurface(page(svg('<line x1="0" y1="0" x2="10" y2="0" stroke="var(--takt-accent)"/>')))).length === 0, "a clean token svg raises no P0");

  console.log("lint-surface self-check ok");
}
