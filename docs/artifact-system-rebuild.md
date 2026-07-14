# Takt Artifact / Canvas System — Architecture (rebuild executed)

*July 2026. This replaces the original rebuild plan — everything below is what actually
shipped. The reverse-engineering source material lives in `artifact_dump/` (Claude Code
v2.1.198 internals + empirical probes of published claude.ai artifacts).*

## The model (mirrors classic claude.ai Artifacts)

Claude's artifact quality is **not** a verify loop — it has none. It is upstream
constraints, and Takt now uses the same four:

```
CONTRACT          plain-text page between <takt:canvas> markers (no JSON escaping;
                  truncation = unclosed marker → bounded "continue" rounds)
PLAN FIRST        the model writes a short token plan (skeleton, colors, type,
                  layout) as prose before the markers — forced, zero round-trips
STRUCTURE         blessed skeletons (TEMPLATES) — the shell is the consistency;
                  freeform only for expressly creative asks
VALIDATED COLOR   chart palette pre-validated once (CVD/OKLCH/contrast) and baked
                  as --takt-cat-* / --takt-seq-* tokens; models never pick chart hex
RUNTIME WRAPPER   sandboxed srcdoc iframe (opaque origin), in-frame CSP, canvas-css
                  design system, takt-frame-runtime.js (auto-height, theme, islands)
```

## End-to-end flow

```
Browser ── POST /chat ─► agent service (Hono, SSE)
  runAgent: chat model gathers (retrieval/media/crop) → build_canvas
    └─► runCanvasWorker (BUILD model, canvas-worker.ts)
          read_design(modules) → PLAN → <takt:canvas>…</takt:canvas>
          stop_reason max_tokens → continue (≤2) → concat
          sanitize (asset allowlist, on*=, javascript:) → grep lint (1 retry)
          canvas_end ─► SSE ─► Canvas.tsx paints ONCE (finished-only)
                              buildFrameSrcdoc → iframe sandbox="allow-scripts allow-modals"
```

Deleted in this rebuild: the Playwright + VLM verify loop (`render-canvas.ts`,
`verify-canvas.ts`, `/canvas-preview`, the `playwright` dep). It silently no-op'd when
chromium/webapp were unavailable, used the build model to judge itself, and only caught
two geometry classes. The investment moved upstream instead.

## Where things live

See `docs/design-standard.md` for the standard itself and the source-of-truth table.
Key files: `services/agent/src/canvas-worker.ts` (composer), `design-standard.ts`
(CRAFT_CORE + TEMPLATES), `design-catalog.ts` (read_design modules),
`packages/shared/src/canvas.ts` (marker contract), `apps/web/src/lib/canvas/frame.ts`
(srcdoc + CSP), `canvas-css.ts` (tokens incl. chart palette),
`apps/web/public/takt-frame-runtime.js` (in-frame runtime).
