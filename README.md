# Takt

**An AI that actually understands your product — and answers, shows, and talks like it.**

Takt turns a product's scattered documentation — manuals, spec sheets, diagrams,
photos, video, and 3D models — into **captioned markdown an AI can search, cite, and
reason over**, plus a flat index of every figure, 3D part, and video clip. Ask it
anything in chat or by voice; it answers grounded in the real docs, cites the exact
page, and composes a **designed, full-page answer** — cropped and annotated figures,
the interactive 3D part, specs, and step-by-step guides — when a picture beats a
paragraph.

![Takt answering a grounded, cited question — 25% duty cycle at 200A / 240V, cited to p.7 and p.19](docs/media/hero.png)

Every citation is real. Click one and the exact manual page opens — here, page 7's
spec table confirms the *25% @ 200A* the answer quoted, so you can check the source
yourself:

![Clicking a citation opens the exact manual page it came from](docs/media/source-page.png)

> Built around one idea most assistants get wrong: product knowledge should stay
> **human- and AI-readable** — plain markdown you can open and edit is the source of
> truth. From it Takt compiles a transparent, regenerable **search index + media
> index** (vision captions inlined next to their page images, every figure/part/clip
> catalogued), so answers are grounded in the product's real docs, not a black-box
> embedding blob.

---

## What it does

- **Grounded, cited answers.** Every spec, setting, or step is pulled from the product's
  own docs and cited to its source — never guessed. If the docs don't cover it, it says so.
- **Shows the real page.** Diagrams, schematics, duty-cycle tables, control panels — it
  surfaces the actual manual page and crops the exact region that matters.
- **Understands images, not just text.** A vision pass reads every page — transcribing
  tables, describing diagrams, and capturing what each figure answers — so image-only
  content becomes fully searchable.
- **Designs the answer, full-page.** The canvas isn't a wall of text — Takt writes a
  raw HTML page (headline, cropped and *annotated* figures, the interactive 3D part, spec
  tables, step-by-step guides, live calculators), streamed token-by-token and rendered
  directly in the app (no iframe), held to a consistent design system by a built-in
  anti-slop check.
- **Talks.** On-device voice mode: speak to it, it speaks back, and with the camera on it
  can look at what you're looking at.
- **Asks before guessing.** When a choice would change the answer, it asks a short
  multiple-choice question first — sometimes with its own little diagram.
- **Multi-product.** Point it at one product or let it answer and compare across your whole
  catalog.

|  |  |
|---|---|
| ![A designed, full-page answer the agent composed on the canvas](docs/media/artifact.png) | ![A product's Profile: its knowledge as readable markdown](docs/media/profile.png) |
| *Composes designed, full-page answers on the canvas* | *Every product's knowledge is readable markdown you can edit* |

---

## The idea: markdown you own + an index compiled from it

Each product's knowledge lives in a **Profile** — a folder of
[OKF](https://okf.md/)-style markdown (`data/products/<slug>/`), one concept per source,
with the vision captions inlined next to their page images. It's **canonical and
human-editable**: open a `.md`, fix a fact, re-ingest, and it's live.

From that markdown Takt compiles an index under `.index/` — a regenerable artifact, never
the source of truth:

```
chunks.json        → text units for lexical + semantic search
vectors.bin        → local embeddings (Xenova MiniLM, 384-dim, no API key), a flat
                     Float32 array loaded into memory once
vectors.meta.json  → the sidecar for vectors.bin (model, dim, ids, kinds)
media.json         → a flat media index: every page, 3D mesh, video clip, and image
                     with its /assets URL + caption
```

Retrieval is **hybrid**: semantic search over the chunks blended with a lexical grep for
exact codes and part numbers (`search_product`), plus a cosine scan of the media index for
the right figure/part/clip (`get_media`). It stays **transparent and regenerable** — delete
the `.index/` and re-ingest any time; a markdown-only product still answers via grep. See
[docs/architecture.md](docs/architecture.md).

---

## Run it

**Hosted:** if you have a live Space, open it, go to **Settings → Providers**, paste your
own API key (Anthropic, OpenAI, or MiniMax), and start asking. (A free Space sleeps when
idle, so the first request may take ~30–60s to wake. See
[docs/hosting.md](docs/hosting.md) to deploy your own.)

**Local**, in under two minutes:

```bash
git clone <this-repo> && cd takt
cp .env.example .env          # add one of ANTHROPIC_/OPENAI_/MINIMAX_API_KEY for ingest
pnpm install
pnpm dev                      # web on :3000, agent on :8787
```

Open http://localhost:3000. A fresh clone ships with an **empty catalog** — the runtime DB
(`data/takt.db`) is created from the schema on first boot — so your first step is to add a
product:

```bash
pnpm ingest ./path/to/product-folder
```

Drop one folder holding everything (PDF manuals, STL 3D models, a walkthrough video,
images), and Takt does the rest (see [Add a product](#add-a-product)). Once it's in, pick
it in the picker and ask. Semantic search downloads a small local embedding model on first
use (no API key) and quietly falls back to lexical grep if it can't.

Questions to try, once you've ingested a welder manual:

- *"What's the duty cycle for MIG welding at 200A on 240V?"*
- *"I'm getting porosity in my flux-cored welds. What should I check?"*
- *"What polarity setup do I need for TIG? Which socket does the ground clamp go in?"*

![Live voice mode — speak to Takt and it answers out loud](docs/media/voice.png)

---

## Add a product

One fully-automatic command. Drop **one folder** holding everything — PDF manuals, STL 3D
models (in subsystem subfolders), a walkthrough video, images, gcode — and point ingest at
it:

```bash
pnpm ingest ./path/to/product-folder
```

It auto-detects each file type, **vision-detects the product identity** (name, maker,
summary from the manual cover), renders and captions every page, authors the Profile
markdown, and builds the search + media index — so runtime needs zero processing. Override
anything it guesses with optional flags:

```bash
pnpm ingest ./path/to/product-folder \
  --name "<Name>" --manufacturer "<Maker>" --summary "<one line>" \
  --hero ./photo.webp --provider openai --model gpt-5-mini
```

The product shows up in the picker immediately — no redeploy. Full details in
[docs/adding-a-product.md](docs/adding-a-product.md).

---

## Under the hood

A pnpm monorepo:

| | |
|---|---|
| `apps/web` | Next.js UI + API routes |
| `services/agent` | the agent loop, tools, and live-voice WebSocket (Hono) |
| `pipeline/ingest` | offline loader: one folder → Profile + index (render → vision-caption → markdown → chunks + embeddings + media index; fold in 3D/video) |
| `packages/db` | SQLite metadata + connection |
| `packages/harness` | LLM provider adapters (Anthropic / OpenAI / MiniMax) |
| `packages/profile` | the OKF Profile store + the compiled index (chunks, embeddings, media) + hybrid retrieval |
| `packages/shared` | shared types + the SSE protocol |

The SQLite database holds only metadata + app state (catalog, chats); the product
knowledge is the markdown + compiled `.index/` in `data/products/`. Full architecture and
the SSE protocol are in [docs/architecture.md](docs/architecture.md); hosting on a free
Hugging Face Space is in [docs/hosting.md](docs/hosting.md).

---

## License

See [LICENSE](LICENSE).
