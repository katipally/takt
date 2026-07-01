# Prox: an AI product specialist

Prox answers deep technical questions about a physical product, grounded in its
manuals, cited to the page, and drawn as interactive views when text isn't the
clearest way to explain something. It's built on the Claude Agent SDK. The seed
product is the Vulcan OmniPro 220 multiprocess welder, whose 48-page owner's
manual, quick-start guide, and selection chart live in `files/`.

- Live demo (no setup): https://yash3471-prox.hf.space
- Video walkthrough: https://drive.google.com/file/d/1-kyqqg_7HIGBpc-uVfyB76p8DjTFWzoc/view?usp=sharing

## What this is

This is my submission for the Prox founding engineer challenge. The brief asked
for a multimodal agent that answers questions about the welder accurately and not
only in text. I treated it as a chance to reconstruct how a product like Prox
might actually work from end to end, based on what I understood of it, rather than
only satisfying the brief.

So beyond the required parts (grounded answers, surfaced manual pages, generated
interactive artifacts), I built several agentic features the brief didn't ask for:

- The agent asks clarifying questions before answering when a choice would change
  the result, and those questions can carry their own little diagrams.
- Artifacts are interactive and revisable. Ask for a change and the agent
  republishes a new version you can flip between, so the conversation drives the
  tool.
- Chat history is saved, and you can edit an earlier message to branch the
  conversation without losing the original.
- Voice input and spoken answers, image attachments, a per-product artifact
  gallery, multi-product support, and provider/model management from the UI.

I've marked which capabilities go past the brief in the sections below. The point
was to see how far a single API key and a local-first stack could go toward a
genuinely useful product specialist.

## What the brief asked for, and where it lives

The challenge brief is archived in [`challenge/`](challenge/README.md). Here's each
thing it tests, mapped to how Prox does it.

| The brief asks for | How Prox does it |
| --- | --- |
| **Deep technical accuracy**, incl. cross-referencing sections and handling ambiguous questions | `search_manual` does vector search over the manual text *and* over vision-written captions of every table and diagram, so cross-section lookups work. Every fact is cited to the page. Ambiguous questions trigger `ask_user` instead of a guess. `pnpm smoke` checks the brief's questions come back grounded and cited. |
| **Multimodal responses** (the most important part): draw diagrams, surface the exact manual image, generate interactive tools | `get_page_image` + `crop_page_image` pull the real page and crop to the region that matters. `emit_artifact` writes live React (a duty-cycle calculator, a settings configurator, a troubleshooting flowchart, a polarity/socket diagram) in a sandboxed frame. Every artifact is checked before it's shown (below). |
| **Tone**: a garage owner, not a pro welder | The system prompt answers plainly and practically, explains the "why" only when it helps do the task safely. |
| **Knowledge extraction** from text, tables, diagrams, schematics, and image-only content | The ingest pipeline renders each page, then Claude vision transcribes the text, rebuilds tables as markdown, and describes each diagram with the question it answers. That's what makes the selection chart, wiring schematic, and weld-defect photos searchable. |
| **Tech**: Claude Agent SDK, runs locally on one `.env` key, own API cost | Built on the Agent SDK. `cp .env.example .env && pnpm install && pnpm dev`. Ships with no key, so you (or the judge) plug in your own. |
| **Presentation**: a frontend, hosting, a clear README, a video | A full workbench UI, hosted on a free Hugging Face Space, this README, and the video linked above. |

Beyond that, the agent asks clarifying questions with their own diagrams, revises
artifacts on request, takes voice and image input, remembers and branches chats,
handles multiple products, and lets you add a new one from the UI with a cost
estimate first. Those are called out where they appear below.

## Demos

The full walkthrough is on [Google Drive](https://drive.google.com/file/d/1-kyqqg_7HIGBpc-uVfyB76p8DjTFWzoc/view?usp=sharing).
Below are short clips of individual features (they play inline on GitHub).

### Interactive artifacts
A settings or calculation question comes back as a live tool you can change, rendered in the panel.

<video src="https://github.com/katipally/prox-challenge/releases/download/demo-media/interactive_artifact.mp4" controls muted width="720"></video>

### The manual cropped into the answer
The agent crops the exact region of a manual page into the artifact instead of dropping in a whole page.

<video src="https://github.com/katipally/prox-challenge/releases/download/demo-media/crop_image.mp4" controls muted width="720"></video>

### Clarifying questions (added on top of the brief)
When a choice would change the answer, the agent asks first, with a diagram to help you choose.

<video src="https://github.com/katipally/prox-challenge/releases/download/demo-media/ask_user.mp4" controls muted width="720"></video>

## Run it

You don't have to clone anything. Open https://yash3471-prox.hf.space, go to
Settings, Providers, paste your own Anthropic API key (the brief says you plug in
your own), and start asking. A free Hugging Face Space sleeps when idle, so the
first request may take 30 to 60 seconds to wake.

To run locally instead, in under two minutes:

```bash
git clone <this-fork> && cd <fork>
cp .env.example .env          # paste your ANTHROPIC_API_KEY into .env
pnpm install
pnpm dev                      # web on :3000, agent on :8787
```

Open http://localhost:3000, pick the Vulcan OmniPro 220, and ask away.

There's no `pnpm seed` step. The welder is already indexed: a key-free catalog
(`data/seed.db`) and every rendered manual page ship in the repo and load on first
boot. The one cost left is a 90 MB local embedding model that downloads the first
time you ask a question, then stays cached. Re-indexing this product or adding a
new one is a single command (see [Adding a product](#adding-a-product)).

Questions from the brief to try:

- *"What's the duty cycle for MIG welding at 200A on 240V?"*
- *"I'm getting porosity in my flux-cored welds. What should I check?"*
- *"What polarity setup do I need for TIG? Which socket does the ground clamp go in?"*

Those three plus a handful of harder ones (an exact-amperage lookup, the wiring
schematic, an ambiguous question that should make it ask first) live in
`seed/golden-questions.json`. With the app running, `pnpm smoke` fires them at the
agent and checks each answer comes back grounded, cited, and not a refusal. It's a
quick confidence check, not a test suite.

## How the agent works

Prox is built around five tools the agent calls on its own. The system prompt
gives it four standing rules, Ground, Show, Draw, and Ask, so it behaves like a
cited specialist rather than a chatbot answering from memory.

### 1. Ground: cite every fact to the page

Before stating any spec, setting, or procedure, the agent calls `search_manual`.
That embeds the question and runs a vector search over the manual's text and over
the captions written for every diagram and table. Answers carry inline citations
like `[p.12]`, and clicking one opens the exact page it came from. When the manuals
don't cover something, the agent says so instead of guessing.

### 2. Show: surface the real manual page

When an answer leans on a diagram, schematic, control-panel photo, duty-cycle
matrix, or the process-selection chart, the agent calls `get_page_image`. The page
opens in the Canvas next to the chat, and the same image goes back to the model so
it can read charts the embedded text misses. This is how image-only content like
the wiring schematic and the weld-defect photos becomes answerable. When it puts a
figure inside an artifact, `crop_page_image` cuts a pixel-accurate crop of just the
relevant region on the server, so you see the polarity sockets or the panel control,
not a whole page with tab strips and white space.

### 3. Draw: generate live interactive tools

When the answer is a calculation, a multi-step decision, or a settings lookup, the
agent writes a small self-contained React component with `emit_artifact` and it
renders live in a sandboxed frame. Examples it produces: a duty-cycle calculator, a
settings configurator (process plus material plus thickness gives wire speed and
voltage), a troubleshooting flowchart, a polarity and socket diagram. Artifacts can
import real packages (`react`, `lucide-react`, `framer-motion`, `recharts`, `d3`,
`three`) via an import map and embed actual manual images. They're also versioned:
ask for a change and you get a new version to flip between (this is one of the
parts past the brief). The code is pushed into a sandboxed iframe by `postMessage`
and runs with `allow-scripts` only (no same-origin), so model-written code can't
reach the app's cookies, DOM, or storage. Before an artifact is shown it has to
compile and pass a set of checks (real manual-image URLs, no CSS-clipped crops,
citations inline rather than boxed, no broken markup). If it fails, the agent gets
the exact problems back and re-emits, so a broken artifact never reaches you.

### 4. Ask: clarify before guessing (beyond the brief)

When a request is ambiguous, or the answer depends on a choice the agent doesn't
know yet (process, material, thickness, input voltage), it calls `ask_user`. A
multiple-choice panel appears in the chat, and each question can carry an inline
diagram (an ASCII sketch or a small React drawing) to help you choose. You answer
and it continues with a grounded response. Dismiss the panel and it proceeds with
stated defaults.

### 5. Knowing its catalog

`list_products` lets the agent report which products it can answer about. The
catalog, the retrieval index, and the tools are all keyed by product, so a new
product is a drop-in with no code change.

### Around the agent (beyond the brief)

- Voice. Talk to it and have answers read back, using the browser's built-in
  speech APIs (best in Chrome and Edge, degrades to text elsewhere). No extra keys.
- Image input. Drag a photo of your setup or a weld defect into the composer and
  the agent sees it alongside the manuals.
- Streamed reasoning and live tool activity, with a context and cost meter each turn.
- Chat history with branching. Conversations persist, and editing a message forks
  the thread so you can compare answers.
- Model management. Set your Anthropic key and pick the chat and ingestion models
  from the UI; the picker lists your account's live models. Keys are AES-encrypted
  at rest and the browser only ever sees the last four digits.
- Add a product from the UI. Upload a manual's PDFs and Prox indexes them in place.
  Before it spends anything it shows the page count, the model it'll use, and an
  estimated cost to confirm. Each new product also gets its own starter questions,
  written from its manuals.

## Architecture

```mermaid
flowchart LR
    B["Browser"]
    subgraph web["Next.js web (:3000)"]
        UI["Workbench, settings, gallery"]
        Proxy["/api/chat SSE proxy"]
        Iframe["/artifact-host sandboxed iframe"]
        CRUD["CRUD API routes"]
    end
    subgraph agent["Agent service · Hono (:8787)"]
        Loop["Claude Agent SDK query() loop"]
        Tools["Tools: search_manual,<br/>get_page_image, emit_artifact,<br/>ask_user, list_products"]
    end
    DB[("SQLite + sqlite-vec<br/>data/prox.db")]
    PNG[/"data/pages/*.png"/]
    Claude["Claude API"]

    B <-->|"fetch + SSE"| web
    Proxy -->|"SSE"| agent
    Loop --> Tools
    Loop <-->|"messages"| Claude
    Tools --> DB
    CRUD --> DB
    UI --> PNG
```

The agent runs as a separate Node service because the Claude Agent SDK spawns a
`claude` subprocess, which needs a real Node runtime rather than a serverless
function. The web app proxies to it over SSE, which keeps the agent endpoint one
environment variable away from being swapped for a hosted container later (see
[deploy/HOSTING.md](deploy/HOSTING.md)). Locally, `pnpm dev` runs both with one
command.

The web layer and the agent share one SQLite file. That single file holds the whole
datastore: the product catalog, providers and models, chats, artifacts, and the
`sqlite-vec` vector index. Rendered manual pages are PNGs in `data/pages/`.

Stack: Next.js 16, React 19, and Tailwind v4 for the web; the Claude Agent SDK with
Hono for the agent; better-sqlite3 with sqlite-vec for storage; Transformers.js for
local embeddings; mupdf for PDF rendering. The full SSE protocol is in
[docs/architecture.md](docs/architecture.md).

## How knowledge is extracted

Dense manuals are mostly visual: duty-cycle matrices, wiring schematics, the
process-selection chart, weld-defect photos. Plain text extraction loses all of it.
So the ingest pipeline (`pipeline/ingest`) does four things per product:

1. Render every PDF page to a PNG with mupdf.
2. Read every page with Claude vision: transcribe the text, rebuild tables as
   markdown, and describe each diagram or photo along with the question it answers.
   That caption is what makes image-only content searchable.
3. Chunk the text and captions into roughly 500-token windows, each tagged with its
   page number.
4. Embed every chunk locally with `bge-small` (Transformers.js, no API key) and
   store it in `sqlite-vec`, partitioned by product.

At query time `search_manual` embeds the question and runs nearest-neighbor search
inside that product's partition, and `get_page_image` returns the original PNG and
shows it. The page number travels the whole way, which is what keeps citations
exact. More detail in [docs/architecture.md](docs/architecture.md) and
[docs/adding-a-product.md](docs/adding-a-product.md).

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

Re-running is idempotent, since captions and chunks are cached and unchanged pages
are skipped, so a re-run costs nothing. The product appears in the picker right
away. To refresh the committed key-free catalog after seeding, run
`scripts/bake-seed-db.sh`.

## Design decisions and tradeoffs

The whole thing is local-first. SQLite and local embeddings keep setup to a single
key, with the cost that the index is one file on disk. For multi-user hosting you'd
move to Turso or Postgres and object storage; the code sits behind a thin seam for
that (the agent is one env var away from being a separate container). Hosting on a
free Docker Space is covered in [deploy/HOSTING.md](deploy/HOSTING.md).

A few other choices worth calling out:

- The welder index ships pre-built as a key-free `data/seed.db`, copied to the
  runtime database on first boot, so a judge never waits on ingest or pays for it.
  The encrypted key and chat history live only in the gitignored runtime database,
  never in the repo or the deployed image.
- Hosting is a free Hugging Face Docker Space and costs nothing to run. It ships
  with no API key, so you paste your own.
- Voice uses the browser's Web Speech APIs, which work best in Chrome and Edge. A
  cloud speech service could slot in behind the same provider system.
- Artifacts run model-written code, so they render in a sandboxed iframe with
  `allow-scripts` only and no same-origin access. That code can't reach the app's
  cookies, DOM, or storage.

## Project layout

```
.                     repo root (the submission)
├── apps/web/         Next.js app: workbench, settings, gallery, API routes
├── services/agent/   Claude Agent SDK service (Hono, SSE) and the five tools
├── pipeline/ingest/  PDF to pages to captions to chunks to vector index
├── packages/
│   ├── shared/       types, the SSE event protocol, ask and artifact specs
│   ├── db/           SQLite, sqlite-vec, encrypted provider keys
│   └── embed/        local Transformers.js embeddings
├── scripts/          bake-seed-db.sh (rebuilds the key-free catalog), smoke.mjs (accuracy check), test-artifact-gate.mjs (artifact self-check)
├── data/             committed seed.db plus page and hero images (runtime db ignored)
├── files/            the Vulcan OmniPro 220 manuals
├── docs/             architecture (SSE protocol), adding-a-product
└── challenge/        the original Prox challenge brief, archived
```
