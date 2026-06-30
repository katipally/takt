# Agent service container — the Claude Agent SDK spawns a `claude` CLI
# subprocess, so it needs a real Node runtime (not a serverless function).
# Deploy this to Railway/Render/Fly; point the web app's AGENT_SERVICE_URL at it.
FROM node:22-slim

# pnpm via corepack
RUN corepack enable

WORKDIR /app

# Install workspace deps (only what the agent + its workspace deps need).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY services/agent ./services/agent
COPY pipeline/ingest ./pipeline/ingest

RUN pnpm install --frozen-lockfile=false

ENV NODE_ENV=production
ENV AGENT_PORT=8787
EXPOSE 8787

# Persist the SQLite DB + rendered pages across restarts via a mounted volume.
VOLUME ["/app/data"]

CMD ["pnpm", "--filter", "@prox/agent", "start"]
