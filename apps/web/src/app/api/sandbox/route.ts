export const runtime = "nodejs";

import { createHash } from "node:crypto";
import * as esbuild from "esbuild";

// Server-bundle a Sandbox node's React code into ONE self-contained IIFE with a
// curated, versioned dep set (react, react-dom, three, d3, recharts, motion,
// lucide-react). No CDN, no in-browser Babel, no import maps — the bundle is
// pure JS the iframe just evaluates. Cached by content hash so re-renders and
// re-opens are instant. Replaces the old esm.sh/@babel/standalone artifact host.

const cache = new Map<string, string>();

// Wrap the model's module so its default export mounts into #root, and expose a
// tiny host bridge (respond/sendPrompt/openLink) the code can call. The mount
// finds the component via a typeof-guarded chain so a missing binding degrades to
// a friendly message instead of a ReferenceError.
function wrap(code: string): string {
  // Models sometimes wrap the code in ``` fences — strip them.
  let src = code.trim();
  if (src.startsWith("```")) src = src.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "").trim();
  // `export default <X>` → capture into a well-known binding.
  src = src.replace(/export\s+default\s+/, "var __TAKT_APP = ");
  return `
import React from "react";
import { createRoot } from "react-dom/client";
${src}
;(function () {
  window.__taktBridge = {
    respond: (v) => parent.postMessage({ __takt: true, type: "action", value: v }, "*"),
    sendPrompt: (t) => parent.postMessage({ __takt: true, type: "prompt", text: String(t) }, "*"),
    openLink: (u) => parent.postMessage({ __takt: true, type: "link", url: String(u) }, "*"),
  };
  var C = (typeof __TAKT_APP !== "undefined" && __TAKT_APP)
    || (typeof App !== "undefined" && App)
    || (typeof Artifact !== "undefined" && Artifact) || null;
  var el = document.getElementById("root");
  if (C) createRoot(el).render(React.createElement(C, { host: window.__taktBridge }));
  else el.innerHTML = '<div style="padding:16px;color:var(--takt-danger)">Sandbox: export default a React component.</div>';
})();
`;
}

export async function POST(req: Request) {
  let body: { code?: string };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const code = body.code;
  if (!code || typeof code !== "string") return json({ error: "no code" }, 400);
  if (code.length > 100_000) return json({ error: "too large" }, 413);

  const hash = createHash("sha256").update(code).digest("hex").slice(0, 16);
  const cached = cache.get(hash);
  if (cached) return json({ hash, js: cached });

  try {
    const out = await esbuild.build({
      stdin: { contents: wrap(code), loader: "tsx", resolveDir: process.cwd() },
      bundle: true, format: "iife", platform: "browser", target: "es2020",
      jsx: "automatic", minify: true, write: false,
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
    });
    const js = out.outputFiles?.[0]?.text ?? "";
    cache.set(hash, js);
    if (cache.size > 200) cache.delete(cache.keys().next().value!); // simple LRU-ish cap
    return json({ hash, js });
  } catch (e) {
    // Hand the build error back so the model can self-correct on the next turn.
    return json({ error: (e as Error).message }, 422);
  }
}

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
