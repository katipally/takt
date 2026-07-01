#!/usr/bin/env bash
# Deploy Prox to a Hugging Face Docker Space using the `hf` CLI.
# Assembles a clean, KEY-FREE copy of the app and uploads it.
#
# Usage:
#   deploy/push-to-hf.sh <user>/<space>        # e.g. deploy/push-to-hf.sh alice/prox
#
# Prereqs: `hf` CLI + logged in (`hf auth login`), and `sqlite3`.
# Creates the Space if it doesn't exist, strips the API key from the baked DB,
# uploads everything, and sets WEB_PUBLIC_URL.
set -euo pipefail

REPO="${1:-}"
if [ -z "$REPO" ]; then
  echo "Usage: $0 <user>/<space>   e.g. $0 alice/prox" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # the repo root (monorepo)
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "▸ Staging a clean copy (no host junk, no secrets)…"
rsync -a \
  --exclude '.git' \
  --exclude '.env' --exclude '.env.*' \
  --exclude 'node_modules' --exclude '**/node_modules' \
  --exclude '.next' --exclude '**/.next' \
  --exclude '.turbo' --exclude '**/.turbo' \
  --exclude '.cache' --exclude '**/.cache' --exclude '.transformers-cache' \
  --exclude '*.local.md' \
  --exclude '.gitignore' --exclude 'data' --exclude 'deploy' --exclude 'challenge' \
  "$ROOT/" "$STAGE/"

echo "▸ HF Space README (Docker front-matter)…"
cp "$ROOT/deploy/README.hf.md" "$STAGE/README.md"

echo "▸ Baking the committed key-free catalog (data/seed.db)…"
[ -f "$ROOT/data/seed.db" ] || { echo "✗ data/seed.db missing — run scripts/bake-seed-db.sh first." >&2; exit 1; }
mkdir -p "$STAGE/data"
# seed.db is already key-free AND chat-free (scripts/bake-seed-db.sh). Ship it as
# the runtime db directly — the container boots straight from it, no chats, no key.
cp "$ROOT/data/seed.db" "$STAGE/data/prox.db"
cp -R "$ROOT/data/pages"  "$STAGE/data/pages"
cp -R "$ROOT/data/heroes" "$STAGE/data/heroes"
# data/.enc-key deliberately omitted — regenerated fresh in the container.

echo "▸ Safety checks…"
# Match a REAL key shape (sk-ant- followed by a long token), not the bare
# literal that appears in our own safety-check scripts.
if grep -rIlE --exclude-dir=.git 'sk-ant-[A-Za-z0-9_-]{16,}' "$STAGE" >/dev/null 2>&1; then
  echo "✗ ABORT: a real 'sk-ant-...' key is present in the staged files." >&2
  grep -rIlE --exclude-dir=.git 'sk-ant-[A-Za-z0-9_-]{16,}' "$STAGE" >&2; exit 1
fi
LAST4=$(sqlite3 "$STAGE/data/prox.db" "SELECT COALESCE(key_last4,'<null>') FROM providers;")
[ "$LAST4" = "<null>" ] || { echo "✗ ABORT: provider key not stripped (last4=$LAST4)." >&2; exit 1; }
CHATS=$(sqlite3 "$STAGE/data/prox.db" "SELECT COUNT(*) FROM chats;")
[ "$CHATS" = "0" ] || { echo "✗ ABORT: $CHATS chat(s) present in the shipped db." >&2; exit 1; }

echo "▸ Ensuring Space $REPO exists (Docker SDK)…"
hf repos create "$REPO" --type space --space-sdk docker --exist-ok

echo "▸ Uploading…"
# --delete "*" makes this a SYNC: files removed from the repo since the last
# deploy are pruned on the Space too (hf upload otherwise only adds/updates).
hf upload "$REPO" "$STAGE" . --type space --delete "*" --commit-message "Deploy Prox (web + agent, seeded data, no key)"

USER="${REPO%%/*}"; NAME="${REPO##*/}"
PUBLIC_URL="https://${USER}-${NAME}.hf.space"
echo "▸ Setting WEB_PUBLIC_URL=$PUBLIC_URL …"
hf spaces variables add "$REPO" --env "WEB_PUBLIC_URL=$PUBLIC_URL"

# Stable encryption key for provider API keys at rest. Set ONCE and kept: it
# makes both container processes (web + agent) use the same key and lets a
# pasted key survive app restarts (no per-boot .enc-key race). Generated here,
# never printed to logs, never regenerated if already present.
echo "▸ Ensuring a stable PROX_ENC_KEY secret…"
if hf spaces secrets ls "$REPO" 2>/dev/null | grep -q "PROX_ENC_KEY"; then
  echo "  PROX_ENC_KEY already set (kept)"
else
  hf spaces secrets add "$REPO" -s "PROX_ENC_KEY=$(openssl rand -hex 32)" >/dev/null
  echo "  set a new PROX_ENC_KEY"
fi

echo "✓ Done. Live (after build): $PUBLIC_URL"
echo "  Watch the build:  hf spaces logs $REPO --build --follow"
