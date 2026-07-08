import { rmSync, existsSync } from "node:fs";
import { DB_PATH, PAGES_DIR, PDF_DIR, HERO_DIR, PRODUCTS_DIR, SCRATCH_DIR } from "./paths";

// Full clean slate: wipe the local DB + all product knowledge + rendered assets
// so the catalog is empty and `pnpm ingest <folder>` rebuilds from scratch.
for (const p of [DB_PATH, `${DB_PATH}-shm`, `${DB_PATH}-wal`, PAGES_DIR, PDF_DIR, HERO_DIR, PRODUCTS_DIR, SCRATCH_DIR]) {
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}
console.log("Reset: removed local DB, product knowledge, and rendered assets.");
