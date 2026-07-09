import type { NextConfig } from "next";
import { join } from "node:path";

// Strict CSP for the app. The canvas now renders model-authored HTML DIRECTLY in
// the app document (no iframe), so scripts/styles run in-origin — `connect-src
// 'self'` is the real exfiltration fence for those scripts, `object-src`/`frame-src`
// none block plugin/iframe escapes. `'unsafe-inline'` is required for the canvas's
// inline <script>/<style> and the app's inline styles.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
].join("; ");

const config: NextConfig = {
  // Transpile our workspace TS packages; keep native deps out of the bundle.
  transpilePackages: ["@takt/db", "@takt/shared", "@takt/profile"],
  serverExternalPackages: ["better-sqlite3"],
  // Pin the workspace root so file tracing is deterministic in the monorepo.
  turbopack: { root: join(import.meta.dirname, "..", "..") },
  outputFileTracingRoot: join(import.meta.dirname, "..", ".."),
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: CSP }] }];
  },
};

export default config;
