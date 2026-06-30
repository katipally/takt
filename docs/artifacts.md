# Artifacts

Artifacts are the "draw it" half of the agent. When an answer is a calculation, a configurator, a decision tree, or anything spatial, the model builds a small interactive view instead of describing it.

## Lifecycle

1. **Generate** — the agent calls `emit_artifact({ title, kind, code })`. For `kind: "react"` the model writes a single self-contained component named `App` using Tailwind classes, with `React` and `Recharts` available as globals (no import statements; icons are inline SVG or emoji).
2. **Persist** — the code is saved to the `artifacts` table and an `artifact` SSE frame is emitted.
3. **Render** — the Canvas mounts `/artifact-host` in an iframe and posts the code in via `postMessage`. The host compiles the JSX with Babel standalone and renders it.
4. **Save** — every artifact is kept and listed in the per-product gallery (`/gallery/<slug>`), reopenable any time.

## The sandbox

`/artifact-host` is served as its own document and embedded with `sandbox="allow-scripts"` and **no** `allow-same-origin`. That gives the iframe an opaque origin: model-written code can run and fetch from CDNs, but it cannot read the app's cookies, DOM, localStorage, or make same-origin requests. Code is delivered by `postMessage`, never by a same-origin fetch, which is what lets the sandbox stay locked down. The frame reports its height back to the parent for sizing.

This mirrors how Claude renders artifacts in chat (a cross-origin sandboxed frame), reimplemented minimally here.

## Why React-in-iframe and not a server render

The point of an artifact is interactivity — a slider that recomputes wire-feed speed, a tab that switches polarity diagrams. That has to run in the browser. Compiling in the iframe keeps the generated code off the app's origin and out of the build.
