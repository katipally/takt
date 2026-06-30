# Prox — AI product specialist

> **Prox Founding Engineer Challenge submission.**
> A multimodal reasoning agent for the **Vulcan OmniPro 220** multiprocess welder,
> built on the Claude Agent SDK. It answers deep technical questions grounded in
> the manuals, cites them to the page, **shows** the actual manual pages, and
> **draws** live interactive tools when words aren't enough.

**🔗 Live demo (zero setup):** https://yash3471-prox.hf.space
**▶️ Video walkthrough:** _<!-- TODO: paste your video link here -->_

Open the live demo, go to **Settings → Providers**, paste an Anthropic API key
(you plug in your own, exactly as the brief describes), and ask the welder
something hard. No clone, no build.

---

## Two ways to run it

### A. Just open the live demo
https://yash3471-prox.hf.space → Settings → Providers → paste key → ask. Done.

### B. Clone and run (under 2 minutes)

```bash
git clone <this-fork> && cd <fork>
cp .env.example .env          # paste your ANTHROPIC_API_KEY into .env
pnpm install
pnpm dev                      # web on :3000, agent on :8787
```

Open http://localhost:3000, pick the Vulcan OmniPro 220, and ask away.

**No `pnpm seed` step.** The welder is already indexed: a key-free, pre-built
catalog (`data/seed.db`) and every rendered manual page ship in the repo and load
on first boot. The only one-time cost is a ~90 MB local embedding model that
downloads the first time you ask a question (cached after that). Re-indexing this
product or adding a new one is still one command — see [Adding a product](#adding-a-product).

Try the questions from the brief:

- *"What's the duty cycle for MIG welding at 200A on 240V?"*
- *"I'm getting porosity in my flux-cored welds. What should I check?"*
- *"What polarity setup do I need for TIG? Which socket does the ground clamp go in?"*

---

## What it does — the five capabilities

Prox is built around five tools the agent reaches for on its own. The system
prompt enforces four rules — **Ground, Show, Draw, Ask** — so it behaves like a
cited, multimodal specialist instead of a chatbot.

### 1. Ground — every fact is cited to the page
Before stating any spec, setting, or procedure, the agent calls `search_manual`,
which embeds the question and runs vector KNN over the manual's text **and** the
captions written for every diagram and table. Answers carry inline citations like
`[p.12]`. **Click a citation** to open the exact manual page it came from. If the
manuals don't cover something, the agent says so instead of guessing.

### 2. Show — it surfaces the real manual page
When an answer leans on a diagram, schematic, control-panel photo, duty-cycle
matrix, or the process-selection chart, the agent calls `get_page_image`. The
page opens in the **Canvas** beside the chat, and the same image is fed back to
the model so it reads charts the embedded text misses. This is how image-only
content (the wiring schematic, the weld-defect photos) becomes answerable.

### 3. Draw — it generates live interactive tools
When the answer is a calculation, a multi-step decision, or a settings lookup,
the agent writes a small self-contained React component on the fly with
`emit_artifact` and it renders **live** in a sandboxed frame: a duty-cycle
calculator, a settings configurator (process + material + thickness → wire speed
+ voltage), a troubleshooting flowchart, a polarity/socket diagram. Artifacts can
`import` real packages (`react`, `lucide-react`, `framer-motion`, `recharts`,
`d3`, `three`), embed actual manual page images, and are **versioned** — ask for a
change and you get a new version you can flip between. Every artifact is saved to
a per-product **gallery**. (How the renderer works: [docs/artifacts.md](docs/artifacts.md).)

### 4. Ask — it clarifies before guessing
When a request is ambiguous or the answer depends on a choice the agent doesn't
know yet (process, material, thickness, input voltage), it calls `ask_user` and a
clean multiple-choice panel appears in the chat. Questions can carry their own
inline diagrams (ASCII or a small React sketch) to help you choose. You answer,
and it continues with a precise, grounded response. Dismiss the panel and it
proceeds with stated best-effort defaults.

### 5. Multi-product — it knows what it can answer about
`list_products` lets the agent tell you which products it covers. The catalog,
retrieval index, and tools are all keyed by product, so adding one is a drop-in.

### Plus, around the agent
- **Voice.** Talk to it and have answers read back, using the browser's built-in
  speech APIs (best in Chrome/Edge, degrades to text elsewhere). No extra keys.
- **Image input.** Drag a photo of your setup or a defect into the composer; the
  agent sees it alongside the manuals.
- **Streamed reasoning + live tool activity.** You watch it search, open pages,
  and build artifacts in real time, with a context/cost meter per turn.
- **Chat history & branching.** Conversations are saved; edit a message to branch
  and explore an alternative without losing the original.
- **Provider & model management.** Add Anthropic- or OpenAI-compatible providers
  from the UI, register models, set a default, toggle which appear in the
  composer. Keys are AES-encrypted at rest; the browser only sees the last four
  digits.

---

## Architecture

```
 Browser ──fetch + SSE──▶ Next.js (web, :3000)
   │                        • workbench UI, settings, gallery
   │                        • CRUD API routes (read/write the DB)
   │                        • /api/chat  = thin SSE proxy ───────────┐
   │                        • /artifact-host = sandboxed iframe doc  │
   │                                                                 ▼
   │                        Agent service (Hono, :8787)
   │                          • Claude Agent SDK query() loop
   │                          • in-process tools: search_manual,
   │                            get_page_image, emit_artifact,
   │                            ask_user, list_products
   │                          • streams SSE event frames
   │                                         │
   └────────────  data/prox.db (SQLite + sqlite-vec)  ◀──┘   data/pages/*.png
```

The agent runs as a **separate Node service** because the Claude Agent SDK spawns
a `claude` subprocess — it needs a real Node runtime, not a serverless function.
The web app proxies to it over SSE, so the agent endpoint is one env var away from
being swapped for a hosted container (see [docs/deployment.md](docs/deployment.md)).
Locally, `pnpm dev` runs both with one command.

The web layer and the agent share one SQLite file — the whole datastore: product
catalog, providers/models, chats, artifacts, and the `sqlite-vec` vector index all
live in `data/prox.db`. Rendered manual pages are PNGs in `data/pages/`.

**Stack:** Next.js 16 / React 19 / Tailwind v4 (web), Claude Agent SDK + Hono
(agent), better-sqlite3 + sqlite-vec (store), Transformers.js (local embeddings),
mupdf (PDF rendering). Full picture and the SSE protocol:
[docs/architecture.md](docs/architecture.md).

---

## How knowledge is extracted

Dense manuals are mostly visual — duty-cycle matrices, wiring schematics, the
process-selection chart, weld-defect photos. Plain text extraction loses all of
that. So the ingest pipeline (`pipeline/ingest`) does this per product:

1. **Render** every PDF page to a PNG with mupdf.
2. **Read** every page with Claude vision: transcribe the text, rebuild tables as
   markdown, and describe each diagram/photo and *what question it answers*. This
   caption is what makes image-only content searchable.
3. **Chunk** the embedded text and the captions into ~500-token windows, tagged
   with their page number.
4. **Embed** every chunk locally with `bge-small` (Transformers.js, no API key)
   and store it in `sqlite-vec`, partitioned by product.

At query time `search_manual` embeds the question and runs KNN within the
product's partition; `get_page_image` hands back the original PNG (and shows it).
The page number rides along the whole way, which is how citations stay exact.

Details: [docs/architecture.md](docs/architecture.md) · [docs/artifacts.md](docs/artifacts.md) · [docs/adding-a-product.md](docs/adding-a-product.md).

---

## Adding a product

Nothing is hardcoded to welding. Drop a product's PDFs in a folder and run:

```bash
pnpm ingest \
  --product espresso-machine \
  --name "Acme Espresso One" \
  --manufacturer "Acme" \
  --dir ./path/to/its/pdfs \
  --hero ./path/to/photo.webp
```

Re-running is idempotent (captions and chunks are cached, so unchanged pages are
skipped and cost nothing). The product shows up in the picker immediately. To
refresh the committed, key-free catalog after seeding, run
`scripts/bake-seed-db.sh`.

---

## Design decisions & tradeoffs

- **Local-first by design.** SQLite + local embeddings keep setup to one key, but
  the index is a single file on disk. For multi-user hosting you'd move to
  Turso/Postgres and object storage — [docs/deployment.md](docs/deployment.md)
  covers the swap; the code sits behind a thin seam for it.
- **Pre-seeded so clone-and-run is instant.** The welder index ships in the repo
  as a key-free `data/seed.db` that's copied to the runtime DB on first boot, so
  judges never wait on (or pay for) ingest. The encrypted key and chat history
  live only in the gitignored runtime DB.
- **Hosted on a free tier, $0 to us.** The HF Space ships with no API key; you
  paste your own, matching the brief. (Free Spaces sleep when idle, so the first
  hit may cold-start for ~30–60s.)
- **Voice is browser-native.** Web Speech works best in Chrome/Edge and degrades
  to text elsewhere. A cloud STT/TTS upgrade can slot in behind the provider system.
- **Artifacts run model-written code.** They render in a cross-origin-style
  sandboxed iframe (`allow-scripts` only, no same-origin), so that code can't
  reach the app's cookies, DOM, or storage.

---

## Project layout

```
.  (repo root — the submission)
├── apps/web/          Next.js app — workbench, settings, gallery, API routes
├── services/agent/    Claude Agent SDK service (Hono, SSE) + the five tools
├── pipeline/ingest/   PDF → pages → captions → chunks → vector index
├── packages/
│   ├── shared/        types + the SSE event protocol + ask/artifact specs
│   ├── db/            SQLite + sqlite-vec + encrypted provider keys
│   └── embed/         local Transformers.js embeddings
├── scripts/           bake-seed-db.sh — rebuild the committed key-free catalog
├── data/              committed: seed.db + page/hero images (runtime db ignored)
├── files/             the Vulcan OmniPro 220 manuals
├── docs/              architecture, artifacts, voice, deployment, video walkthrough
└── challenge/         the original Prox challenge brief (archived)
```

See [docs/video-walkthrough.md](docs/video-walkthrough.md) for the demo script
this README's video links to.
