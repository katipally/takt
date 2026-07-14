# Takt

**An AI that actually understands your product — and answers, shows, and talks like it.**

Takt turns a product's scattered documentation — manuals, spec sheets, diagrams,
photos, video, and 3D models — into a **typed knowledge graph** (parts, specs with
their exact values, symptoms, procedures, warnings — cross-linked to the figures,
3D parts, and video clips that show them) plus human-readable markdown Profiles.
Ask it anything in chat or by voice; it answers grounded in the real docs, cites
the exact page, and composes a **designed, full-page answer** — cropped and
annotated figures, the interactive 3D part, specs, and step-by-step guides — when
a picture beats a paragraph.

![Takt answering a grounded, cited question — 25% duty cycle at 200A / 240V, cited to p.7 and p.19](docs/media/hero.png)

Every citation is real. Click one and the exact manual page opens — here, page 7's
spec table confirms the *25% @ 200A* the answer quoted, so you can check the source
yourself:

![Clicking a citation opens the exact manual page it came from](docs/media/source-page.png)

> Built around one idea most assistants get wrong: product knowledge should stay
> **inspectable and regenerable**. A vision pass reads every page into structured
> entities and captions; a **deterministic build** (no LLM) compiles them into the
> knowledge graph, so the same input always produces the same graph — and the
> markdown Profiles remain plain files you can open, edit, and re-ingest.

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
  tables, step-by-step guides, live calculators), rendered as a finished page in a
  sandboxed iframe and held to a consistent design system.
- **Talks — fully on-device.** Live voice mode runs the whole voice stack in your browser
  (Silero VAD, Whisper, Kokoro TTS — no audio ever leaves your machine). The composer
  morphs into a voice bar, you talk, it talks back; interrupt it mid-sentence and it stops.
  With the camera on it watches what you're showing it, live.
- **Shows things while it talks.** In a live call the agent can pin visuals over your
  view — the rotatable 3D part (with AR placement on phones), the exact manual figure, a
  repair clip, or a pointer note anchored on your camera view ("that lever, right here").
- **Asks before guessing.** When a choice would change the answer, it asks a short
  multiple-choice question first — sometimes with its own little diagram.
- **Multi-product.** Point it at one product or let it answer and compare across your whole
  catalog.

|  |  |
|---|---|
| ![A designed, full-page answer the agent composed on the canvas](docs/media/artifact.png) | ![A product's Profile: its knowledge as readable markdown](docs/media/profile.png) |
| *Composes designed, full-page answers on the canvas* | *Every product's knowledge is readable markdown you can edit* |

---

## The idea: a knowledge graph compiled deterministically, markdown you can read

Each product's knowledge is built twice from the same ingest:

- **The knowledge graph** (in SQLite) — typed entities (part / spec / symptom /
  procedure / warning / figure / 3D part / video clip) with their measured values,
  typed edges (`fixes`, `references`, `shown_in`, `depicts`, …), page-text chunks, and
  media — every row carrying its own local embedding
  (`Xenova/bge-small-en-v1.5`, 384-dim, no API key) plus FTS5. The build is
  **deterministic** — no LLM in the compile, so the same part on five pages collapses
  to one node and re-ingest is stable. A linking cascade then connects media across
  modalities (the 3D mesh `depicts` the part; the video `references` the procedure).
- **The Profile** — a folder of [OKF](https://okf.md/)-style markdown
  (`data/products/<slug>/`), one concept per source, vision captions inlined next to
  their page images. Human-readable and editable; the agent's `read_profile` serves it
  verbatim.

Retrieval is **hybrid**: FTS5 (exact codes, part numbers) fused with embedding cosine
(fuzzy symptoms in the user's words), re-ranked so query-term coverage dominates. The
agent doesn't just search — it **walks the graph**: resolve "clicking noise" to the
symptom, hop `fixes` to the procedure, `shown_in` to the figure, `depicts` to the 3D
part. Everything is regenerable: re-ingest rebuilds the whole graph transactionally.
See [docs/architecture.md](docs/architecture.md).

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

## Talk to it

Hit the waveform button in the composer. The first call downloads the voice models
(one-time, cached; a progress bar shows exactly what and how much), then the composer
morphs into a voice bar and you just talk — it listens, answers out loud, and stops the
moment you interrupt. Everything speech runs **in your browser** (WebGPU when available);
the server only ever sees text. Turn the camera on and it watches live — ask "what's this
part?" while holding it up, and it can pin the 3D model or the manual's figure over your
view while it explains.

---

## Under the hood

A pnpm monorepo:

| | |
|---|---|
| `apps/web` | Next.js UI + API routes |
| `services/agent` | the agent loop, tools, and live-voice WebSocket (Hono) |
| `pipeline/ingest` | offline loader: one folder → Profile + knowledge graph (render → vision-parse every page → deterministic graph build → embed → cross-modal link; STL/STEP/3MF → GLB, video → chaptered clips) |
| `packages/db` | SQLite: the knowledge graph (entities/edges/chunks/media + FTS5), catalog, chats, encrypted provider keys |
| `packages/harness` | LLM provider adapters (Anthropic / OpenAI / MiniMax) |
| `packages/profile` | the OKF Profile store + local embeddings + hybrid graph retrieval |
| `packages/shared` | shared types + the SSE and live-voice wire protocols |

The web app also runs the on-device voice stack (`apps/web/src/lib/live/` — VAD, Whisper,
Kokoro in a Web Worker) and the live UI (`apps/web/src/components/live/`). Full
architecture, the live protocol, and the SSE protocol are in
[docs/architecture.md](docs/architecture.md); hosting on a free Hugging Face Space is in
[docs/hosting.md](docs/hosting.md).

---

## License

See [LICENSE](LICENSE).
