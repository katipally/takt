import { rmSync, existsSync } from "node:fs";
import { DB_PATH, PAGES_DIR, PDF_DIR } from "./paths";

// Wipe the local DB + rendered assets so `pnpm ingest` rebuilds from scratch.
for (const p of [DB_PATH, `${DB_PATH}-shm`, `${DB_PATH}-wal`, PAGES_DIR, PDF_DIR]) {
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}
console.log("Reset: removed local DB and rendered assets.");
