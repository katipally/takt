#!/usr/bin/env sh
# Runs BOTH Prox processes in one container, exactly like `pnpm dev` does locally —
# the agent service (internal, :8787) and the Next.js web app (public, :PORT).
# -k kills the other and exits non-zero if either dies, so the host restarts the box.
set -e

export AGENT_PORT="${AGENT_PORT:-8787}"
WEB_PORT="${PORT:-7860}"

# Gate the internal agent so the public web app is the only way in. Generate a
# secret if the host didn't provide one; both processes inherit it from here.
export PROX_AGENT_SECRET="${PROX_AGENT_SECRET:-$(cat /proc/sys/kernel/random/uuid)}"

# The web runs a custom Node server (server.mjs) so it can proxy the /live
# WebSocket to the internal agent — it reads PORT (7860) for its listen port.
exec pnpm exec concurrently -k -n agent,web -c magenta,cyan \
  "pnpm --filter @prox/agent start" \
  "PORT=${WEB_PORT} pnpm --filter @prox/web start"
