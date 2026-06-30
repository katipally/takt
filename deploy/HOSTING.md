# Hosting Prox on Hugging Face Spaces (free)

The whole app (Next.js web + agent service) runs in **one Docker container** — the same
two processes as `pnpm dev`, sharing one filesystem — so the hosted site behaves exactly
like local. Infra is **$0**: a free HF Docker Space (16GB RAM, no credit card). The only
cost is the chat API, and judges paste **their own** Anthropic key, so it costs you nothing.

## What's in here
- `../Dockerfile` — builds web + agent, bakes the seeded catalog/vector index/page images
  and the embedding model. Runs both processes via `../docker-entrypoint.sh`.
- `../.dockerignore` — keeps host `node_modules`/`.next` and **secrets (`.env`)** out.
- `README.hf.md` — the Space's `README.md` (Docker front-matter, `app_port: 7860`).
- `push-to-hf.sh` — assembles a clean, **key-free** Space repo and pushes it.

## One-time setup
1. Create a free account at https://huggingface.co.
2. Make a **write** token at https://huggingface.co/settings/tokens and log in:
   ```bash
   hf auth login
   ```

## Deploy
One command — it creates the Space if needed, strips your API key from the baked DB,
drops `.env`, uploads everything, and sets `WEB_PUBLIC_URL`:
```bash
cd <your-fork>   # the repo root
deploy/push-to-hf.sh <user>/prox
```
HF then builds the Docker image (~5 min) and starts it. Watch it with:
```bash
hf spaces logs <user>/prox --build --follow
```

(`AGENT_SERVICE_URL`, `AGENT_PORT`, `PORT`, `PROX_DATA_DIR` are baked into the image.
Do **not** set `ANTHROPIC_API_KEY` — judges paste their own.)

## Using it (what a judge does)
1. Open `https://<user>-prox.hf.space`.
2. **Settings → Providers → paste an Anthropic key → Save.**
3. Ask the welder questions. Done.

## Re-deploying after code changes
Re-run `deploy/push-to-hf.sh <user>/prox`; it re-uploads and HF rebuilds.

## Notes
- Free Spaces **sleep after ~48h idle**; the first visit afterward cold-starts (~30–60s).
- Runtime state (a pasted key, chat history) is **ephemeral** — it resets if the Space
  restarts or redeploys. Fine for a demo; judges just re-paste their key.
- Local clone-and-run needs no seeding: the key-free `data/seed.db` plus the rendered
  page images are committed, and `packages/db` copies the seed to the runtime DB on
  first boot. The runtime DB (`data/prox.db`, holding the pasted key + chats) stays
  gitignored. Re-index or add a product with `pnpm ingest`, then `scripts/bake-seed-db.sh`.

## Local smoke test (optional, needs Docker)
```bash
cd <your-fork>   # the repo root
docker build -t prox:local .
docker run --rm -p 7860:7860 prox:local
# open http://localhost:7860  → Settings shows "No key set"
```
