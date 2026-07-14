# Adding a product

The system is product-agnostic. A product is a slug, some metadata, and a knowledge graph + Profile built from everything you dropped in one folder.

## Command

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

Drop **one folder** holding everything for the product. The pipeline scans it recursively and classifies each file by extension:

- **`.pdf`** → rendered + read page-by-page (the manuals).
- **`.stl` / `.stp` / `.step` / `.3mf` / `.glb` / `.gltf`** → converted to `.glb` (STEP via an OpenCascade wasm tessellator) and indexed as 3D `mesh` media. The immediate parent folder is the part's **subsystem** (e.g. `Frame/`, `Nextruder/`); files sitting directly in the drop folder have no subsystem.
- **`.gcode` / `.bgcode`** → catalogued in `resources.json` (`gcode`).
- **`.mp4` / `.mov` / `.webm` / `.mkv`** → the first one becomes the walkthrough video (chaptered into timestamped clips).
- **`.png` / `.jpg` / `.jpeg` / `.webp` / `.gif`** → indexed as `image` media.
- **anything else** → catalogued in `resources.json` (`other`).

Provider/model resolve automatically: `--provider` (or the first builtin — Anthropic / OpenAI / MiniMax — with an env key present), and `--model` (or that provider's default). Vision is required (captioning + product detection + video chaptering).

## What it does

1. Renders each PDF page to a PNG (mupdf, 2× scale).
2. **Detects the product** — one vision call on the first page fills in any name / manufacturer / summary you didn't pass.
3. Reads each page with the vision model — the full text (tables as markdown, every diagram described) AND a structured parse: the parts, specs (with their exact values and units), symptoms, procedures, warnings, and figures on that page. Cached in the DB, so re-runs skip unchanged pages.
4. **Authors the Profile** — writes `data/products/<slug>/`, a folder of OKF-style markdown (one concept per manual), the human-readable export. Media (rendered pages, meshes, video clips, images) is registered in `.index/media.json`.
5. **Builds the knowledge graph** — deterministically (no LLM): typed entities and edges from the page parses, page-text chunks, and every media item, all embedded locally (`bge-small`, no API key) into SQLite. A linking cascade then connects meshes/videos to the parts and procedures they depict, even when names don't match exactly. Runtime does **zero** processing.

## Re-running

Page captions are cached in the DB and reused on re-runs, so re-ingesting an unchanged manual skips the expensive vision pass. The Profile bundle is rebuilt from scratch each run. Use `pnpm db:reset` to wipe the local DB.

## After ingest

The product appears in the picker and the settings list automatically — the agent reads the catalog from the database at request time, so there's no redeploy. The canonical record is the Profile bundle at `data/products/<slug>/` (its `overview.md` holds the product's name, maker, and summary).

## Tips for good retrieval

- Filenames matter only for manual-kind detection and part names; content is what's indexed.
- Group 3D files into subsystem-named subfolders — that folder name becomes the part's subsystem, which helps the cross-modal linker connect meshes to the right parts.
- Image-heavy manuals (schematics, charts) benefit most — the vision pass is where the value is.
- Captioning is the API-cost step. A 48-page manual is a few minutes and a few cents.
