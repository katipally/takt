import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Resolve repo-root-relative data paths regardless of which workspace package
// (web / agent / ingest) imports this module. `packages/db/src` → repo root is
// three levels up.
const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, "../../..");
export const DATA_DIR = process.env.PROX_DATA_DIR
  ? resolve(process.env.PROX_DATA_DIR)
  : resolve(REPO_ROOT, "data");
export const DB_PATH = resolve(DATA_DIR, "prox.db");
// Committed, key-free pre-seeded catalog. On first boot (no prox.db yet) it is
// copied to DB_PATH so `git clone && pnpm dev` works with zero seeding. See
// scripts/bake-seed-db.sh and packages/db/src/connection.ts.
export const SEED_DB_PATH = resolve(DATA_DIR, "seed.db");
export const PAGES_DIR = resolve(DATA_DIR, "pages");
export const HERO_DIR = resolve(DATA_DIR, "heroes");
export const PDF_DIR = resolve(DATA_DIR, "pdfs");
export const EMBED_DIM = 384;
