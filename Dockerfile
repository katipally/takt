# Single image that runs the WHOLE Takt app (web + agent) the same way `pnpm dev`
# does locally — one shared filesystem, so the web's direct SQLite/file reads work
# exactly as on a laptop. Targets a free Hugging Face Docker Space (runs as UID 1000).
FROM node:22-bookworm-slim

# Toolchain for the native modules (better-sqlite3, sharp, mupdf).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

WORKDIR /app

# Install deps (compiles native modules) — copy everything; .dockerignore keeps the
# host's node_modules/.next out so we get a clean linux build.
COPY . .
RUN pnpm install --frozen-lockfile

# Production build of the web app.
RUN pnpm --filter @takt/web build

# HF Spaces run as UID 1000; make /app (incl. the baked data dir) writable so
# runtime writes — judge's pasted key, chats, sqlite WAL, Profile edits — work.
RUN chown -R 1000:1000 /app
USER 1000

# App config. The web app is the only public surface; the agent stays on localhost.
ENV NODE_ENV=production \
    TAKT_DATA_DIR=/app/data \
    AGENT_SERVICE_URL=http://localhost:8787 \
    AGENT_PORT=8787 \
    PORT=7860
# WEB_PUBLIC_URL is set in the HF Space settings to the real https://<...>.hf.space URL.

EXPOSE 7860

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
