#!/usr/bin/env bash
# Bake the committed, key-free pre-seeded catalog: data/seed.db
#
# Turns the local runtime DB (data/prox.db — which holds YOUR encrypted API key
# and chat history) into a clean template safe to commit. On a fresh clone,
# packages/db/src/connection.ts copies data/seed.db -> data/prox.db on first
# boot, so judges get instant answers with no `pnpm seed`.
#
# What it strips: the provider API key (api_key_ciphertext + key_last4) and all
# runtime chat data (chats / messages / artifacts). It keeps the valuable seed:
# products, manuals, page_images, chunks, models. Run it after re-seeding.
#
# Usage:  scripts/bake-seed-db.sh
# Prereqs: sqlite3.  Commits: data/seed.db, data/pages/, data/heroes/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/data/prox.db"
OUT="$ROOT/data/seed.db"

[ -f "$SRC" ] || { echo "✗ $SRC not found — run 'pnpm seed' first." >&2; exit 1; }

echo "▸ Copying runtime DB -> seed template…"
rm -f "$OUT" "$OUT-wal" "$OUT-shm"
cp "$SRC" "$OUT"
[ -f "$SRC-wal" ] && cp "$SRC-wal" "$OUT-wal" || true
[ -f "$SRC-shm" ] && cp "$SRC-shm" "$OUT-shm" || true

echo "▸ Folding WAL, stripping key, clearing chat history…"
sqlite3 "$OUT" "
  PRAGMA wal_checkpoint(TRUNCATE);
  UPDATE providers SET api_key_ciphertext=NULL, key_last4=NULL;
  DELETE FROM artifacts;
  DELETE FROM messages;
  DELETE FROM chats;
  PRAGMA journal_mode=DELETE;
"
rm -f "$OUT-wal" "$OUT-shm"

echo "▸ Safety checks…"
LAST4=$(sqlite3 "$OUT" "SELECT COALESCE(key_last4,'<null>') FROM providers;")
[ "$LAST4" = "<null>" ] || { echo "✗ ABORT: provider key not stripped (last4=$LAST4)." >&2; exit 1; }
if grep -aq 'sk-ant-' "$OUT"; then echo "✗ ABORT: 'sk-ant-' found in $OUT." >&2; exit 1; fi

echo "✓ Baked $(du -h "$OUT" | cut -f1) -> data/seed.db (key-free, no chats)."
echo "  Commit: git add -f data/seed.db data/pages data/heroes"
