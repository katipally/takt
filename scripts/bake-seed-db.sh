#!/usr/bin/env bash
# Bake the committed, key-free pre-seeded catalog: data/seed.db
#
# Turns the local runtime DB (data/takt.db — which holds YOUR encrypted API key
# and chat history) into a clean template safe to commit. On a fresh clone,
# packages/db/src/connection.ts copies data/seed.db -> data/takt.db on first
# boot, so judges get instant answers with no `pnpm seed`.
#
# What it strips: the provider API key (api_key_ciphertext + key_last4), all
# runtime chat data (chats / messages / artifacts), and the per-machine model
# settings (so a fresh boot applies the shared DEFAULT_* models, not whatever a
# dev last picked). It keeps the catalog metadata: products, manuals, page_images.
# Product knowledge itself lives in data/products/ (committed markdown), not the DB.
#
# Usage:  scripts/bake-seed-db.sh
# Prereqs: sqlite3.  Commits: data/seed.db, data/pages/, data/heroes/, data/products/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/data/takt.db"
OUT="$ROOT/data/seed.db"

[ -f "$SRC" ] || { echo "✗ $SRC not found — run 'pnpm seed' first." >&2; exit 1; }

echo "▸ Copying runtime DB -> seed template…"
rm -f "$OUT" "$OUT-wal" "$OUT-shm"
cp "$SRC" "$OUT"
[ -f "$SRC-wal" ] && cp "$SRC-wal" "$OUT-wal" || true
[ -f "$SRC-shm" ] && cp "$SRC-shm" "$OUT-shm" || true

echo "▸ Folding WAL, stripping key, clearing chats + model settings…"
sqlite3 "$OUT" "
  PRAGMA wal_checkpoint(TRUNCATE);
  UPDATE providers SET api_key_ciphertext=NULL, key_last4=NULL;
  DELETE FROM messages;
  DELETE FROM chats;
  DELETE FROM settings WHERE key IN ('chatModel','captionModel','effort');
  DROP TABLE IF EXISTS models;
  PRAGMA journal_mode=DELETE;
"
rm -f "$OUT-wal" "$OUT-shm"

echo "▸ Safety checks…"
# Count providers still carrying a key — 0 required. (COUNT, not the value, so
# multiple provider rows don't produce a multi-line string that false-aborts.)
WITHKEY=$(sqlite3 "$OUT" "SELECT COUNT(*) FROM providers WHERE key_last4 IS NOT NULL OR api_key_ciphertext IS NOT NULL;")
[ "$WITHKEY" = "0" ] || { echo "✗ ABORT: $WITHKEY provider(s) still carry a key." >&2; exit 1; }
if grep -aq 'sk-ant-' "$OUT"; then echo "✗ ABORT: 'sk-ant-' found in $OUT." >&2; exit 1; fi

echo "✓ Baked $(du -h "$OUT" | cut -f1) -> data/seed.db (key-free, no chats)."
echo "  Commit: git add -f data/seed.db data/pages data/heroes data/products"
