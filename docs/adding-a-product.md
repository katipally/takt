# Adding a product

The system is product-agnostic. A product is just a slug, some metadata, and a set of indexed manuals.

Two ways: the **in-app uploader** (Settings → Products — drop PDFs, source URLs, 3D `.stl` models, a walkthrough video, and a hero image; it streams progress and shows the cost) or the **CLI**.

## Command

```bash
pnpm ingest \
  --product <slug> \
  --name "<Display Name>" \
  --model <vision-model> \        # REQUIRED, e.g. gpt-5-mini / claude-sonnet-5
  --dir <folder-with-pdfs> \      # PDFs: rendered + read page-by-page
  --url <link> [--url <link>] \   # web pages / YouTube, ingested as text
  --models <folder-with-stls> \   # 3D part models (.stl → converted to .glb)
  --video <file> \                # a repair/walkthrough video
  --manufacturer "<Maker>" \
  --summary "<one line>" \
  --hero <image-file> \           # optional product photo
  --provider <id>                 # optional; defaults to the first env key present
```

Required: `--product`, `--model`, and at least one source (`--dir` or `--url`).

## What it does

1. Detects the manual kind from the filename (`owner` / `quick_start` / `selection_chart` / `other`).
2. Renders each page to a PNG (mupdf, 2× scale).
3. Reads each page with the chosen **vision model** and stores the result as the page caption — full text, tables as markdown, and a description of every diagram/photo and the question it answers.
4. **Authors the Profile** — writes `data/products/<slug>/`, a folder of OKF-style markdown (one concept per source). This is the **canonical, human-editable store**.
5. **Compiles the PKB** (`data/products/<slug>/.pkb/`) — a per-page extraction pass builds the product **knowledge graph** (entities + edges + hyperedges, with confidence tiers), plus text chunks and local embeddings. 3D models are folded in as interactive part anchors, and the video as timestamped clips.

At query time the agent retrieves **hybrid**: the knowledge graph first (`find_entity` → `walk_graph` → `get_anchors`), semantic search for described symptoms (`search_product`), and grep for exact codes/part numbers — fused by `query_product`. A markdown-only product (no `.pkb`) still works via grep. To edit knowledge, edit the `.md` and rebuild the index with `pnpm pkb:build <slug>`; check OKF conformance with `pnpm profile:build <slug> --check`. View a product's Profile at `/profile/<slug>`, and its resources + knowledge graph on the landing page.

## Re-running

Page captions are cached in the DB and reused on re-runs, so re-ingesting an unchanged manual skips the expensive vision pass. Extraction (the graph build) currently re-runs each time. To rebuild just the graph from existing markdown: `pnpm pkb:build <slug>` (add `--reindex` to only refresh embeddings). Use `pnpm db:reset` to wipe the local DB and rebuild from scratch.

## After ingest

The product appears in the picker and the settings list automatically — the agent reads the catalog from the database at request time, so there's no redeploy. The canonical record is the Profile bundle at `data/products/<slug>/` (its `overview.md` holds the product's name, maker, and summary).

## Tips for good retrieval

- Filenames matter only for kind detection; content is what's indexed.
- Image-heavy manuals (schematics, charts) benefit most from this pipeline — the vision pass is where the value is.
- Captioning is the API-cost step. A 48-page manual is a few minutes and a few cents.
