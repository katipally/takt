# Takt

**An AI that actually understands your product — and answers, shows, and talks like it.**

Takt turns a product's scattered documentation — manuals, spec sheets, diagrams,
photos, and (soon) video and 3D — into knowledge an AI can search, cite, and reason
over. Ask it anything in chat or by voice; it answers grounded in the real docs, shows
you the exact page, and builds live interactive tools (calculators, configurators,
diagrams) when a picture beats a paragraph.

![Takt answering a grounded, cited question — 25% duty cycle at 200A / 240V, cited to p.7 and p.19](docs/media/hero.png)

Every citation is real. Click one and the exact manual page opens — here, page 7's
spec table confirms the *25% @ 200A* the answer quoted, so you can check the source
yourself:

![Clicking a citation opens the exact manual page it came from](docs/media/source-page.png)

> Built around two ideas most assistants get wrong: product knowledge should be
> **human- and AI-readable** (plain markdown you can open and edit), and the agent
> should **search it like a person searches a codebase** — grep and read, not a black-box
> vector database.

---

## What it does

- **Grounded, cited answers.** Every spec, setting, or step is pulled from the product's
  own docs and cited to its source — never guessed. If the docs don't cover it, it says so.
- **Shows the real page.** Diagrams, schematics, duty-cycle tables, control panels — it
  surfaces the actual manual page and crops the exact region that matters.
- **Understands images, not just text.** A vision pass reads every page — transcribing
  tables, describing diagrams, and capturing what each figure answers — so image-only
  content becomes fully searchable.
- **Builds interactive artifacts.** When the answer is a calculation or a decision, it
  writes a live React tool (duty-cycle calculator, settings configurator, troubleshooting
  flowchart) that renders in a sandboxed panel — versioned, so "change it" gives you a new
  revision to flip between.
- **Talks.** On-device voice mode: speak to it, it speaks back, and with the camera on it
  can look at what you're looking at.
- **Asks before guessing.** When a choice would change the answer, it asks a short
  multiple-choice question first — sometimes with its own little diagram.
- **Multi-product.** Point it at one product or let it answer and compare across your whole
  catalog.

|  |  |
|---|---|
| ![An interactive artifact — a duty-cycle calculator the agent generated](docs/media/artifact.png) | ![A product's Profile: its knowledge as readable markdown](docs/media/profile.png) |
| *Generates live, interactive tools on demand* | *Every product's knowledge is readable markdown you can edit* |

---

## The idea: OKF Profiles + Direct Corpus Interaction

Each product's knowledge lives in a **Profile** — a folder of
[OKF](https://okf.md/)-style markdown (`data/products/<slug>/`), one concept per source,
with the vision captions inlined next to their page images. It's **canonical and
human-editable**: open a `.md`, fix a fact, and it's live on the next question.

The agent retrieves by **Direct Corpus Interaction** — the same loop a coding agent uses
on a codebase:

```
list_profile   → the map: which concepts exist, and the product's vocabulary
grep_profile   → search the markdown for a term (ranked, with line numbers)
read_profile   → read the concept in full, follow its links
```

No embeddings, no vector database, no separate index to keep in sync. The markdown *is*
the store — which means retrieval is transparent, instant, and the exact same files a
person can read. (Why not vector RAG? For a curated, product-sized corpus, grep-and-read
is simpler, faster, and more accurate — see [docs/architecture.md](docs/architecture.md).)

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
catalog (`data/seed.db`), the rendered manual pages, and each product's Profile
(`data/products/`) ship in the repo and load on first boot. No model download, no vector
index: retrieval is just the agent grepping the markdown.

Questions to try (Vulcan OmniPro 220 welder):

- *"What's the duty cycle for MIG welding at 200A on 240V?"*
- *"I'm getting porosity in my flux-cored welds. What should I check?"*
- *"What polarity setup do I need for TIG? Which socket does the ground clamp go in?"*

![Live voice mode — speak to Takt and it answers out loud](docs/media/voice.png)

---

## Add a product

Upload its manuals in-app (**Settings → Products**) — Takt renders the pages, reads them
with vision, writes the Profile, and the product shows up in the picker immediately. Or
from the CLI:

```bash
pnpm ingest --product <slug> --name "<Name>" --manufacturer "<Maker>" \
  --dir ./path/to/pdfs --hero ./photo.webp --model claude-sonnet-5
```

Full details in [docs/adding-a-product.md](docs/adding-a-product.md).

---

## Under the hood

A pnpm monorepo:

| | |
|---|---|
| `apps/web` | Next.js UI + API routes |
| `services/agent` | the agent loop, tools, and live-voice WebSocket (Hono) |
| `pipeline/ingest` | offline loader: docs → Profile (render → vision-caption → markdown) |
| `packages/db` | SQLite metadata + connection |
| `packages/harness` | LLM provider adapters (Anthropic / OpenAI / Google) |
| `packages/profile` | the OKF Profile store + grep — the retrieval layer |
| `packages/shared` | shared types + SSE/artifact specs |

The SQLite database holds only metadata + app state (catalog, chats, artifacts); the
product knowledge is the markdown in `data/products/`. Full architecture and the SSE
protocol are in [docs/architecture.md](docs/architecture.md); hosting on a free Hugging
Face Space is in [docs/hosting.md](docs/hosting.md).

---

## License

See [LICENSE](LICENSE).
