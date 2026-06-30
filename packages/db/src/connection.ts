import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync, existsSync, copyFileSync } from "node:fs";
import { DATA_DIR, DB_PATH, SEED_DB_PATH, PAGES_DIR, HERO_DIR, PDF_DIR } from "./paths";
import { SCHEMA_SQL, migrate } from "./schema";

let db: Database.Database | null = null;

/** Process-wide singleton SQLite handle with sqlite-vec loaded + schema applied. */
export function getDb(): Database.Database {
  if (db) return db;
  for (const dir of [DATA_DIR, PAGES_DIR, HERO_DIR, PDF_DIR]) {
    mkdirSync(dir, { recursive: true });
  }
  // First boot of a fresh clone: seed the runtime DB from the committed,
  // key-free template so `pnpm dev` works without running `pnpm seed`.
  if (!existsSync(DB_PATH) && existsSync(SEED_DB_PATH)) copyFileSync(SEED_DB_PATH, DB_PATH);
  const handle = new Database(DB_PATH);
  handle.pragma("journal_mode = WAL");
  handle.pragma("foreign_keys = ON");
  handle.pragma("busy_timeout = 5000");
  sqliteVec.load(handle);
  handle.exec(SCHEMA_SQL);
  migrate(handle);
  db = handle;
  return db;
}

export function closeDb() {
  db?.close();
  db = null;
}
