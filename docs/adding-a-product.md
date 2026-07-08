# Adding a product

The system is product-agnostic. A product is a slug, some metadata, and an indexed bundle of everything you dropped in one folder.

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
- **`.stl`** → converted to `.glb` and indexed as 3D `mesh` media. The immediate parent folder is the part's **subsystem** (e.g. `Frame/`, `Nextruder/`); STLs sitting directly in the drop folder have no subsystem.
- **`.stp` / `.step`** → catalogued in `resources.json` (`3d-source`). Not tessellated — there is no dependency-free STEP reader; most have an `.stl` sibling anyway.
- **`.gcode` / `.bgcode`** → catalogued in `resources.json` (`gcode`).
- **`.mp4` / `.mov` / `.webm` / `.mkv`** → the first one becomes the walkthrough video (chaptered into timestamped clips).
- **`.png` / `.jpg` / `.jpeg` / `.webp` / `.gif`** → indexed as `image` media.
- **anything else** → catalogued in `resources.json` (`other`).

Provider/model resolve automatically: `--provider` (or the first builtin — Anthropic / OpenAI / MiniMax — with an env key present), and `--model` (or that provider's default). Vision is required (captioning + product detection + video chaptering).

## What it does

1. Renders each PDF page to a PNG (mupdf, 2× scale).
2. **Detects the product** — one vision call on the first page fills in any name / manufacturer / summary you didn't pass.
3. Reads each page with the vision model and stores the result as the page caption (full text, tables as markdown, a description of every diagram/photo and the question it answers). Captions are cached in the DB.
4. **Authors the Profile** — writes `data/products/<slug>/`, a folder of OKF-style markdown (one concept per manual). This is the **canonical, human-editable store**. Each rendered page also becomes a `page` entry in the media index.
5. **Folds in media** — 3D meshes, the video's clips, and loose images all land in a single flat media index (`page` / `mesh` / `video_clip` / `image`). Catalogued misc files are listed in `resources.json`.
6. **Builds the compiled index once** (`data/products/<slug>/.index/`) — chunks the authored markdown and embeds chunks + media captions into one binary vector store. Runtime does **zero** processing: it greps the markdown and cosine-scans the vectors.

## Re-running

Page captions are cached in the DB and reused on re-runs, so re-ingesting an unchanged manual skips the expensive vision pass. The Profile bundle is rebuilt from scratch each run. Use `pnpm db:reset` to wipe the local DB.

## After ingest

The product appears in the picker and the settings list automatically — the agent reads the catalog from the database at request time, so there's no redeploy. The canonical record is the Profile bundle at `data/products/<slug>/` (its `overview.md` holds the product's name, maker, and summary).

## Tips for good retrieval

- Filenames matter only for manual-kind detection and part names; content is what's indexed.
- Group STLs into subsystem-named subfolders — that folder name becomes the part's subsystem in the media index.
- Image-heavy manuals (schematics, charts) benefit most — the vision pass is where the value is.
- Captioning is the API-cost step. A 48-page manual is a few minutes and a few cents.
