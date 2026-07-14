import type { NextConfig } from "next";
import { join } from "node:path";

// CSP for the app. The canvas renders in a SANDBOXED IFRAME (srcdoc). A srcdoc
// frame INHERITS this CSP, so everything the frame needs must be allowed here:
// same-origin scripts ('self' — the vendored /vendor/model-viewer.min.js),
// inline scripts ('unsafe-inline' — the frame runtime + model chart JS), a wasm
// decoder for compressed 3D ('wasm-unsafe-eval'), and blob: workers. frame-src
// 'self' permits the srcdoc canvas frame itself; object-src none still blocks
// plugins. Mermaid is pre-rendered in the parent, so no CDN is needed.
const DEV = process.env.NODE_ENV !== "production";
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'self'",
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
    // The sandboxed srcdoc canvas frame has an OPAQUE origin (Origin: null), and
    // module loads (dynamic import of model-viewer) + fetches (the .glb itself)
    // are CORS-mode — without ACAO they fail even same-host. Public read-only
    // assets, so `*` is safe.
    const cors = [{ key: "Access-Control-Allow-Origin", value: "*" }];
    return [
      { source: "/:path*", headers: [{ key: "Content-Security-Policy", value: CSP }] },
      { source: "/vendor/:path*", headers: cors },
      { source: "/assets/:path*", headers: cors },
    ];
  },
};

export default config;
