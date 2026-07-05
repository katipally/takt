# Adding a product

The system is product-agnostic. A product is just a slug, some metadata, and a set of indexed manuals.

## Command

```bash
pnpm ingest \
  --product <slug> \
  --name "<Display Name>" \
  --manufacturer "<Maker>" \
  --summary "<one line>" \
  --dir <folder-with-pdfs> \
  --hero <image-file>      # optional product photo
```

Only `--product` and `--dir` are required.

## What it does

1. Detects the manual kind from the filename (`owner` / `quick_start` / `selection_chart` / `other`).
2. Renders each page to a PNG (mupdf, 2× scale).
3. Reads each page with Claude vision and stores the result as the page caption — full text, tables as markdown, and a description of every diagram/photo and the question it answers.
4. **Authors the Profile** — writes `data/products/<slug>/`, a folder of OKF-style markdown (one concept per source, captions inlined next to their page images). This *is* the store: canonical, human-readable, editable. No chunking, no embeddings, no vector index.

At query time the agent retrieves by **Direct Corpus Interaction** — `list_profile` → `grep_profile` → `read_profile` over the markdown (the loop Claude Code uses on code). To edit a product's knowledge, just edit the `.md` directly — changes are live on the next message (grep reads the files). To check OKF conformance: `pnpm profile:build <slug> --check`. View a product's Profile at `/profile/<slug>`.

## Idempotency

Chunks are keyed by a content hash and page captions are reused on re-runs, so running ingest again only does new work. Use `pnpm db:reset` to wipe the local DB and rebuild from scratch.

## After ingest

The product appears in the picker and the settings list automatically — the agent reads the catalog from the database at request time, so there's no redeploy. The canonical record is the Profile bundle at `data/products/<slug>/` (its `overview.md` holds the product's name, maker, and summary).

## Tips for good retrieval

- Filenames matter only for kind detection; content is what's indexed.
- Image-heavy manuals (schematics, charts) benefit most from this pipeline — the vision pass is where the value is.
- Captioning is the API-cost step. A 48-page manual is a few minutes and a few cents.
