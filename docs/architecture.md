# Architecture

## Processes

Two processes run locally, started together by `pnpm dev`:

- **Web** (`apps/web`, Next.js, :3000) — the UI plus light API routes. It owns all CRUD (products, providers, settings, chats) by talking directly to the SQLite file, serves rendered page images + Profile media, exposes a read-only `resources` API for the landing knowledge-graph section, hosts the sandboxed canvas (`/canvas-host`), and proxies the chat stream to the agent.
- **Agent** (`services/agent`, Hono, :8787) — runs a provider-agnostic tool loop and streams Server-Sent Events back. Its tools: knowledge-graph retrieval (`find_entity`, `search_product`, `walk_graph`, `get_anchors`, `query_product`, `product_map`), corpus fallback (`list_profile`, `grep_profile`, `read_profile`), media (`get_page_image`, `crop_page_image`), UI (`emit_ui` — a designed `Page` surface — and `delegate_build`, which hands the build to a background worker), plus `ask_user`, `list_products`, `update_todos`. The web proxy forwards a shared secret (`x-takt-secret`); the agent rejects anything without it when one is configured.

They are separate because the agent is a long-lived Node process — it holds the model conversation, streams SSE, greps/reads the Profile files on a real filesystem, and runs the live-voice WebSocket — none of which fits a serverless function. Splitting them also means hosting is just pointing `AGENT_SERVICE_URL` at a container.

## Data store

Product knowledge lives in **Profile** bundles — `data/products/<slug>/`, folders of OKF-style markdown (one concept per source, captions inlined next to their page images). The Profile is **canonical and human-editable**.

Beside it sits a compiled, regenerable **PKB** (`data/products/<slug>/.pkb/`) built from the Profile:

- `graph.json` — the product knowledge graph: entities (Part/Fault/Procedure/Spec…) + edges + hyperedges, each with a confidence tier (`EXTRACTED`/`INFERRED`/`AMBIGUOUS`) and multimodal **anchors** (manual-page crop, 3D mesh node, video clip) that let an answer point back at the exact figure/part.
- `chunks.json` — text units for lexical + semantic search.
- `vectors.json` — local embeddings (Xenova MiniLM, no API key), tagged by kind so entity and chunk search don't dilute each other; degrades to lexical if unavailable.

Retrieval is **hybrid**: graph traversal + semantic (vector) search + graph-guided chunk selection, with grep over the raw markdown as an exact-term fallback. The PKB is a compile artifact — the markdown stays the source of truth; rebuild it with `pnpm pkb:build <slug>` (or re-ingest). A product with only markdown (no `.pkb`) still works via grep.

The SQLite database (`data/takt.db`, `better-sqlite3`) holds only metadata + app state:

- `products`, `manuals`, `page_images` — the catalog and rendered pages (so `get_page_image` can show a page)
- `providers` — the provider and its AES-256-GCM-encrypted key; model + effort choices live in `settings`
- `chats`, `messages` — conversation history (each turn's ordered blocks, including UI surfaces, so a chat replays exactly)

Rendered page PNGs live in `data/pages/<manualId>/<n>.png`; Profile bundles in `data/products/<slug>/`. Both are served by `/assets/[...path]`.

## Chat request flow

1. The browser POSTs `{ productSlug, chatId, messages, attachments? }` to `/api/chat`.
2. `/api/chat` forwards the body to the agent service (with the shared secret) and streams the response back byte-for-byte; the client's abort signal is forwarded too, so pressing Stop tears down the upstream turn.
3. The agent resolves the model + decrypts the provider key, builds a product-aware system prompt, and runs its tool loop (retrieve from the graph/corpus, show pages, build a `Page` surface — usually via a background `delegate_build` worker).
4. As the model streams, the agent emits SSE frames; tools emit their own frames (a page image, a `ui_surface`, a clarifying question) as side effects.
5. The browser decodes frames and updates the transcript and the Canvas. The agent also accumulates the same frames into an ordered block list and persists it, so reopening a chat replays the turn exactly — partial replies, page images, and ask_user panels included.

## SSE protocol

One JSON object per `data:` line (defined in `packages/shared/src/sse-events.ts`):

| type | meaning |
|------|---------|
| `text_delta` | a chunk of assistant text |
| `reasoning_delta` | a chunk of streamed reasoning |
| `tool_start` / `tool_done` | a tool started / finished (drives the "Searching the manual…" hint), matched by id |
| `page_image` | show this manual page in the Canvas |
| `ui_surface` | a designed UI surface (a freeform `Page`, or catalog nodes) to render on the Canvas; `partial: true` while still streaming |
| `ui_action_result` | ack for an interactive Button/Form/Select submit |
| `ask_user` / `ask_answer` | a clarifying-question panel, and the answer streamed back |
| `title` | the generated chat title |
| `todos` | the agent's working checklist |
| `status` | a transient status line (e.g. "Designing the answer…") |
| `usage` | per-turn context / output tokens and cost |
| `done` / `error` | end of turn |

The decoder (`createSseDecoder`) is stateful and frames on `\n\n`, so partial network chunks are handled correctly.

## Why these choices

- **Markdown canonical, PKB compiled**: product knowledge is plain OKF markdown on disk (`data/products/`), versionable, portable, and the same files a human reads and edits. The `.pkb` (graph + chunks + vectors) is a regenerable index compiled from it — never the source of truth. Delete it and rebuild any time.
- **Hybrid retrieval, graph-first**: a physical product is a graph of parts, faults, procedures and specs, so the graph is the primary index (traverse from the entity the question is about to its neighbours and its media anchors). Semantic vectors catch fuzzy symptoms described in the user's words; grep catches exact codes/part numbers. Each is one signal in the fusion.
- **Vision-caption + extract every page**: the manuals are mostly diagrams and tables; a vision pass turns each page into searchable text, and a per-page extraction pass turns that into the graph. Both use a configurable, cheap model.
- **Profile = canonical, DB = metadata**: the database only holds catalog + app state, never product knowledge.
