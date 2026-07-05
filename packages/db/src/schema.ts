import { EMBED_DIM } from "./paths";

// Idempotent schema. `vec_chunks` uses a sqlite-vec vec0 virtual table with a
// product_id partition key so KNN search is filtered efficiently per product —
// this is what keeps the system product-agnostic with no cross-product bleed.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id           TEXT PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  manufacturer TEXT,
  summary      TEXT,
  hero_path    TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS manuals (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  pdf_path    TEXT NOT NULL,
  page_count  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_manuals_product ON manuals(product_id);

CREATE TABLE IF NOT EXISTS page_images (
  id          TEXT PRIMARY KEY,
  manual_id   TEXT NOT NULL REFERENCES manuals(id) ON DELETE CASCADE,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  png_path    TEXT NOT NULL,
  width       INTEGER NOT NULL DEFAULT 0,
  height      INTEGER NOT NULL DEFAULT 0,
  caption     TEXT,
  UNIQUE(manual_id, page_number)
);
CREATE INDEX IF NOT EXISTS idx_pages_product ON page_images(product_id);

CREATE TABLE IF NOT EXISTS chunks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  manual_id    TEXT NOT NULL REFERENCES manuals(id) ON DELETE CASCADE,
  page_number  INTEGER NOT NULL,
  kind         TEXT NOT NULL,
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(content_hash)
);
CREATE INDEX IF NOT EXISTS idx_chunks_product ON chunks(product_id);

CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
  product_id TEXT PARTITION KEY,
  chunk_id INTEGER,
  embedding FLOAT[${EMBED_DIM}]
);

CREATE TABLE IF NOT EXISTS providers (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  kind               TEXT NOT NULL,
  api_key_ciphertext TEXT,
  key_last4          TEXT,
  is_default         INTEGER NOT NULL DEFAULT 0
);

-- product_id is NULLABLE: a NULL product = a master (no-product) chat that can
-- search across all products. migrate() rebuilds pre-existing NOT NULL tables.
CREATE TABLE IF NOT EXISTS chats (
  id         TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'New chat',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chats_product ON chats(product_id);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  chat_id      TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id             TEXT PRIMARY KEY,
  product_id     TEXT REFERENCES products(id) ON DELETE CASCADE,
  chat_id        TEXT,
  title          TEXT NOT NULL,
  kind           TEXT NOT NULL,
  code           TEXT NOT NULL,
  group_key      TEXT,
  version        INTEGER NOT NULL DEFAULT 1,
  thumbnail_path TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_artifacts_product ON artifacts(product_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_chat ON artifacts(chat_id);
`;

// Guarded schema migrations for DBs created by an older version. SQLite has no
// "ADD COLUMN IF NOT EXISTS" / "ALTER COLUMN", so we inspect pragma table_info
// and rebuild tables when a column's nullability must change.
type MigrateHandle = {
  prepare: (s: string) => { all: () => unknown[] };
  exec: (s: string) => void;
};

// True if `table.column` is declared NOT NULL (notnull=1 in table_info).
function isNotNull(handle: MigrateHandle, table: string, column: string): boolean {
  const row = (handle.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[])
    .find((c) => c.name === column);
  return !!row && row.notnull === 1;
}

export function migrate(handle: MigrateHandle) {
  const cols = (handle.prepare("PRAGMA table_info(artifacts)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("group_key")) handle.exec("ALTER TABLE artifacts ADD COLUMN group_key TEXT");
  if (!cols.includes("version")) handle.exec("ALTER TABLE artifacts ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
  handle.exec("CREATE INDEX IF NOT EXISTS idx_artifacts_chat ON artifacts(chat_id)");

  // Master mode: chats/artifacts.product_id must be NULLABLE. Rebuild the table
  // if it's still the old NOT NULL shape. FKs OFF so dropping chats (referenced
  // by messages.chat_id) is safe — ids are preserved by the rename.
  if (isNotNull(handle, "chats", "product_id")) {
    handle.exec(`
      PRAGMA foreign_keys=OFF;
      BEGIN;
      CREATE TABLE chats_new (
        id         TEXT PRIMARY KEY,
        product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
        title      TEXT NOT NULL DEFAULT 'New chat',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO chats_new (id, product_id, title, created_at)
        SELECT id, product_id, title, created_at FROM chats;
      DROP TABLE chats;
      ALTER TABLE chats_new RENAME TO chats;
      CREATE INDEX IF NOT EXISTS idx_chats_product ON chats(product_id);
      COMMIT;
      PRAGMA foreign_keys=ON;
    `);
  }
  if (isNotNull(handle, "artifacts", "product_id")) {
    handle.exec(`
      PRAGMA foreign_keys=OFF;
      BEGIN;
      CREATE TABLE artifacts_new (
        id             TEXT PRIMARY KEY,
        product_id     TEXT REFERENCES products(id) ON DELETE CASCADE,
        chat_id        TEXT,
        title          TEXT NOT NULL,
        kind           TEXT NOT NULL,
        code           TEXT NOT NULL,
        group_key      TEXT,
        version        INTEGER NOT NULL DEFAULT 1,
        thumbnail_path TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO artifacts_new (id, product_id, chat_id, title, kind, code, group_key, version, thumbnail_path, created_at)
        SELECT id, product_id, chat_id, title, kind, code, group_key, version, thumbnail_path, created_at FROM artifacts;
      DROP TABLE artifacts;
      ALTER TABLE artifacts_new RENAME TO artifacts;
      CREATE INDEX IF NOT EXISTS idx_artifacts_product ON artifacts(product_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_chat ON artifacts(chat_id);
      COMMIT;
      PRAGMA foreign_keys=ON;
    `);
  }
}
