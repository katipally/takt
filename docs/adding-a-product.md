# Adding a product

Takt is product-agnostic. A product is a slug, some metadata, and a knowledge graph + Profile
built from everything you dropped in one folder. There are two ways to add one, and both do
the same work.

## From the /admin console

Go to `/admin` (type it in the URL) → **Products & ingestion**. Name the product, drop one
folder or pick files, optionally paste source links (web pages, YouTube) and a hero image,
then add it. For anything that needs paid vision work (PDFs, images, video) Takt shows a cost
estimate first (vision-unit count, model, approximate dollars) and only runs after you
confirm. Progress streams live, ending with `Indexed ✓ · N pages · $cost`. Existing products
are listed here too, each with its knowledge-graph stats, and deletable.

The console is gated by `TAKT_ADMIN_TOKEN` when deployed, and open in local dev.

## From the CLI

```bash
pnpm ingest <folder> \
  [--name "<Display Name>"] \     # optional; vision-detected from the cover if omitted
  [--slug <slug>] \               # optional; derived from the name if omitted
  [--manufacturer "<Maker>"] \    # optional; vision-detected if omitted
  [--summary "<one line>"] \      # optional; vision-detected if omitted
  [--hero <image-file>] \         # optional product photo
  [--provider <id>] \             # optional; defaults to the first env key present
  [--model <id>]                  # optional; defaults to the provider's default model
```

Provider and model resolve automatically: `--provider` (or the first builtin with an env key
present, Anthropic / OpenAI / MiniMax), and `--model` (or that provider's default). Vision is
required for captioning, product detection, and video chaptering.

## What gets classified

The pipeline scans the folder recursively and sorts each file by extension:

- **`.pdf`** rendered and read page by page (the manuals).
- **`.stl` / `.stp` / `.step` / `.3mf` / `.glb` / `.gltf`** converted to `.glb` (STEP via an
  OpenCascade wasm tessellator) and indexed as 3D `mesh` media. The immediate parent folder is
  the part's subsystem (e.g. `Frame/`, `Nextruder/`); files sitting directly in the drop
  folder have no subsystem.
- **`.mp4` / `.mov` / `.webm` / `.mkv`** every video is chaptered into timestamped clips and
  linked (not only the first one).
- **`.mp3` / `.wav` / `.m4a` / `.aac` / `.flac` / `.ogg`** transcribed so spoken content
  becomes searchable text.
- **`.png` / `.jpg` / `.jpeg` / `.webp` / `.gif`** indexed as `image` media.
- **`.gcode` / `.bgcode`** catalogued in `resources.json` (`gcode`).
- **`.obj`** catalogued as a `3d-source` resource.
- **anything else** catalogued in `resources.json` (`other`).

From the `/admin` form you can also paste source URLs, so web pages and YouTube links get
pulled in alongside the folder.

## What it does

1. Renders each PDF page to a PNG (mupdf, 2x scale).
2. **Detects the product.** One vision call on the first page fills in any name / manufacturer
   / summary you didn't pass.
3. **Reads each page** with the vision model: the full text (tables as markdown, every diagram
   described) plus a structured parse of the parts, specs (with exact values and units),
   symptoms, procedures, warnings, and figures on that page. Cached in the DB, so re-runs skip
   unchanged pages.
4. **Authors the Profile.** Writes `data/products/<slug>/`, a folder of OKF-style markdown (one
   concept per source), the human-readable export. Media (pages, meshes, clips, images) is
   registered in `.index/media.json`.
5. **Builds the knowledge graph** deterministically (no LLM): typed entities and edges from the
   page parses, page-text chunks, and every media item, all embedded locally (`bge-small`, no
   API key) into SQLite. A linking cascade then connects meshes and videos to the parts and
   procedures they depict, even when names don't match exactly.

Runtime does zero processing.

## Re-running

Page captions are cached in the DB and reused, so re-ingesting an unchanged manual skips the
expensive vision pass. The Profile bundle is rebuilt from scratch each run. Use `pnpm db:reset`
to wipe the local DB.

## After ingest

The product appears in the picker and the settings list automatically. The agent reads the
catalog from the database at request time, so there's no redeploy. The canonical record is the
Profile bundle at `data/products/<slug>/` (its `overview.md` holds the name, maker, and
summary).

## Tips for good retrieval

- Filenames matter only for manual-kind detection and part names. Content is what's indexed.
- Group 3D files into subsystem-named subfolders. That folder name becomes the part's
  subsystem, which helps the cross-modal linker connect meshes to the right parts.
- Image-heavy manuals (schematics, charts) benefit most. The vision pass is where the value is.
- Captioning is the API-cost step. A 48-page manual is a few minutes and a few cents.
