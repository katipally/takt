# Architecture

## Processes

Two processes run locally, started together by `pnpm dev`:

- **Web** (`apps/web`, Next.js, :3000) — the UI plus light API routes. It owns all CRUD (products, providers, models, artifacts, chats) by talking directly to the SQLite file, serves rendered page images, and proxies the chat stream to the agent.
- **Agent** (`services/agent`, Hono, :8787) — runs the Claude Agent SDK `query()` loop with four in-process tools and streams Server-Sent Events back.

They are separate because the Agent SDK spawns a `claude` CLI subprocess that needs a real Node runtime and a working directory — it can't run inside a serverless function. Splitting them now also means hosting later is just pointing `AGENT_SERVICE_URL` at a container.

## Data store

Everything is one SQLite database (`data/prox.db`) opened with `better-sqlite3`, with the `sqlite-vec` extension loaded for vector search. Tables:

- `products`, `manuals`, `page_images` — the catalog and rendered pages
- `chunks` — retrieval units (text / table / image_caption), each tagged with a page number
- `vec_chunks` — a `vec0` virtual table holding the embeddings, **partitioned by `product_id`** so KNN search never crosses products
- `providers`, `models` — model configuration (provider keys stored AES-256-GCM encrypted)
- `chats`, `messages`, `artifacts` — history and saved artifacts

Rendered page PNGs live in `data/pages/<manualId>/<n>.png` and are served by `/assets/[...path]`.

## Chat request flow

1. The browser POSTs `{ productSlug, chatId, messages, modelId }` to `/api/chat`.
2. `/api/chat` forwards the body to the agent service and streams the response back byte-for-byte.
3. The agent resolves the model + decrypts the provider key, builds a product-aware system prompt, and runs `query()` with the four tools.
4. As the model streams, the agent emits SSE frames; tools emit their own frames (a page image, an artifact) as side effects.
5. The browser decodes frames and updates the transcript and the Canvas.

## SSE protocol

One JSON object per `data:` line (defined in `packages/shared/src/sse-events.ts`):

| type | meaning |
|------|---------|
| `text_delta` | a chunk of assistant text |
| `tool_call` | a tool started (drives the "Searching the manual…" hint) |
| `page_image` | show this manual page in the Canvas |
| `artifact` | an artifact was created; open it in the Canvas |
| `citation` | a page citation (reserved) |
| `title` | the generated chat title |
| `done` / `error` | end of turn |

The decoder (`createSseDecoder`) is stateful and frames on `\n\n`, so partial network chunks are handled correctly.

## Why these choices

- **SQLite + sqlite-vec** over Postgres/pgvector: zero infra, one file, runs from a clone. Same SQL dialect as Turso, so hosting is a small migration, not a rewrite.
- **Local embeddings** over a hosted embedding API: keeps the required-keys count at one and the per-query cost at zero.
- **Vision-caption every page** over text-only extraction: the manuals are mostly diagrams and tables; captions are the only way that content becomes searchable.
