// Idempotent schema. The DB holds app state + metadata + the product KNOWLEDGE
// GRAPH (entities/edges/kg_chunks/kg_media + FTS). Page images/captions also live
// here. The semantic vectors are BLOB columns on the entity/chunk/media rows
// themselves (no on-disk vectors file); everything is built once at ingest.
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
  png_hash    TEXT,                      -- content hash: reuse a cached caption/parse only when the page image is byte-identical
  parse_json  TEXT,                      -- cached structured page parse (entities) so re-ingest skips the vision call
  UNIQUE(manual_id, page_number)
);
CREATE INDEX IF NOT EXISTS idx_pages_product ON page_images(product_id);

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
  live         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ── Knowledge graph (single-tenant, local) ──────────────────────────────────
-- The graph is the canonical product knowledge: typed entities + edges between
-- them, plus retrievable text chunks and render-ready media, all keyed to a
-- product and (where known) an entity. Built once at ingest; queried cheaply
-- (FTS + vectors + traversal) at runtime. content_hash lets re-ingest skip
-- unchanged inputs and reconcile without preserving stale text.
CREATE TABLE IF NOT EXISTS entities (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,              -- part|assembly|procedure|step|symptom|spec|warning|setting|compatibility|figure|region|model_part|video_clip|term
  name         TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]', -- layman synonyms for non-technical users
  summary      TEXT NOT NULL DEFAULT '',
  attrs_json   TEXT NOT NULL DEFAULT '{}', -- typed fields, e.g. spec:{value,unit}
  manual_id    TEXT,                        -- provenance pointer (not a strict FK — may be null / synthetic)
  page         INTEGER,                    -- source page (provenance)
  content_hash TEXT,
  embedding    BLOB,                        -- name+summary vector (Float32 LE); in-DB semantic search
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_entities_product ON entities(product_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(product_id, type);

CREATE TABLE IF NOT EXISTS edges (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  src         TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  dst         TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  rel         TEXT NOT NULL,              -- part_of|connects_to|requires|fixes|causes|shown_in|located_on|compatible_with|step_of|references|depicts
  provenance  TEXT NOT NULL DEFAULT 'EXTRACTED', -- EXTRACTED (stated) | INFERRED (2nd pass)
  weight      REAL NOT NULL DEFAULT 1.0,
  page        INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst);
CREATE INDEX IF NOT EXISTS idx_edges_product ON edges(product_id);

CREATE TABLE IF NOT EXISTS kg_chunks (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  entity_id  TEXT REFERENCES entities(id) ON DELETE SET NULL,
  manual_id  TEXT,
  page       INTEGER,
  kind       TEXT NOT NULL DEFAULT 'page', -- page|section|caption|table|region
  text       TEXT NOT NULL,
  embedding  BLOB                          -- chunk text vector (Float32 LE)
);
CREATE INDEX IF NOT EXISTS idx_kgchunks_product ON kg_chunks(product_id);

CREATE TABLE IF NOT EXISTS kg_media (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  entity_id    TEXT REFERENCES entities(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL,             -- figure|page|region|mesh|video_clip|image
  asset_url    TEXT NOT NULL,
  caption      TEXT NOT NULL DEFAULT '',
  subsystem    TEXT,
  bbox_json    TEXT,                      -- structured crop {page,x,y,w,h,expected_labels[]}
  content_hash TEXT,
  embedding    BLOB                       -- caption vector (Float32 LE)
);
CREATE INDEX IF NOT EXISTS idx_kgmedia_product ON kg_media(product_id);

-- FTS5 (built into better-sqlite3) — standalone tables populated at ingest.
-- BM25 lexical grep over chunk text, media captions, and entity name/aliases.
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED, product_id UNINDEXED, text
);
CREATE VIRTUAL TABLE IF NOT EXISTS media_fts USING fts5(
  media_id UNINDEXED, product_id UNINDEXED, caption
);
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  entity_id UNINDEXED, product_id UNINDEXED, name, aliases, summary
);

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
  // The old artifacts table + its data are retired with the artifact pipeline.
  try { handle.exec("DROP TABLE IF EXISTS artifacts"); } catch { /* harmless */ }
  // Orphan live_artifacts table (defined nowhere in code) from an earlier era.
  try { handle.exec("DROP TABLE IF EXISTS live_artifacts"); } catch { /* harmless */ }

  // Legacy sqlite-vec vector store (superseded by vectors.bin beside the Profile
  // and the KG's FTS). Drop the old chunks/vec_chunks tables if a pre-existing DB
  // still has them. vec_chunks is a vec0 virtual table whose DROP needs the
  // (now-removed) sqlite-vec module, so tolerate that failing — an orphaned vtab
  // is harmless since nothing queries it.
  try { handle.exec("DROP TABLE IF EXISTS vec_chunks"); } catch { /* module gone; harmless orphan */ }
  try { handle.exec("DROP TABLE IF EXISTS chunks"); } catch { /* ignore */ }

  // messages.live: marks a turn produced in live-voice mode so reloaded history
  // regroups it into the Live-session card (else it re-renders as normal turns).
  // Additive column — ADD COLUMN is safe/atomic; throws if it already exists.
  try { handle.exec("ALTER TABLE messages ADD COLUMN live INTEGER NOT NULL DEFAULT 0"); } catch { /* already present */ }

  // page_images.png_hash: added so re-ingest reuses a cached caption only when the
  // rendered page is byte-identical (fixes stale captions after a manual is replaced).
  try { handle.exec("ALTER TABLE page_images ADD COLUMN png_hash TEXT"); } catch { /* already present */ }
  try { handle.exec("ALTER TABLE page_images ADD COLUMN parse_json TEXT"); } catch { /* already present */ }

  // Unify semantic search into the KG: embeddings move from the on-disk vectors.bin
  // into a BLOB on each entity/chunk/media row, so one store answers lexical (FTS),
  // semantic (cosine over these BLOBs), and graph traversal. Additive columns.
  try { handle.exec("ALTER TABLE entities ADD COLUMN embedding BLOB"); } catch { /* already present */ }
  try { handle.exec("ALTER TABLE kg_chunks ADD COLUMN embedding BLOB"); } catch { /* already present */ }
  try { handle.exec("ALTER TABLE kg_media ADD COLUMN embedding BLOB"); } catch { /* already present */ }

  // Master mode: chats.product_id must be NULLABLE. Rebuild the table if it's
  // still the old NOT NULL shape. FKs OFF so dropping chats (referenced by
  // messages.chat_id) is safe — ids are preserved by the rename.
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
}
