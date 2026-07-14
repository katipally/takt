// The canvas craft STANDARD — the single runtime source of truth. Two exports:
//   CRAFT_CORE — the non-negotiables, injected into EVERY canvas build's system
//                prompt (guaranteed, not left to the model's read_design choice).
//   TEMPLATES  — the blessed page skeletons. The shell is the consistency: any
//                model that fills a skeleton's slots produces a well-composed
//                page; freeform is reserved for expressly creative asks.
// docs/design-standard.md is the human-readable mirror of this file. Edit HERE;
// keep the doc in sync. Distilled from open-design craft/* + the gold examples.

export const CRAFT_CORE = `CRAFT LAW — non-negotiable on every page. You are the DESIGN LEAD: give each answer a visual identity SPECIFIC to its subject, not a house look. The STRUCTURE comes from the blessed skeletons; the LOOK is yours to design per subject via the design tokens.
• IDENTITY (design it first): decide a palette + type for THIS subject, then set them at the very top of your output — \`<style>.takt-page{--takt-accent:#RRGGBB;--takt-arc:#RRGGBB;--takt-serif:…;--takt-sans:…}</style>\`. Every element (links, figure numbers, chart marks, chips, callouts) inherits those tokens, so ONE style block re-skins the whole page. Optionally bias the neutrals (\`--takt-surface/--takt-border\`) a hair toward the accent and pick a \`--takt-radius\`. Values must read on BOTH the light and near-black surface (add a \`.dark .takt-page{…}\` override if one doesn't).
• COLOR: one accent chosen from the subject's own world, ≤2 loud uses per screen; neutrals carry 70–90%. Semantic tones (warn/danger/ok) only where they mean it. AVOID the AI-design cluster: no indigo/violet default, no purple→blue gradient hero, no lone acid-green on near-black, no two-stop "trust" gradient.
• TYPE: pair a display face + a body face + a mono face, chosen with intent (a characterful serif for a heritage tool; a tight grotesque for a precision instrument) and set via the tokens — never Inter/Space-Grotesk as the "safe" pick. System faces only (the CSP blocks webfont URLs — a linked font fails silently). ALL-CAPS eyebrows get letter-spacing .06–.1em; big display type gets NEGATIVE tracking; stat/table digits use tabular-nums. Body measure ~65ch, headline ~16ch. Two typefaces max.
• HIERARCHY: exactly ONE dominant entry point (the hero), made dominant by ≥2 vectors at once (size + weight, or scale + tracking). Everything else clearly subordinate — no two blocks competing to be first.
• LAYOUT: fill every row (a lone card in a wide row is dead space — give it a sibling or let it run full width). Generous space BETWEEN sections, tight WITHIN a card. No orphan images, no half-empty rows, no tall column beside a short one. Nothing overflows or clips its container.
• GRID vs SEQUENCE: multi-column grids (\`takt-cols-2/3\`) are ONLY for PARALLEL items of SIMILAR length read in any order — a comparison, a set of causes, option cards. NEVER put numbered/sequential steps ("walk me through", "step 1→5", a decision flow) in a multi-column grid: it breaks reading order and leaves cards of unequal length half-empty. Sequential steps = a SINGLE column of full-width rows (or an \`<ol>\`). Only pair items comparable in length.
• IMAGERY: a figure is composed IN, not dropped in a beige box. Crop tight; let it fill its frame (cover) or, for a diagram/screenshot where the whole image matters, use \`data-variant="contain"\`. Place it BESIDE the text it explains. Caption is one quiet line.
• RESPONSIVE: correct at BOTH ~1100px (laptop) and ~390px (phone) — two-up rows stack to one column, no horizontal scroll, no clipped media, no crushed text. Lean on the grid's container queries; don't invent tiny breakpoints.
• STATE: any interactive/data surface handles its empty + error states, not only the happy path — compute a sensible default on load so nothing shows a bare "—".
• MOTION: transforms/opacity only, gate every animation on prefers-reduced-motion, never the ONLY signal of a state change. Restraint reads as considered; scattered effects read as AI-generated.
• A11Y: keep a visible :focus-visible ring (never outline:none with no replacement); native <button>/<a>; real alt/caption on every figure; don't justify body text.`;

// The blessed skeletons. Each is a proven composition using only design-system
// classes — filling its slots CANNOT produce a broken layout, which is what makes
// output consistent across models (the weak-model guarantee). Slots are guidance,
// not a straitjacket: rename ids, add/remove rows of the same shape as content
// demands. "Claude's plan-artifact rule: the shell is the consistency."
export const TEMPLATES = `BLESSED SKELETONS — pick the one that fits the question and FILL ITS SLOTS (<!-- … --> comments). Keep the row shapes; add/remove repeated rows freely. Go FREEFORM only for an expressly creative ask (a poster, a game, "make something beautiful") — then compose your own spread under the same craft law.

■ explainer — "what is X" / "show me the part":
<div class="takt-grid">
  <div class="takt-split" data-takt-id="hero">
    <div><p class="takt-eyebrow"><!-- domain --></p><h1><!-- the part --></h1><p class="takt-lead"><!-- one sentence --></p><p class="takt-chips"><!-- 2–4 chips --></p></div>
    <div><!-- THE hero figure/3D + one-line caption, nothing else --></div>
  </div>
  <div data-takt-id="anatomy"><!-- annotated figure with legend, or a labeled diagram --></div>
  <div class="takt-cols-2" data-takt-id="detail"><!-- two takt-cards: how it works / where it lives --></div>
  <div class="takt-callout" data-tone="tip" data-takt-id="tip"><!-- one practical tip, cited --></div>
</div>

■ step-guide — a procedure ("how do I load/replace/calibrate"):
<div class="takt-grid">
  <div class="takt-split" data-takt-id="hero">
    <div><p class="takt-eyebrow"><!-- task --></p><h1><!-- the job --></h1><p class="takt-lead"><!-- outcome + time --></p><p class="takt-chips"><!-- tools/parts needed --></p></div>
    <div><!-- hero figure/video of the finished state --></div>
  </div>
  <!-- one FULL-WIDTH row PER STEP, single column, in order: -->
  <div class="takt-split" data-takt-id="step-1"><div><h3>1. <!-- verb phrase --></h3><p><!-- the move, cited --></p></div><div><!-- that step's figure --></div></div>
  <div class="takt-callout" data-tone="warn" data-takt-id="safety"><!-- the safety line --></div>
  <div class="takt-card" data-takt-id="quickref"><!-- compact recap: settings/values table --></div>
</div>

■ troubleshooter — a symptom ("X won't feed / error 12"):
<div class="takt-grid">
  <div data-takt-id="hero"><p class="takt-eyebrow"><!-- product --></p><h1><!-- the symptom, user's words --></h1><p class="takt-lead"><!-- most likely cause in one line --></p></div>
  <div data-takt-id="flow"><!-- <takt-mermaid> decision flow OR takt-cols-2 of cause cards --></div>
  <!-- full-width fix row per cause, each with its figure: -->
  <div class="takt-split" data-takt-id="fix-1"><div><h3><!-- fix --></h3><p><!-- steps, cited --></p></div><div><!-- figure --></div></div>
  <div class="takt-callout" data-tone="warn" data-takt-id="safety"><!-- when to stop / call support --></div>
</div>

■ calculator — "how much / how long / what size do I need" (an interactive tool is the answer):
<div class="takt-grid">
  <div data-takt-id="hero"><p class="takt-eyebrow"><!-- task --></p><h1><!-- the question --></h1><p class="takt-lead"><!-- what the tool tells you --></p></div>
  <div class="takt-card" data-takt-id="tool">
    <div class="takt-controls"><!-- 2–4 labeled takt-field controls: select / range+output / number (module: interactive) --></div>
    <div class="takt-cols-3" data-takt-id="results"><!-- takt-stat tiles the script updates live --></div>
    <p class="takt-mediacap"><!-- the cited manual rule the math comes from --></p>
  </div>
  <div data-takt-id="basis"><!-- the backing spec <table> or figure, cited --></div>
  <!-- <script> LAST: compute defaults on load, recompute on input/change -->
</div>

■ spec-compare — "which one" / specs / settings:
<div class="takt-grid">
  <div class="takt-split" data-takt-id="hero">
    <div><p class="takt-eyebrow"><!-- category --></p><h1><!-- the decision --></h1><p class="takt-lead"><!-- the short answer --></p></div>
    <div><!-- hero figure/3D of the recommended pick --></div>
  </div>
  <div class="takt-cols-3" data-takt-id="stats"><!-- 3 takt-stat tiles: the headline numbers --></div>
  <div data-takt-id="table"><!-- full comparison <table>, verdict chip per row, every number cited --></div>
  <div data-takt-id="picker"><!-- optional: interactive selector/calculator (module: interactive) --></div>
</div>`;
