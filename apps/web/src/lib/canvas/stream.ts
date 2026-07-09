import morphdom from "morphdom";
import DOMPurify from "dompurify";

// Incremental canvas renderer. The backend streams raw HTML (the FULL decoded
// page so far on every canvas_delta — idempotent REPLACE). We parse it with the
// browser's forgiving HTML parser (auto-closes unclosed tags — this IS the
// incremental parser) and morphdom-diff it into the live .takt-page container so
// only changed nodes touch the DOM. On the final frame we DOMPurify the page,
// then re-create <script> nodes so the model's client JS (calculators, chart
// draws) runs exactly once. The app CSP (connect-src 'self') is the exfiltration
// fence for those scripts.

const CUSTOM_TAGS = ["takt-cite", "takt-figure", "takt-video", "takt-model", "takt-action", "takt-mermaid"];
// Non-standard attributes on the islands DOMPurify would otherwise strip.
// (data-* / class / style / src / id / href are allowed by default.)
const EXTRA_ATTR = ["legend", "annos", "caption", "variant", "page", "product", "fignum", "value", "label", "poster", "alt", "target", "rel"];

function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: [...CUSTOM_TAGS, "script"],
    ADD_ATTR: EXTRA_ATTR,
    FORCE_BODY: true,
    CUSTOM_ELEMENT_HANDLING: { tagNameCheck: /^takt-/, attributeNameCheck: /.*/, allowCustomizedBuiltInElements: false },
  }) as unknown as string;
}

// innerHTML/morphdom-inserted <script> tags don't auto-run — re-create them so
// the model's client-side logic executes (scoped to the canvas container).
function runScripts(container: HTMLElement) {
  container.querySelectorAll("script").forEach((old) => {
    const s = document.createElement("script");
    for (const attr of Array.from(old.attributes)) s.setAttribute(attr.name, attr.value);
    s.textContent = old.textContent;
    old.parentNode?.replaceChild(s, old);
  });
}

export function applyCanvasHtml(container: HTMLElement, html: string, opts: { final: boolean }) {
  const clean = opts.final ? sanitize(html) : html;
  const doc = new DOMParser().parseFromString(clean, "text/html");
  // Never execute half-written scripts against a mid-stream DOM.
  if (!opts.final) doc.querySelectorAll("script").forEach((s) => s.remove());
  morphdom(container, doc.body, {
    childrenOnly: true,
    onBeforeElUpdated: (a, b) => {
      // Islands (takt-*) render their OWN internal DOM (an <img>, a <video>, a 3D
      // tile). The model's source HTML for them is empty, so a naive diff would
      // wipe what the island built on the next delta. Skip identical nodes, and
      // never let morphdom reset an already-upgraded island.
      if (a.isEqualNode(b)) return false;
      return true;
    },
    // Once an island has built its own DOM (img / video / rendered mermaid SVG),
    // leave its children alone — the model's source for it is empty, so a diff
    // would wipe what the island rendered. Islands that haven't rendered yet
    // (a mermaid still streaming its source text) DO get their children updated.
    onBeforeElChildrenUpdated: (fromEl) => !(fromEl as unknown as { __islandRendered?: boolean }).__islandRendered,
    onNodeAdded: (node) => {
      if (node.nodeType === 1) (node as Element).classList?.add("takt-fade-in");
      return node;
    },
  });
  if (opts.final) { try { runScripts(container); } catch { /* model script threw */ } }
}
