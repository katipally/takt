import { CANVAS_CSS } from "./canvas-css";

// Builds the sandboxed-iframe document that renders a canvas. The in-frame runtime
// is a separate same-origin asset (/takt-frame-runtime.js) referenced from the
// document — kept out of the bundle so SWC can't mangle it.
// The canvas is no longer injected into the app DOM (which caused
// CSS collisions, container-query collapse, island wipes, and glitchy mid-stream
// paints). Instead we render ONE complete document in an <iframe sandbox srcdoc>:
//   • the frame owns its whole world — its CSS/JS cannot touch or collide with the app
//   • the runtime auto-heights the frame, syncs theme, and bridges island clicks
//     (cite / lightbox / action / select) up to the app via postMessage
//   • it renders the FINISHED document once — no partial parses
//
// Security: sandbox="allow-scripts allow-modals" gives a NULL/opaque origin. We
// deliberately DO NOT add allow-same-origin (with allow-scripts that pair lets the
// frame delete its own sandbox and escape). No same-origin ⇒ no cookies, no
// localStorage, no reading the parent. That isolation — not DOMPurify — is the
// security boundary, so we can let the model's own <script>/<svg> run for charts.
// A defense-in-depth CSP is embedded in the document head.

export const FRAME_MSG = {
  // child → parent
  ready: "takt:ready",
  size: "takt:size",
  cite: "takt:cite",
  lightbox: "takt:lightbox",
  action: "takt:action",
  select: "takt:select",
  wheel: "takt:wheel",
  // parent → child
  theme: "takt:theme",
  highlight: "takt:highlight",
} as const;

// A srcdoc frame INHERITS the embedding app's CSP, so external CDNs are out (the
// app CSP is default-src 'self'). Mermaid is pre-rendered in the parent (see
// prepareCanvasHtml); model-viewer is vendored to the app origin so it loads under
// 'self'. No network dependency, no CSP widening.

// Defense-in-depth CSP for the frame document (tightens the inherited app CSP
// further; kept aligned with it): same-origin + inline scripts, data:/blob: media,
// no arbitrary network, no nested frames.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "style-src 'unsafe-inline'",
  "font-src data:",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
].join("; ");

// Normalize the model's HTML before injecting it:
//  1. RE-SERIALIZE through the parser so stray/unclosed tags get balanced. A weak
//     model sometimes emits an unclosed <svg>/<div>; left as-is, everything after it
//     (including our runtime <script>, if it were in <body>) gets swallowed into the
//     open element. Parsing + re-serializing auto-closes them deterministically.
//  2. Unwrap a stray outer `.takt-page` the model sometimes adds (we add our own),
//     so we don't nest two grids.
// Runs in the browser (parent app or Playwright preview).
function normalize(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    let body: HTMLElement = doc.body;
    while (body.children.length === 1 && (body.children[0] as HTMLElement).classList?.contains("takt-page")) {
      body = body.children[0] as HTMLElement;
    }
    return body.innerHTML;
  } catch {
    return html;
  }
}

/** Pre-render every <takt-mermaid> to inline SVG in the PARENT (Next bundles
 *  mermaid) so the sandboxed frame needs no CDN — a srcdoc frame inherits the app's
 *  default-src 'self' CSP and couldn't fetch one anyway. Call before buildFrameSrcdoc.
 *  securityLevel:"strict" + the frame sandbox are the two mitigations for mermaid's
 *  XSS history. Falls back to leaving the source text on any failure. */
export async function prepareCanvasHtml(html: string, opts: { dark: boolean }): Promise<string> {
  if (!/<takt-mermaid/i.test(html)) return html;
  try {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: opts.dark ? "dark" : "neutral", fontFamily: "ui-sans-serif, system-ui, sans-serif" });
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nodes = Array.from(doc.querySelectorAll("takt-mermaid"));
    let i = 0;
    for (const n of nodes) {
      const src = (n.textContent || "").trim();
      if (src.length < 6) continue;
      try {
        const { svg } = await mermaid.render("tm-pre-" + i++ + "-" + Math.random().toString(36).slice(2), src);
        n.innerHTML = svg;
        n.classList.add("takt-mermaid");
        n.setAttribute("data-rendered", "1");
      } catch { /* invalid syntax — leave the source text */ }
    }
    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

// The runtime is INLINED into every srcdoc (fetched once, cached). It must not be
// an external <script src>: in the sandboxed (opaque-origin) frame, a dynamic
// import() issued from an external classic script fails (module-viewer never
// loads), while the same import from an inline script works — and inlining also
// matches how claude.ai injects its frame runtime verbatim into the <head>.
let RUNTIME = "";
async function frameRuntime(): Promise<string> {
  if (!RUNTIME) {
    try {
      const src = await (await fetch("/takt-frame-runtime.js")).text();
      // an inline classic script ends at the first `</script`; escape any in strings
      RUNTIME = src.replace(/<\/script/gi, "<\\/script");
    } catch { /* fall back to the external tag below */ }
  }
  return RUNTIME;
}

/** The full document string to drop into an iframe `srcdoc`. */
export async function buildFrameSrcdoc(html: string, opts: { dark: boolean }): Promise<string> {
  const inner = normalize(html);
  const rt = await frameRuntime();
  return (
    '<!doctype html><html' + (opts.dark ? ' class="dark"' : "") + "><head>" +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' +
    // Runtime in <head> with defer: it runs after the document is fully parsed but
    // CANNOT be swallowed by malformed body HTML (an unclosed <svg> etc.). This is
    // why auto-height/theme/islands stay reliable even on a broken model page.
    (rt ? '<script defer>' + rt + "</scr" + "ipt>" : '<script defer src="/takt-frame-runtime.js"></scr' + "ipt>") +
    "<style>" + CANVAS_CSS + "</style></head><body>" +
    '<div class="takt-page">' + inner + "</div>" +
    "</body></html>"
  );
}
