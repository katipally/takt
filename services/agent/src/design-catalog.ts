// The design catalog. Instead of stuffing every rule + component into the canvas
// worker's system prompt (bloat on every call), the worker gets a slim base + a
// `read_design(modules)` tool that returns only the modules it needs for THIS
// answer (Claude's read_me pattern). Add components/patterns here without growing
// the base prompt. Nothing hard-codes ONE layout — each module is a toolbox.

export const DESIGN_MODULES: Record<string, { blurb: string; body: string }> = {
  layout: {
    blurb: "page composition — hero-as-pair, filling columns, breathable rhythm, archetypes per question type",
    body: `LAYOUT — compose a designed spread, never a stack of blocks with dead whitespace.
• The page is a contained canvas. The design system routes plain prose (\`<p>/<h2>/<ol>\`) to a readable center column and BREAKS OUT grids/tables/figures wider — so USE grids to fill the width; don't force prose wide.
• HERO = a PAIR. Open with \`<div class="takt-grid takt-split" data-takt-id="hero">\`: one child is the eyebrow + serif \`<h1>\` + \`.takt-lead\` + a \`.takt-chips\` row; the other child is the key figure / 3D / video. Side by side, similar height. NEVER a full-width image stacked above the intro (the design system caps image height, but still pair it).
• FILL EACH ROW with \`takt-split\` / \`takt-cols-2\` / \`takt-cols-3\` / \`takt-cols-4\`. A lone card in a wide row is dead space — give it a sibling (the figure, a stat, the next cause). Figures live BESIDE the text they explain (the figure for step 2 sits in step 2's row).
• BREATHABLE: generous space BETWEEN sections, tight WITHIN a card; vary the rhythm (a dense row next to an airy one). No orphan images, no half-empty rows, no wall of centered prose.
• ARCHETYPE — pick the shape that fits the question (you have creative freedom to adapt):
  – part-explainer ("show me the X"): hero(figure + what-it-is) → anatomy (annotated figure or legend) → how-to (steps beside a figure) → a tip callout.
  – procedure / how-to: hero → numbered steps, each paired with its figure or a stat → a safety \`.takt-callout[data-tone=warn]\` → a compact quick-reference card.
  – troubleshooter: the symptom as the lead → a decision diagram (module: mermaid or diagram) OR a \`takt-cols-2\` of cause cards → the fixes; a spec \`<table>\`.
  – spec-sheet / settings: hero → a comparison \`<table>\` → \`.takt-stat\` tiles → a chart (module: chart) → an interactive picker (module: interactive).
  – comparison: a \`<table>\` or \`takt-cols-3\` of option cards, each with a verdict chip + its headline stat.`,
  },
  figures: {
    blurb: "manual figures, 3D parts, video clips — placement beside text, legends, annotations, cite pages",
    body: `FIGURES & MEDIA — the point of a technical-support canvas. Use ONLY real /assets URLs a tool returned this turn; never invent one.
• \`<takt-figure src="/assets/…" caption="… [p.28]"></takt-figure>\` — a cropped manual figure. Place it in a grid column BESIDE its explanation. \`variant="inset"\` floats it so body text wraps around it (newspaper-style) for a small clarifying image. Crop TIGHT to the one figure with crop_page_image — never a whole page.
• \`<takt-model src="/assets/*.glb" caption="…"></takt-model>\` — a rotatable 3D part (whenever get_media returns a mesh; a 3D part beats a photo).
• \`<takt-video src="/assets/…#t=96,108" caption="…"></takt-video>\` — plays just that clip.
• LABEL a figure two ways: if it has printed callout numbers, map them with \`legend='[{"n":1,"label":"Idler lever","detail":"flip to open"},…]'\` (always accurate). If NOT, draw your own marks with \`annos='[{"kind":"arrow","x1":.3,"y1":.4,"x2":.5,"y2":.5,"label":"pivot"}]'\` (coords are 0–1 fractions read off the grid the crop overlays; kinds box/arrow/label/redact; 2–4 marks max).
• Cite facts inline with \`<takt-cite page="28" product="slug"></takt-cite>\` — a clickable p.28 that opens the manual page.`,
  },
  components: {
    blurb: "chips, stat tiles, cards, callouts, tables, quotes, spec panels, menu paths",
    body: `COMPONENTS — compose from these; don't reinvent styling.
• \`<span class="takt-chip">No tools</span>\` — small metadata pills, inline in a \`<p class="takt-chips">…</p>\`. Never a bare stacked list of one-word lines.
• \`<div class="takt-stat"><span class="n">215&nbsp;°C</span><span class="l">Nozzle</span></div>\` — a headline number; group several in a \`takt-cols-3\`.
• \`.takt-card\` / \`.takt-panel\` group content; a card gets a \`<h3>\` + body + optional \`<takt-cite>\`.
• \`.takt-callout\` with \`data-tone="warn|danger|ok|tip"\` for a safety note / caveat / tip.
• \`<table>\` for specs/comparison (full width automatically); \`<blockquote>\` for a pulled manual line.
• Menu paths / keys as \`<code>LCD → Filament → Load</code>\`.`,
  },
  chart: {
    blurb: "data visualization drawn as inline SVG — bar, range, comparison, line",
    body: `CHART — draw an inline \`<svg>\` to VISUALIZE numbers the manual doesn't already picture (a range, a comparison, a curve). If the manual pictures it, crop that figure instead.
• Frame: \`<svg width="100%" viewBox="0 0 680 H">\` — 680 wide; compute H from the lowest element + 40; content between x=40 and x=640. Background TRANSPARENT (never a solid/black <rect>).
• Color from tokens only: text \`fill="var(--takt-fg)"\`, axes/muted \`stroke="var(--takt-muted)"\`, primary \`var(--takt-accent)"\`, 2nd series \`var(--takt-arc)"\`. Two colors max = meaning, not decoration.
• Every line/path needs \`fill="none"\`; every \`<text>\` an explicit fill; two font sizes (14 label / 12 sub); \`text-anchor="middle"\` to center.
• Shapes: horizontal bars for a comparison, a labeled range bar for min–max, points+line for a trend. Label each value directly (no separate legend when you can put the number on the bar).`,
  },
  diagram: {
    blurb: "hand-drawn SVG diagrams — flowchart, how-it-works, architecture, exploded/anatomy",
    body: `DIAGRAM — draw an inline \`<svg>\` to SYNTHESIZE a relationship the manual doesn't picture: a flow A→B→C, a containment/architecture, a "how it works".
• Same frame + token rules as a chart (\`viewBox="0 0 680 H"\`, transparent bg, token colors, \`fill="none"\` on connectors, explicit text fills).
• Define ONE \`<marker id="arrow">\` and reuse it; route arrows AROUND boxes, never through them; \`rx="6"\` rounded boxes with a \`var(--takt-border)\` stroke. Max 4–5 nodes ~60px apart — more than that, split into two smaller svgs or use mermaid.
• Text fits its box (at 14px a char ≈ 8px → box ≥ chars×8+48). Re-check before finishing: H recomputed, nothing past x=640, every arrow clears every box.`,
  },
  mermaid: {
    blurb: "flowchart / sequence / state / decision-tree diagrams via <takt-mermaid> (mermaid.js)",
    body: `MERMAID — for a decision tree, a troubleshooting flow, a sequence, or a state machine, use a \`<takt-mermaid>\` block instead of hand-drawing SVG:
\`<takt-mermaid>
flowchart TD
  A[Filament won't feed] --> B{Idler open?}
  B -- No --> C[Flip idler lever open]
  B -- Yes --> D{Filament reaches gear?}
  D -- No --> E[Loosen two top screws]
  D -- Yes --> F[Reload from LCD menu]
</takt-mermaid>\`
• Keep node labels SHORT and plain — avoid \`()[]{}\` and punctuation inside the label text (the parser chokes); use quotes if you must: \`A["Heat to 215 C"]\`.
• Good for: troubleshooting decision trees, load/unload sequences, calibration state flow. It renders + themes automatically and fits the column width.`,
  },
  interactive: {
    blurb: "in-canvas calculators, selectors, toggles — real <input>/<select>/<button> + <script>",
    body: `INTERACTIVE — make the answer a TOOL when it helps (a settings picker, a unit/temp calculator, a symptom selector). Write plain \`<input>\`/\`<select>\`/\`<button>\` PLUS a \`<script>\` (streamed LAST) that reads them and updates the DOM. It runs sandboxed in the canvas — no round-trip.
• Compute a sensible DEFAULT on load so nothing shows a bare "—".
• Read values, write results into elements you gave ids; keep it dependency-free vanilla JS.
• Example shape: a \`<select id="mat">\` of materials → on change, update \`.takt-stat\` nozzle/bed numbers + a notes line from a small JS lookup table built from the cited manual values.
• Use \`<takt-action id="…" value="…">Label</takt-action>\` ONLY to send a value back to Takt to continue the conversation — not for local math.`,
  },
};

/** The compact index shown in the base prompt so the worker knows what to load. */
export function moduleIndex(): string {
  return Object.entries(DESIGN_MODULES).map(([k, v]) => `  ${k.padEnd(11)}— ${v.blurb}`).join("\n");
}

/** Return the requested modules' bodies (unknown names are skipped). */
export function readDesign(modules: string[]): string {
  const out = modules
    .map((m) => DESIGN_MODULES[m.trim().toLowerCase()])
    .filter(Boolean)
    .map((m) => m!.body);
  if (!out.length) return `No such module. Available: ${Object.keys(DESIGN_MODULES).join(", ")}.`;
  return out.join("\n\n");
}

// ── self-check: `tsx src/design-catalog.ts` ──────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  assert(readDesign(["layout"]).includes("HERO = a PAIR"), "layout module loads");
  assert(readDesign(["chart", "mermaid"]).includes("viewBox") && readDesign(["chart", "mermaid"]).includes("takt-mermaid"), "multiple modules concat");
  assert(readDesign(["nope"]).startsWith("No such module"), "unknown module → hint");
  assert(moduleIndex().includes("layout") && moduleIndex().includes("interactive"), "index lists modules");
  console.log("design-catalog self-check ok");
}
