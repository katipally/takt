# Takt

**An AI that actually understands your product — and answers, shows, and talks like it.**

Takt turns a product's scattered documentation — manuals, spec sheets, diagrams,
photos, video, and 3D models — into a **knowledge graph** an AI can search, cite, and
reason over. Ask it anything in chat or by voice; it answers grounded in the real docs,
cites the exact page, and composes a **designed, full-page answer** — cropped and
annotated figures, the interactive 3D part, specs, and step-by-step guides — when a
picture beats a paragraph.

![Takt answering a grounded, cited question — 25% duty cycle at 200A / 240V, cited to p.7 and p.19](docs/media/hero.png)

Every citation is real. Click one and the exact manual page opens — here, page 7's
spec table confirms the *25% @ 200A* the answer quoted, so you can check the source
yourself:

![Clicking a citation opens the exact manual page it came from](docs/media/source-page.png)

> Built around one idea most assistants get wrong: product knowledge should stay
> **human- and AI-readable** — plain markdown you can open and edit is the source of
> truth. From it Takt compiles a transparent, regenerable **knowledge graph + search
> index** (parts, faults, procedures, specs and how they connect), so answers are
> grounded in the product's real structure, not a black-box embedding blob.

---

## What it does

- **Grounded, cited answers.** Every spec, setting, or step is pulled from the product's
  own docs and cited to its source — never guessed. If the docs don't cover it, it says so.
- **Shows the real page.** Diagrams, schematics, duty-cycle tables, control panels — it
  surfaces the actual manual page and crops the exact region that matters.
- **Understands images, not just text.** A vision pass reads every page — transcribing
  tables, describing diagrams, and capturing what each figure answers — so image-only
  content becomes fully searchable.
- **Designs the answer, full-page.** The canvas isn't a wall of text — Takt composes an
  editorial, full-bleed page (headline, cropped and *annotated* figures, the interactive
  3D part, spec tables, step-by-step guides, live calculators) in a sandboxed frame, held
  to a consistent design system by a built-in anti-slop check.
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

## The idea: markdown you own + a graph compiled from it

Each product's knowledge lives in a **Profile** — a folder of
[OKF](https://okf.md/)-style markdown (`data/products/<slug>/`), one concept per source,
with the vision captions inlined next to their page images. It's **canonical and
human-editable**: open a `.md`, fix a fact, rebuild the index, and it's live.

From that markdown Takt compiles a **PKB** (`.pkb/`) — a regenerable index, never the
source of truth:

```
graph.json    → the knowledge graph: parts, faults, procedures, specs + how they
                connect, each tied to its media (a page crop, a 3D part, a video clip)
chunks.json   → text units for lexical + semantic search
vectors.json  → local embeddings (Xenova MiniLM, no API key)
```

Retrieval is **hybrid**: traverse the graph from the entity the question is about, blend
in semantic search for symptoms described in the user's own words, and fall back to grep
for exact codes and part numbers. It stays **transparent and regenerable** — delete the
`.pkb` and rebuild it (`pnpm pkb:build <slug>`) any time; a markdown-only product still
answers via grep. See [docs/architecture.md](docs/architecture.md).

---

## Run it

**Hosted:** open the [live Space](https://yash3471-takt.hf.space), go to
**Settings → Providers**, paste your own Anthropic API key, and start asking. (A free
Space sleeps when idle, so the first request may take ~30–60s to wake.)

**Local**, in under two minutes:

```bash
git clone <this-repo> && cd takt
cp .env.example .env          # optional: put ANTHROPIC_API_KEY here for CLI ingest
pnpm install
pnpm dev                      # web on :3000, agent on :8787
```

Open http://localhost:3000, pick a product, and ask. There's no seeding step — a key-free
catalog (`data/seed.db`), the rendered manual pages, and each product's Profile + compiled
`.pkb` (`data/products/`) ship in the repo and load on first boot. It works offline out of
the box (grep + the prebuilt knowledge graph); semantic search downloads a small local
embedding model on first use (no API key) and quietly falls back to lexical if it can't.

Questions to try (Vulcan OmniPro 220 welder):

- *"What's the duty cycle for MIG welding at 200A on 240V?"*
- *"I'm getting porosity in my flux-cored welds. What should I check?"*
- *"What polarity setup do I need for TIG? Which socket does the ground clamp go in?"*

![Live voice mode — speak to Takt and it answers out loud](docs/media/voice.png)

---

## Add a product

Upload its manuals — plus source URLs, 3D part models (`.stl`), and a walkthrough video —
in-app (**Settings → Products**). Takt renders the pages, reads them with vision, writes
the Profile, builds the knowledge graph, and the product shows up in the picker
immediately (with its resources + explorable graph on the landing page). Or from the CLI:

```bash
pnpm ingest --product <slug> --name "<Name>" --manufacturer "<Maker>" \
  --dir ./path/to/pdfs --models ./stls --video ./walkthrough.mp4 \
  --hero ./photo.webp --model gpt-5-mini
```

Full details in [docs/adding-a-product.md](docs/adding-a-product.md).

---

## Under the hood

A pnpm monorepo:

| | |
|---|---|
| `apps/web` | Next.js UI + API routes |
| `services/agent` | the agent loop, tools, and live-voice WebSocket (Hono) |
| `pipeline/ingest` | offline loader: docs → Profile + PKB (render → vision-caption → markdown → extract graph + embeddings; fold in 3D/video) |
| `packages/db` | SQLite metadata + connection |
| `packages/harness` | LLM provider adapters (Anthropic / OpenAI / Google) |
| `packages/profile` | the OKF Profile store + the compiled PKB (graph, chunks, embeddings) + hybrid retrieval |
| `packages/shared` | shared types + SSE / UI-surface (Page) specs |

The SQLite database holds only metadata + app state (catalog, chats); the product
knowledge is the markdown + compiled `.pkb` in `data/products/`. Full architecture and the SSE
protocol are in [docs/architecture.md](docs/architecture.md); hosting on a free Hugging
Face Space is in [docs/hosting.md](docs/hosting.md).

---

## License

See [LICENSE](LICENSE).
