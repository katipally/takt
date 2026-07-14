# Canvas design standard

Every answer in Takt is a canvas, a self-contained HTML page composed by the build model
(`services/agent/src/canvas-worker.ts`). Quality is enforced upstream, before paint, the same
trade claude.ai's Artifacts make (they ship with no post-render verification). Five things do
the work:

1. **Always-on CRAFT CORE.** The non-negotiables, injected into every build's system prompt.
2. **Blessed skeletons.** 5 proven page compositions (`TEMPLATES`: explainer, step-guide,
   troubleshooter, calculator, spec-compare); the model fills the slots. The shell is the
   consistency: filling a skeleton can't produce a broken layout, which is what makes weak
   models produce the same baseline as strong ones. Freeform is reserved for expressly creative
   asks.
3. **Forced plan-before-code.** The output contract makes the model write a short token plan
   (skeleton, 4 to 6 colors, type roles, layout) as prose before the page markers.
4. **Pre-validated chart palette.** `--takt-cat-1..8` / `--takt-seq-1..5` tokens in
   `canvas-css.ts`, validated against Takt's real card surfaces. Models never pick chart hexes,
   so chart color can't be wrong.
5. **Grep lint** (`lint-canvas.ts`). Anti-AI-slop tells, one self-correction pass before paint.

## Source of truth

The runtime is the enforcement; this doc is the human-readable mirror. Edit the strings in
**`services/agent/src/design-standard.ts`** (`CRAFT_CORE`, `TEMPLATES`) and keep this file in
sync. Nothing reads this Markdown at runtime.

| Concern | Where it lives |
| --- | --- |
| Non-negotiables (always on) | `CRAFT_CORE` → `canvasSystemPrompt()` in `canvas-worker.ts` |
| Blessed skeletons | `TEMPLATES` in `design-standard.ts` (same prompt) |
| On-demand craft detail | `DESIGN_MODULES` in `design-catalog.ts` (`read_design`) |
| Cheap text-grep gate | `lint-canvas.ts` (runs before paint, one retry) |
| Design tokens + grid + chart palette | `apps/web/src/lib/canvas/canvas-css.ts` (`--takt-*`, `.takt-page`) |
| Output contract + continuation | `<takt:canvas>` markers, `packages/shared/src/canvas.ts` |

## The output contract

The model streams plain text: a short plan, then the page between `<takt:canvas title="…">`
and `</takt:canvas>`. There's no JSON escaping (any model can emit it), the streaming preview
is a substring, and a `max_tokens` truncation is just an unclosed marker. The worker asks the
model to continue (up to 2 rounds) and concatenates.

```
build_canvas / edit_canvas
  → read_design (modules)  →  PLAN (prose)  →  <takt:canvas> page </takt:canvas>
  → stop_reason max_tokens? → "continue exactly where you stopped" (up to 2 rounds)
  → sanitize (asset allowlist, on* handlers) + grep-lint + one self-correct
  → canvas_end ................ the paint; no post-render verify loop
```

## CRAFT CORE (the non-negotiables)

Mirror of `CRAFT_CORE`. These hold on every page regardless of the question:

- **Color.** Neutrals carry 70 to 90%; one accent, at most 2 visible uses per screen; semantic
  tones only where they mean something. Never indigo/violet or a two-stop "trust" gradient.
- **Type.** A display + body + mono pairing chosen per subject via tokens; system faces only
  (the frame CSP blocks webfonts). ALL-CAPS labels tracked `.06` to `.1em`; big display tracked
  negative; stats and tables use `tabular-nums`. About 65ch body, about 16ch headline. Two
  typefaces max.
- **Hierarchy.** Exactly one dominant entry point (the hero), dominant by 2 or more vectors at
  once.
- **Layout.** Fill every row; airy between sections, tight within a card; nothing overflows or
  clips. Grids only for parallel same-length items; sequences are single-column.
- **Responsive.** Correct at about 1100px and about 390px; no horizontal scroll, no clipped
  media.
- **State.** Interactive and data surfaces handle empty and error; sensible default on load.
- **Motion.** Transforms and opacity only, gated by `prefers-reduced-motion`.
- **A11y.** Visible `:focus-visible` ring, native `<button>`/`<a>`, real alt/caption text, no
  justified body.

## When to change this

- New non-negotiable that should hold on every page: add to `CRAFT_CORE`, mirror here.
- New page shape that keeps recurring: add a skeleton to `TEMPLATES`.
- Specialised, question-type-specific guidance (a new workflow, chart type, component): a
  `DESIGN_MODULES` entry in `design-catalog.ts`; it loads only via `read_design`.
- New palette slot: validate it first against the card surfaces (OKLCH bands, chroma floor,
  Machado-2009 CVD ΔE, WCAG contrast in both light and dark) using the dataviz palette
  validator, then bake the tokens into `canvas-css.ts`.
