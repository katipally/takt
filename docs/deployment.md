# Deployment

Prox runs as two processes — the Next.js web app and the agent service (Claude Agent
SDK) — that share one SQLite DB and the rendered page images on local disk. The hosted
setup keeps that exact shape, so the live site behaves identically to `pnpm dev`.

## Live demo

Hosted on a free **Hugging Face Docker Space**: both processes in one container, the
seeded catalog + vector index + page images baked into the image, no paid infra. It
ships **without an API key** — open **Settings → Providers** and paste an Anthropic key
to use it. (The chat API is the only cost, and each visitor brings their own key.)

## How it works

```
        public  https://<user>-<space>.hf.space   (PORT 7860)
                         │
              ┌──────────▼─────────────────────────┐
              │  ONE container                      │
              │  Next.js web  :7860  (public)       │
              │     └─ /api/chat ──proxy──┐         │
              │  Agent (SDK)  :8787 (internal only) │
              │  shared /app/data: prox.db + pages  │
              └─────────────────────────────────────┘
```

- One container runs both processes via `docker-entrypoint.sh` (`concurrently`). The web
  app is the only public port; the agent stays on `localhost:8787` and the web reaches it
  through `AGENT_SERVICE_URL`, with `/api/chat` proxying the SSE stream.
- Both processes share the same filesystem, so the web app's **direct** SQLite/file reads
  work exactly as on a laptop — **no data-layer code changes**.
- `Dockerfile` installs deps (compiling the native modules), runs `next build`, and bakes
  the embedding model (`pnpm warm`) plus the seeded `data/` so the first question is fast
  and nothing downloads at runtime.

Relevant files: `Dockerfile`, `.dockerignore`, `docker-entrypoint.sh`, `deploy/`.

## Deploy / redeploy

One-command flow with the `hf` CLI — see **[`deploy/HOSTING.md`](../deploy/HOSTING.md)**:

```bash
hf auth login                       # once
cd <your-fork>   # the repo root
deploy/push-to-hf.sh <user>/<space> # create-if-needed, upload, set WEB_PUBLIC_URL
hf spaces logs <user>/<space> --build --follow
```

The script stages a clean copy that **strips the provider key from the baked DB**, drops
`.env`, and omits `data/.enc-key` (regenerated in the container). Re-running it redeploys.

## Env reference

| var | where | purpose | on HF |
|-----|-------|---------|-------|
| `WEB_PUBLIC_URL` | agent | base URL for page-image / artifact links | **set** to the Space URL |
| `AGENT_SERVICE_URL` | web | where to reach the agent | baked: `http://localhost:8787` |
| `AGENT_PORT` / `PORT` | both | agent / web ports | baked: `8787` / `7860` |
| `PROX_DATA_DIR` | both | data dir (DB + images) | baked: `/app/data` |
| `PROX_ENC_KEY` | both | encrypts provider keys at rest | optional; `.enc-key` regenerates |
| `PROX_EMBED_MODEL` | agent (+ ingest) | embedding model id | baked default |
| `ANTHROPIC_API_KEY` | agent (+ ingest) | default provider key | **do not set** — visitors add their own |

## Why one container, not Vercel

The agent spawns a `claude` subprocess and loads a local embedding model, so it needs a
real Node container, not a serverless function. The web app also reads SQLite and the
page-image files directly. Putting the web on Vercel would mean reworking that data layer
and the hosted app would diverge from local. One container keeps hosted == local.

## Scaling later (multi-user / persistent state)

The free Space is single-container and its runtime state is **ephemeral** — a visitor's
pasted key and chat history reset when the Space restarts or redeploys, and it sleeps
after ~48h idle. That's fine for a demo. To make it persistent or multi-user later:

- **Database** — `better-sqlite3` → **Turso/libSQL** (same SQL + `sqlite-vec` vector
  search; one file changes: `packages/db/src/connection.ts`).
- **Page images** — local `data/pages/` → object storage (S3/R2); update the two
  read/write points (`get_page_image` and the `/assets` route).
- Or attach HF **persistent storage** / move to a bigger always-on host.

To refresh the **content** (re-ingest the manual, add a product), re-run `pnpm seed` /
ingest locally, then redeploy — the new `data/` is baked into the next image.
