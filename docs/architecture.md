# Architecture

## Processes

Two processes run locally, started together by `pnpm dev`:

- **Web** (`apps/web`, Next.js, :3000) — the UI plus light API routes. It owns all CRUD (products, providers, settings, chats) by talking directly to the SQLite file, serves rendered page images + Profile media, exposes a read-only `resources` API for the landing page, renders the streamed HTML canvas directly in the app document (morphdom, no iframe), and proxies the chat stream to the agent.
- **Agent** (`services/agent`, Hono, :8787) — runs a provider-agnostic tool loop and streams Server-Sent Events back. Its tools split into two lanes:
  - **gather**: `search_product` (hybrid semantic + lexical over the Profile), `get_media` (the flat media index), `read_profile`, `get_page_image`, `crop_page_image`, `list_products`, `fetch_url`.
  - **canvas**: `start_canvas`, `build_canvas`, `edit_canvas`, `read_canvas`, `select_canvas` — the model writes one raw HTML page that a background canvas worker builds and streams.
  - plus `update_todos`, `ask_user`, and `look` (live voice only — grabs a fresh camera frame).

  One gather loop (`turn-loop.ts`) and one canvas worker (`canvas-worker.ts`) are shared by chat and live. The web proxy forwards a shared secret (`x-takt-secret`); the agent rejects anything without it when one is configured.

They are separate because the agent is a long-lived Node process — it holds the model conversation, streams SSE, greps/reads the Profile files on a real filesystem, and runs the live-voice WebSocket — none of which fits a serverless function. Splitting them also means hosting is just pointing `AGENT_SERVICE_URL` at a container.

## Data store

Product knowledge lives in **Profile** bundles — `data/products/<slug>/`, folders of OKF-style markdown (one concept per source, captions inlined next to their page images). The Profile is **canonical and human-editable**.

Beside it sits a compiled, regenerable index (`data/products/<slug>/.index/`) built from the Profile:

- `chunks.json` — text units for lexical + semantic search, chunked from the authored markdown.
- `vectors.bin` — local embeddings (Xenova MiniLM, 384-dim, no API key), a flat Float32 array stored as binary and loaded into memory once at runtime (not JSON, not re-embedded per request). Degrades to lexical if unavailable.
- `vectors.meta.json` — the sidecar for `vectors.bin`: `{ model, dim, ids, kinds }`.
- `media.json` — a **flat media index**: every `page` / `mesh` / `video_clip` / `image` item with its `/assets` URL and vision caption, so `get_media` is one cosine scan from the right figure, 3D part, or video clip.

Retrieval is **hybrid**: `search_product` runs semantic (vector) search over the chunks fused with a lexical grep over the raw markdown (grep wins ties, so exact codes and part numbers land); `get_media` cosine-scans the media index. The index is a compile artifact — the markdown stays the source of truth; rebuild it by re-ingesting. A product with only markdown (no `.index/`) still works via grep.

The SQLite database (`data/takt.db`, `better-sqlite3`) holds only metadata + app state:

- `products`, `manuals`, `page_images` — the catalog and rendered pages, with their vision captions (so `get_page_image` can show a page)
- `providers` — the provider and its AES-256-GCM-encrypted key; model + effort choices live in `settings`
- `chats`, `messages` — conversation history (each turn's ordered blocks, including canvases, so a chat replays exactly)

Rendered page PNGs live in `data/pages/<manualId>/<n>.png`; Profile bundles in `data/products/<slug>/`. Both are served by `/assets/[...path]`.

## Chat request flow

1. The browser POSTs `{ productSlug, chatId, messages, attachments? }` to `/api/chat`.
2. `/api/chat` forwards the body to the agent service (with the shared secret) and streams the response back byte-for-byte; the client's abort signal is forwarded too, so pressing Stop tears down the upstream turn.
3. The agent resolves the model + decrypts the provider key, builds a product-aware system prompt, and runs its tool loop (retrieve from the Profile via `search_product` / `get_media`, show pages, and write a raw HTML canvas — the canvas build runs on a background worker and streams token-by-token).
4. As the model streams, the agent emits SSE frames; tools emit their own frames (a citation source, canvas HTML deltas, a clarifying question) as side effects.
5. The browser decodes frames and updates the transcript and the Canvas — canvas HTML is DOMPurify-sanitized and morphdom-diffed straight into the app document (no iframe). The agent also accumulates the same frames into an ordered block list and persists it, so reopening a chat replays the turn exactly — partial replies, sources, canvases, and ask_user panels included.

## SSE protocol

One JSON object per `data:` line (defined in `packages/shared/src/sse-events.ts`):

| type | meaning |
|------|---------|
| `text_delta` | a chunk of assistant text |
| `reasoning_delta` | a chunk of streamed reasoning |
| `tool_start` / `tool_done` | a tool started / finished (drives the "Searching the manual…" hint), matched by id; `lane` tags main vs. background build |
| `source` | a manual page/crop cited as a source (opens in the source modal) |
| `canvas_start` / `canvas_delta` / `canvas_end` | the streamed HTML canvas: `canvas_start` opens the shell, `canvas_delta` carries HTML chunks (morphdom-diffed live), `canvas_end` delivers the authoritative sanitized + linted full page |
| `canvas_highlight` | ring + scroll-into-view a canvas block by its `data-takt-id` (empty clears) |
| `action_result` | ack for an interactive canvas action (`takt-action`) |
| `ask_user` / `ask_answer` | a clarifying-question panel, and the answer streamed back |
| `title` | the generated chat title |
| `todos` | the agent's working checklist |
| `status` | a transient status line (e.g. "Designing the answer…") |
| `usage` | per-turn context / output tokens and cost |
| `done` / `error` | end of turn |

The decoder (`createSseDecoder`) is stateful and frames on `\n\n`, so partial network chunks are handled correctly.

## Why these choices

- **Markdown canonical, index compiled**: product knowledge is plain OKF markdown on disk (`data/products/`), versionable, portable, and the same files a human reads and edits. The `.index/` (chunks + vectors + media index) is a regenerable artifact compiled from it — never the source of truth. Delete it and re-ingest any time.
- **Hybrid retrieval**: semantic vectors catch fuzzy symptoms described in the user's words; grep catches exact codes and part numbers; the flat media index turns "show me the diagram" into one cosine scan. Each is one signal in the fusion, and grep alone still answers when vectors are absent.
- **Vision-caption every page**: the manuals are mostly diagrams and tables; a vision pass turns each page into searchable text (transcribing tables, describing diagrams and the question each figure answers) using a configurable, cheap model. The captions are the quality moat.
- **Canvas as raw HTML, no iframe**: the model writes one HTML page and the app renders it directly (DOMPurify + a strict app CSP, morphdom for streaming), Claude-Artifacts style. Real web-component islands (`takt-figure` / `takt-model` / `takt-video` / `takt-cite` / `takt-action`) wire figures, 3D parts, and citations back to the sources.
- **Profile = canonical, DB = metadata**: the database only holds catalog + app state, never product knowledge.
