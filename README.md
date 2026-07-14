# Takt

**An AI that actually understands your product, and answers, shows, and talks like it.**

**Live demo: [yashwanttth-takt.hf.space](https://yashwanttth-takt.hf.space)** (bring your own
model key at [/admin](https://yashwanttth-takt.hf.space/admin); the demo product is the Prusa
MK4S handbook).

Takt takes a product's scattered docs (manuals, spec sheets, diagrams, photos, video,
3D models) and turns them into a typed knowledge graph plus readable markdown Profiles.
The graph holds parts, specs with their exact values, symptoms, procedures, and warnings,
cross-linked to the figures, 3D parts, and video clips that show them. Ask a question in
chat or by voice and you get an answer grounded in the real docs, cited to the exact page,
laid out as a designed full-page answer when a picture beats a paragraph.

![Takt composing a grounded, cited answer about the Prusa MK4S Selftest wizard, with the real LCD figure from page 18](docs/media/hero.png)

Every citation is real. Click one and the exact manual page opens, so you can check the
source yourself:

![Clicking a citation opens the exact manual page it came from](docs/media/source-page.png)

The idea underneath: product knowledge should stay inspectable and regenerable. A vision
pass reads every page into structured entities and captions. A deterministic build (no LLM)
compiles them into the graph, so the same input always produces the same graph. The markdown
Profiles stay plain files you can open, edit, and re-ingest.

---

## What it does

- **Grounded, cited answers.** Every spec, setting, or step comes from the product's own
  docs and is cited to its page. Nothing is guessed. If the docs don't cover it, Takt says so.
- **Shows the real page.** Diagrams, schematics, duty-cycle tables, control panels: Takt
  surfaces the actual manual page and crops the exact region that matters.
- **Reads the images too.** The vision pass transcribes tables, describes diagrams, and
  records what each figure answers, so image-only content becomes searchable.
- **Designs the answer, full-page.** Instead of a wall of text, Takt writes a raw HTML page
  (headline, cropped and annotated figures, the interactive 3D part, spec tables, step-by-step
  guides, live calculators) and renders it in a sandboxed iframe, held to a consistent design
  system.
- **Talks, fully on-device.** Live voice runs the whole voice stack in your browser (Silero
  VAD, Whisper, Kokoro TTS). No audio leaves your machine. The composer becomes a voice bar,
  you talk, it talks back, and it stops the moment you interrupt. Turn the camera on and it
  watches what you show it.
- **Shows things while it talks.** In a live call the agent can pin visuals over your view:
  the rotatable 3D part (with AR on phones), the exact manual figure, a repair clip, or a
  pointer note anchored to your camera view.
- **Asks before guessing.** When a choice would change the answer, it asks a short
  multiple-choice question first, sometimes with its own little diagram.
- **Multi-product.** Point it at one product, or let it answer and compare across your whole
  catalog.

|  |  |
|---|---|
| ![A designed, full-page answer the agent composed on the canvas](docs/media/artifact.png) | ![A product's Profile as readable markdown](docs/media/profile.png) |
| *Composes designed, full-page answers on the canvas, each fact cited to its page* | *Every product's knowledge is readable markdown you can edit* |

---

## The idea: a graph compiled deterministically, markdown you can read

Each product's knowledge is built twice from the same ingest.

**The knowledge graph** lives in SQLite. Typed entities (part, spec, symptom, procedure,
warning, figure, 3D part, video clip) carry their measured values, typed edges (`fixes`,
`references`, `shown_in`, `depicts`), page-text chunks, and media. Every row carries its own
local embedding (`Xenova/bge-small-en-v1.5`, 384-dim, no API key) plus FTS5. The build is
deterministic, no LLM in the compile, so the same part on five pages collapses to one node
and re-ingest is stable. A linking cascade then connects media across modalities (the 3D
mesh `depicts` the part, the video `references` the procedure).

**The Profile** is a folder of [OKF](https://okf.md/)-style markdown at
`data/products/<slug>/`, one concept per source, with vision captions inlined next to their
page images. It's human-readable and editable, and the agent's `read_profile` serves it
verbatim.

You can browse the whole graph right on the landing page. Drag to pan, scroll to zoom, click
a node to read it and hop through its connections. This is the same graph every answer walks.

![The knowledge graph explorer on the landing page, colour-coded by entity type](docs/media/graph-explorer.png)

Retrieval is hybrid: FTS5 catches exact codes and part numbers, embedding cosine catches
fuzzy symptoms in the user's words, and results are re-ranked so query-term coverage
dominates. The agent doesn't just search, it walks the graph: resolve "clicking noise" to the
symptom, hop `fixes` to the procedure, `shown_in` to the figure, `depicts` to the 3D part.
Everything is regenerable, since re-ingest rebuilds the whole graph transactionally. How
ingestion builds all this, and how it's stored, is in
[docs/ingestion.md](docs/ingestion.md).

---

## Try it

Open the live demo at **[yashwanttth-takt.hf.space](https://yashwanttth-takt.hf.space)** and
set two things at **[/admin](https://yashwanttth-takt.hf.space/admin)**: paste your own model
key under **Models & API keys** (Anthropic, OpenAI, or MiniMax), and add a product under
**Products & ingestion**. The demo set is the Prusa MK4S handbook. A free Space resets its
catalog when it redeploys, so if it's empty, add the product there. If the Space has been idle,
the first hit takes 30 to 60s to wake.

Questions to try:

- *"How do I run the Selftest calibration wizard?"*
- *"Which flexible print sheet should I use first?"*
- *"My extruder keeps clicking and filament won't come out. What should I check?"*

Then hit the waveform to talk to it, turn on your camera, and point it at the printer. It
draws on the live feed to show you what it means, and pins the 3D part right over what you're
holding:

|  |  |
|---|---|
| ![The agent drew an arrow and a ring on the live camera feed to point at what it's describing; the marks track as the camera moves](docs/media/live.png) | ![The rotatable 3D part floating inside the camera frame, over the live view](docs/media/live-3d.png) |
| *Draws marks straight on the camera feed, tracked to the object* | *Pins the rotatable 3D part in the frame (AR on phones)* |

Live mode does more than talk: on-device VAD, Whisper, and Kokoro; semantic end-of-turn
detection; barge-in with echo cancellation; and server-side grounding so a fast model still
cites the right page. The whole feature set is in [docs/live-mode.md](docs/live-mode.md).

### Run it locally

```bash
git clone <this-repo> && cd takt
cp .env.example .env          # add one of ANTHROPIC_/OPENAI_/MINIMAX_API_KEY for ingest
pnpm install
pnpm dev                      # web on :3000, agent on :8787
```

Open http://localhost:3000. A fresh clone ships with an empty catalog, so add a product from
`/admin` or `pnpm ingest <folder>` (see [Add a product](#add-a-product)), then pick it and
ask. To deploy your own Space, see [docs/hosting.md](docs/hosting.md).

---

## Add a product

Two ways in, both fully automatic. Drop **one folder** holding everything (PDF manuals, STL
3D models in subsystem subfolders, a walkthrough video, images, gcode) and Takt sorts it,
reads it, and builds the index.

**From the browser:** go to [/admin](https://yashwanttth-takt.hf.space/admin) → **Products &
ingestion**, name the product, drop the folder (or pick files), optionally paste source links
for web pages or YouTube, and add it. Takt shows the vision cost before anything paid runs,
then streams live progress.

![The /admin console: per-product knowledge stats and the add-product form](docs/media/admin-products.png)

**From the CLI:**

```bash
pnpm ingest ./path/to/product-folder
```

Either way it auto-detects each file type, vision-detects the product identity (name, maker,
summary from the manual cover), renders and captions every page, authors the Profile
markdown, and builds the search + media index. Runtime does zero processing. Override
anything it guesses with flags:

```bash
pnpm ingest ./path/to/product-folder \
  --name "<Name>" --manufacturer "<Maker>" --summary "<one line>" \
  --hero ./photo.webp --provider openai --model gpt-5-mini
```

The product shows up in the picker immediately, no redeploy. Full details in
[docs/adding-a-product.md](docs/adding-a-product.md).

---

## Connect over MCP

Takt exposes its grounded tools as an MCP server over Streamable HTTP, so Claude, ChatGPT, or
any MCP client can query a product's knowledge graph with the same tools the agent uses
(`list_products`, `find_entity`, `explore_entity`, `trace_path`, `search_product`,
`get_media`, `read_profile`). Point a client at the hosted server, or with Claude Code:

```bash
claude mcp add --transport http takt https://yashwanttth-takt.hf.space/mcp
```

Running locally, it's `http://localhost:3000/mcp`.

---

## Configure models and keys

Everything sensitive lives at [/admin](https://yashwanttth-takt.hf.space/admin) (typed URL
only, gated by `TAKT_ADMIN_TOKEN` when deployed, open in local dev). The **Models & API keys**
tab is where you paste provider keys
and choose the model for each job: a chat model for gathering, a compose model for the canvas,
a live-voice model, an ingestion (vision) model, and the reasoning effort. Keys are encrypted
at rest and only the last 4 digits are shown.

![The /admin Models & API keys tab: per-job model choice and encrypted key entry](docs/media/admin-models.png)

The end-user Settings dialog (the gear in the app) only lets people pick among providers that
already have a key. Adding keys and ingesting products stay behind `/admin`.

---

## Under the hood

A pnpm monorepo:

| | |
|---|---|
| `apps/web` | Next.js UI, API routes, the on-device voice stack, and the MCP server |
| `services/agent` | the agent loop, tools, and live-voice WebSocket (Hono) |
| `pipeline/ingest` | offline loader: one folder to Profile + knowledge graph |
| `packages/db` | SQLite: the graph (entities/edges/chunks/media + FTS5), catalog, chats, encrypted keys |
| `packages/harness` | LLM provider adapters (Anthropic / OpenAI / MiniMax) |
| `packages/profile` | the OKF Profile store, local embeddings, hybrid graph retrieval |
| `packages/shared` | shared types and the SSE + live-voice wire protocols |

The web app also runs the on-device voice stack (`apps/web/src/lib/live/`: Silero VAD, Whisper,
Kokoro, Smart-Turn, with the heavy models in a Web Worker) and the live UI
(`apps/web/src/components/live/`).

---

## Docs

- [architecture.md](docs/architecture.md): the whole system, with diagrams. Processes, the
  chat and live flows, the canvas, and the SSE protocol.
- [ingestion.md](docs/ingestion.md): how a folder becomes a knowledge graph, and how it's
  stored (the pipeline, the vision parse, the graph build, the SQLite schema).
- [live-mode.md](docs/live-mode.md): the full live voice feature set, on-device stack, and
  the `/live` protocol.
- [adding-a-product.md](docs/adding-a-product.md): the file-type table and the ingest flags.
- [design-standard.md](docs/design-standard.md): the canvas design system.
- [hosting.md](docs/hosting.md): deploying your own on a free Hugging Face Space (operator
  guide).

---

## License

See [LICENSE](LICENSE).
