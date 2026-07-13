import type { NextConfig } from "next";
import { join } from "node:path";

// CSP for the app. The canvas renders model-authored HTML DIRECTLY in the app
// document (no iframe), so its scripts run in-origin — connect-src is the main
// exfiltration fence, object-src/frame-src none block plugin/iframe escapes.
// Canvas interactive scripts run inline ('unsafe-inline'); <model-viewer> may
// instantiate a wasm decoder for compressed 3D ('wasm-unsafe-eval') and uses
// blob: workers. Everything it needs (GLBs, the neutral env) is same-origin.
const DEV = process.env.NODE_ENV !== "production";
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  // 'unsafe-eval' is DEV-ONLY: React's dev build uses eval() for debugging
  // (callstack reconstruction). Never emitted in production.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:${DEV ? " 'unsafe-eval'" : ""}`,
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
