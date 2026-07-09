# Hosting Takt on Hugging Face Spaces (free)

The whole app (Next.js web + agent service) runs in **one Docker container** — the same
two processes as `pnpm dev`, sharing one filesystem — so the hosted site behaves exactly
like local. Infra is **$0**: a free HF Docker Space (16GB RAM, no credit card). The only
cost is the chat API, and users paste **their own** key (Anthropic, OpenAI, or MiniMax),
so it costs you nothing.

## What's in here
- `../Dockerfile` — builds web + agent and runs both processes via
  `../docker-entrypoint.sh`. The catalog ships **empty** by default: a fresh boot creates
  an empty `takt.db` from the schema, and you add products with `pnpm ingest <folder>`.
  (To ship a pre-baked catalog instead, bake a template DB + Profiles into the image with
  `scripts/bake-seed-db.sh` — the entrypoint seeds from it if present.)
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
One command — it creates the Space if needed, drops `.env`, uploads everything, and sets
`WEB_PUBLIC_URL`:
```bash
cd <your-fork>   # the repo root
scripts/push-to-hf.sh <user>/takt
```
HF then builds the Docker image (~5 min) and starts it. Watch it with:
```bash
hf spaces logs <user>/takt --build --follow
```

(`AGENT_SERVICE_URL`, `AGENT_PORT`, `PORT`, `TAKT_DATA_DIR` are baked into the image.
Do **not** set an API key — users paste their own.)

## Using it (what a user does)
1. Open `https://<user>-takt.hf.space`.
2. **Settings → Providers → paste a key (Anthropic, OpenAI, or MiniMax) → Save.**
3. Add a product (`pnpm ingest`, or a pre-baked catalog if you shipped one) and ask. Done.

## Re-deploying after code changes
Re-run `scripts/push-to-hf.sh <user>/takt`; it re-uploads and HF rebuilds.

## Where the data lives (and what persists)

The agent runs **server-side** in the container — grep/read happen on the container
filesystem, exactly like local. The browser is a thin client; **no product data ever
lives in the browser.** The agent's workspace is `TAKT_DATA_DIR` (`/app/data`):

```
/app/data/
  products/<slug>/   READ-ONLY to the chat agent  → search_product · get_media · read_profile
  pages/ heroes/     read-only product media
  scratch/           the agent's writable tmp (crops, working files)
  takt.db            chats + metadata (runtime)
```

The chat agent can only **read** `products/` (there is no write tool for it); the sole
writer is **ingest**, a separate action. So a conversation can never corrupt product
knowledge.

**Persistence on a free Space is the one real difference from local.** The container
filesystem is ephemeral:
- **Baked = durable:** anything shipped in the image is present on every boot. By default
  that's just the code — the catalog starts empty. If you bake a template DB + Profiles
  in, they become your read-only catalog.
- **Runtime = ephemeral:** anything created in a session (a newly-ingested product's
  Profile, chats, crops) is **lost when the Space sleeps/restarts/redeploys.** Fine for a
  demo. For durable runtime data, mount HF **persistent storage** at `/app/data` (paid) or
  commit new Profiles back to the repo and re-deploy.

## Notes
- Free Spaces **sleep after ~48h idle**; the first visit afterward cold-starts (~30–60s).
- Runtime state (a pasted key, chat history, in-session ingests) is **ephemeral** — see
  above. Fine for a demo; users just re-paste their key.
- Local clone-and-run needs no seeding: `packages/db` creates an empty `data/takt.db` from
  the schema on first boot (nothing under `data/` is committed — it's all gitignored and
  regenerable). Add a product with `pnpm ingest <folder>`. To ship a pre-baked catalog in
  the image, run `scripts/bake-seed-db.sh` to build a template DB.

## Local smoke test (optional, needs Docker)
```bash
cd <your-fork>   # the repo root
docker build -t takt:local .
docker run --rm -p 7860:7860 takt:local
# open http://localhost:7860  → Settings shows "No key set"
```
