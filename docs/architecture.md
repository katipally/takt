# Architecture

## Processes

Two processes run locally, started together by `pnpm dev`:

- **Web** (`apps/web`, Next.js, :3000) — the UI plus light API routes. It owns all CRUD (products, providers, settings, artifacts, chats) by talking directly to the SQLite file, serves rendered page images, and proxies the chat stream to the agent.
- **Agent** (`services/agent`, Hono, :8787) — runs a provider-agnostic tool loop with in-process tools (`list_profile`, `grep_profile`, `read_profile`, `get_page_image`, `crop_page_image`, `emit_artifact`, `ask_user`, `list_products`) and streams Server-Sent Events back. The web proxy forwards a shared secret (`x-takt-secret`); the agent rejects anything without it when one is configured.

They are separate because the agent is a long-lived Node process — it holds the model conversation, streams SSE, greps/reads the Profile files on a real filesystem, and runs the live-voice WebSocket — none of which fits a serverless function. Splitting them also means hosting is just pointing `AGENT_SERVICE_URL` at a container.

## Data store

Product knowledge lives in **Profile** bundles — `data/products/<slug>/`, folders of OKF-style markdown (one concept per source, captions inlined next to their page images). The Profile is canonical and human-editable; the agent retrieves from it directly by **Direct Corpus Interaction** (grep + read), so there is no chunk table, no embeddings, and no vector index.

The SQLite database (`data/takt.db`, `better-sqlite3`) holds only metadata + app state:

- `products`, `manuals`, `page_images` — the catalog and rendered pages (so `get_page_image` can show a page)
- `providers` — the provider and its AES-256-GCM-encrypted key; model + effort choices live in `settings`
- `chats`, `messages`, `artifacts` — history and saved artifacts

Rendered page PNGs live in `data/pages/<manualId>/<n>.png`; Profile bundles in `data/products/<slug>/`. Both are served by `/assets/[...path]`.

## Chat request flow

1. The browser POSTs `{ productSlug, chatId, messages, attachments? }` to `/api/chat`.
2. `/api/chat` forwards the body to the agent service (with the shared secret) and streams the response back byte-for-byte; the client's abort signal is forwarded too, so pressing Stop tears down the upstream turn.
3. The agent resolves the model + decrypts the provider key, builds a product-aware system prompt, and runs its tool loop (list/grep/read the Profile, show pages, emit artifacts).
4. As the model streams, the agent emits SSE frames; tools emit their own frames (a page image, an artifact, a clarifying question) as side effects.
5. The browser decodes frames and updates the transcript and the Canvas. The agent also accumulates the same frames into an ordered block list and persists it, so reopening a chat replays the turn exactly — partial replies, page images, and ask_user panels included.

## SSE protocol

One JSON object per `data:` line (defined in `packages/shared/src/sse-events.ts`):

| type | meaning |
|------|---------|
| `text_delta` | a chunk of assistant text |
| `reasoning_delta` | a chunk of streamed reasoning |
| `tool_start` / `tool_done` | a tool started / finished (drives the "Searching the manual…" hint), matched by id |
| `page_image` | show this manual page in the Canvas |
| `artifact` | an artifact was created; open it in the Canvas |
| `ask_user` / `ask_answer` | a clarifying-question panel, and the answer streamed back |
| `citation` | a page citation (reserved) |
| `title` | the generated chat title |
| `status` | a transient status line (e.g. "Building the artifact…") |
| `usage` | per-turn context / output tokens and cost |
| `done` / `error` | end of turn |

The decoder (`createSseDecoder`) is stateful and frames on `\n\n`, so partial network chunks are handled correctly.

## Why these choices

- **Direct Corpus Interaction** (grep + read over Profile markdown) over vector RAG: the corpus is small and curated, so the agent finds evidence by searching the raw text — the approach Claude Code uses on a codebase. One source of truth, no embeddings, no vector DB, millisecond search, and the same files a human can read and edit. Add a lexical/semantic index back only if a corpus ever outgrows grep.
- **Profile = canonical, DB = metadata**: product knowledge is plain markdown on disk (`data/products/`), versionable and portable; the database only holds catalog + app state.
- **Vision-caption every page** over text-only extraction: the manuals are mostly diagrams and tables; captions are the only way that content becomes searchable text.
