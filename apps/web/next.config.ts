import type { NextConfig } from "next";
import { join } from "node:path";

const config: NextConfig = {
  // Transpile our workspace TS packages; keep native deps out of the bundle.
  transpilePackages: ["@prox/db", "@prox/shared"],
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
  // Pin the workspace root so file tracing is deterministic in the monorepo.
  turbopack: { root: join(import.meta.dirname, "..", "..") },
  outputFileTracingRoot: join(import.meta.dirname, "..", ".."),
};

export default config;
