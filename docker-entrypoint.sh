#!/usr/bin/env sh
# Runs BOTH Prox processes in one container, exactly like `pnpm dev` does locally —
# the agent service (internal, :8787) and the Next.js web app (public, :PORT).
# -k kills the other and exits non-zero if either dies, so the host restarts the box.
set -e

export AGENT_PORT="${AGENT_PORT:-8787}"
WEB_PORT="${PORT:-7860}"

exec pnpm exec concurrently -k -n agent,web -c magenta,cyan \
  "pnpm --filter @prox/agent start" \
  "pnpm --filter @prox/web exec next start -H 0.0.0.0 -p ${WEB_PORT}"
