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

## What it does (per PDF)

1. Detects the manual kind from the filename (`owner` / `quick_start` / `selection_chart` / `other`).
2. Renders each page to a PNG (mupdf, 2× scale).
3. Reads each page with Claude vision and stores the result as the page caption — full text, tables as markdown, and a description of every diagram/photo and the question it answers.
4. Splits page text and captions into overlapping ~500-token chunks, each tagged with its page number.
5. Embeds chunks locally (`bge-small`) and writes them to the `sqlite-vec` index under the product's partition.

## Idempotency

Chunks are keyed by a content hash and page captions are reused on re-runs, so running ingest again only does new work. Use `pnpm db:reset` to wipe the local DB and rebuild from scratch.

## After ingest

The product appears in the picker and the settings list automatically — the agent reads the catalog from the database at request time, so there's no redeploy. A reproducible manifest is written to `seed/<slug>.json`.

## Tips for good retrieval

- Filenames matter only for kind detection; content is what's indexed.
- Image-heavy manuals (schematics, charts) benefit most from this pipeline — the vision pass is where the value is.
- Captioning is the API-cost step. A 48-page manual is a few minutes and a few cents.
