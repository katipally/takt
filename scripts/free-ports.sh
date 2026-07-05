#!/usr/bin/env bash
# Free the dev ports before starting. Kills stale listeners left by a crashed/killed run.
# ponytail: lsof + kill; swap for a process manager only if this ever isn't enough.
set -u

ports=("${WEB_PORT:-3000}" "${AGENT_PORT:-8787}")
killed=0

for port in "${ports[@]}"; do
  pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
  [ -z "$pids" ] && continue
  for pid in $pids; do
    cmd=$(ps -p "$pid" -o comm= 2>/dev/null || echo "?")
    echo "  port $port busy -> killing pid $pid ($cmd)"
    kill "$pid" 2>/dev/null || true
    killed=1
  done
done

# give them a moment, then SIGKILL anything that ignored SIGTERM
if [ "$killed" = 1 ]; then
  sleep 1
  for port in "${ports[@]}"; do
    pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)
    for pid in $pids; do
      echo "  port $port still busy -> SIGKILL pid $pid"
      kill -9 "$pid" 2>/dev/null || true
    done
  done
  echo "  freed dev ports (${ports[*]})"
fi
