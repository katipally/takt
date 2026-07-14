# Architecture

## Processes

Two processes run locally, started together by `pnpm dev`:

- **Web** (`apps/web`, Next.js, :3000) — the UI plus light API routes. It owns all CRUD (products, providers, settings, chats) by talking directly to the SQLite file, serves rendered page images + Profile media, renders the composed HTML canvas in a **sandboxed iframe** (opaque origin — the model's CSS/JS can never touch the app), and proxies the chat stream to the agent. In production its custom server (`server.mjs`) also proxies the `/live` WebSocket to the agent, attaching the shared secret.
- **Agent** (`services/agent`, Hono, :8787) — runs a provider-agnostic tool loop and streams Server-Sent Events back. Its tools split into two lanes:
  - **gather**: `find_entity` / `explore_entity` / `trace_path` (the knowledge graph), `search_product` (hybrid FTS + semantic over graph chunks), `get_media` (graph media), `read_profile`, `get_page_image`, `crop_page_image`, `list_products`, `fetch_url`.
  - **canvas**: `build_canvas`, `edit_canvas`, `read_canvas`, `select_canvas` — the model writes one raw HTML page that a background canvas worker builds; the finished, sanitized page lands on the stage.
  - plus `update_todos`, `ask_user`, and — live voice only — `look` (grabs a fresh camera frame) and `show_overlay` (pins a 3D part / figure / clip / pointer note over the live view).

  One gather loop (`turn-loop.ts`) and one canvas worker (`canvas-worker.ts`) serve chat; live voice runs its own per-call turn runner (`live/turn-runner.ts`) over the same tools. The web proxy forwards a shared secret (`x-takt-secret`); the agent rejects anything without it when one is configured.

They are separate because the agent is a long-lived Node process — it holds the model conversation, streams SSE, reads the knowledge graph on a real filesystem, and runs the live-voice WebSocket — none of which fits a serverless function. Splitting them also means hosting is just pointing `AGENT_SERVICE_URL` at a container.

## Data store

Product knowledge has two layers:

- **Profile bundles** — `data/products/<slug>/`, folders of OKF-style markdown (one concept per source, captions inlined next to their page images). Human-editable; `read_profile` serves them verbatim. `.index/media.json` beside them is the regenerable media registry ingest writes (every `page` / `mesh` / `video_clip` / `image` with its `/assets` URL + caption).
- **The knowledge graph** — the retrieval substrate, in SQLite: typed `entities` (part, spec, symptom, procedure, warning, figure, model_part, video_clip, …) with their measured values in `attrs`, typed `edges` (`fixes`, `references`, `shown_in`, `depicts`, …), `kg_chunks` (page text), and `kg_media` — every row carrying its own local embedding (`Xenova/bge-small-en-v1.5`, 384-dim, no API key) plus FTS5 tables. Built **deterministically** at ingest (`graph-build.ts` — no LLM in the build, so re-ingest is stable), embedded (`embedGraph`), then cross-modally linked (`link.ts` connects meshes/videos to the parts and procedures they depict).

Retrieval is **hybrid**: FTS5 (BM25) fused with in-DB cosine by reciprocal-rank fusion, then re-ranked so query-term **coverage dominates** (a chunk containing all the question's meaningful words beats one rich in a single common word). Degrades to lexical-only when the embedder is unavailable. `replaceProductGraph` swaps a product's whole graph transactionally on re-ingest.

The same SQLite database (`data/takt.db`, `better-sqlite3`) also holds app state:

- `products`, `manuals`, `page_images` — the catalog and rendered pages, with their vision captions
- `providers` — the provider and its AES-256-GCM-encrypted key; model + effort choices live in `settings`
- `chats`, `messages` — conversation history (each turn's ordered blocks, including canvases; live turns are flagged `live`)

Rendered page PNGs live in `data/pages/<manualId>/<n>.png`; Profile bundles in `data/products/<slug>/`. Both are served by `/assets/[...path]`.

## Chat request flow

1. The browser POSTs `{ productSlug, chatId, messages, attachments? }` to `/api/chat`.
2. `/api/chat` forwards the body to the agent service (with the shared secret) and streams the response back byte-for-byte; the client's abort signal is forwarded too, so pressing Stop tears down the upstream turn.
3. The agent resolves the model + decrypts the provider key, builds a product-aware system prompt, and runs its tool loop (resolve entities and search the graph, show pages, and write a raw HTML canvas — the canvas build runs on a background worker).
4. As the model streams, the agent emits SSE frames; tools emit their own frames (a citation source, canvas deltas, a clarifying question) as side effects.
5. The browser decodes frames and updates the transcript; the canvas shows a page-shaped skeleton while the build streams and swaps in the **finished, sanitized page** in the sandboxed iframe (`canvas_delta` is kept for crash-resilient persistence, not painted live). The agent also accumulates the same frames into an ordered block list and persists it, so reopening a chat replays the turn exactly.

## Live voice

Live mode is a **thick client**: the browser runs the whole voice stack on-device via transformers.js/ONNX — Silero VAD, Whisper STT, Smart-Turn end-of-turn detection, and Kokoro TTS — so **no audio ever crosses the network**. The `/live` WebSocket carries only final transcript text (+ inline camera JPEGs), a cancel signal, and the chat SSE union coming back (`packages/shared/src/live-events.ts`).

- **UI**: the composer morphs into a voice bar (same `layoutId`), the stage stays visible, the camera is a draggable PiP tile, and the spoken transcript lands in the chat rail as live-flagged turns. No separate live screen.
- **Server** (`services/agent/src/live/`): `ws.ts` attaches the WebSocket to the agent's http server; one `LiveSession` per call persists turns (barge-in truncates the saved text to exactly what was voiced) and rehydrates history on reconnect; `LiveTurnRunner` drives the LLM with the product tools, camera frames on the two most recent turns, and lowest-latency reasoning.
- **Grounding**: every product-scoped turn is grounded server-side before the model speaks — the top matched graph entities (with their exact spec values) and chunks are injected into the turn, so a latency-tuned model answers "215 °C, page 50" without a tool round. Tools remain for anything deeper.
- **Overlays**: `show_overlay` pins one visual over the live view while the agent talks — the rotatable 3D part (`<model-viewer>`, with AR placement on phones), a manual figure, a repair clip, a pointer note, or **marks drawn on the camera feed itself** (arrows, rings, boxes, freehand paths, labels at normalized 0–1 coords, several per call). A 3D part or figure given an anchor pins INSIDE the feed next to the thing it explains. Screen-space annotation — anchored to the frame, not object-tracked; the agent re-aims as frames refresh each turn. Ephemeral: a new overlay replaces the last, `clear` takes it down, nothing persists.

## SSE protocol

One JSON object per `data:` line (defined in `packages/shared/src/sse-events.ts`):

| type | meaning |
|------|---------|
| `text_delta` | a chunk of assistant text |
| `reasoning_delta` | a chunk of streamed reasoning |
| `tool_start` / `tool_done` | a tool started / finished (drives the "Searching the manual…" hint), matched by id; `lane` tags main vs. background build |
| `source` | a manual page/crop cited as a source (opens in the source modal) |
| `canvas_start` / `canvas_delta` / `canvas_end` | the canvas: `canvas_start` opens the shell, `canvas_delta` carries the full decoded HTML so far (persistence/crash-resilience — not painted live), `canvas_end` delivers the authoritative sanitized + linted page |
| `canvas_highlight` | ring + scroll-into-view a canvas block by its `data-takt-id` (empty clears) |
| `live_overlay` | live voice: pin/replace/clear the visual over the live view (model / figure / video / note / clear) |
| `action_result` | ack for an interactive canvas action (`takt-action`) |
| `ask_user` / `ask_answer` | a clarifying-question panel, and the answer streamed back |
| `title` | the generated chat title |
| `todos` | the agent's working checklist |
| `status` | a transient status line (e.g. "Designing the answer…"; live uses `ready` to end warm-up) |
| `usage` | per-turn context / output tokens and cost |
| `done` / `error` | end of turn |

The decoder (`createSseDecoder`) is stateful and frames on `\n\n`, so partial network chunks are handled correctly.

## Why these choices

- **Graph compiled, markdown kept**: the knowledge graph is a deterministic compile artifact — same input, same graph — so it can be rebuilt any time, while the Profile markdown stays the human-readable, editable export of the same knowledge.
- **Hybrid retrieval with coverage re-rank**: FTS catches exact codes and part numbers; embeddings catch fuzzy symptoms in the user's words; term-coverage keeps natural questions from drifting to a page that merely repeats one common word.
- **Vision-caption every page**: the manuals are mostly diagrams and tables; a vision pass turns each page into searchable text AND structured entities (a spec's exact value ends up on the graph node even when the page text defers to an online table). The captions + parse are the quality moat.
- **Canvas in a sandboxed iframe**: the model writes one HTML page rendered in an `<iframe sandbox srcdoc>` with an opaque origin — its CSS/JS cannot collide with or reach the app; that isolation (not sanitization) is the security boundary. Web-component islands (`takt-figure` / `takt-model` / `takt-video` / `takt-cite` / `takt-action`) bridge clicks back to the app via postMessage.
- **Voice on-device**: STT/TTS/VAD in the browser means privacy (no audio leaves the machine), zero server GPU cost, and local barge-in with no round-trip.
- **Profile + graph = knowledge, DB = one file**: everything regenerable lives under `data/` and rebuilds from `pnpm ingest`.
