// Self-check for the two bits of non-trivial artifact logic in services/agent/src/tools.ts:
//   1. the emit_artifact compile gate (esbuild rejects broken React, accepts valid)
//   2. the crop_page_image fraction→pixel clamp (box always stays inside the page)
// Run: node scripts/test-artifact-gate.mjs
import assert from "node:assert";
import { transform } from "esbuild";

// 1. Compile gate — mirrors the call in emit_artifact.
const compiles = async (code) => {
  try { await transform(code, { loader: "tsx", jsx: "automatic" }); return true; }
  catch { return false; }
};
assert.equal(await compiles("export default function App(){ return <div>ok</div>; }"), true, "valid TSX should pass");
assert.equal(await compiles("export default function App(){ return <div> }"), false, "unclosed JSX should be rejected");
assert.equal(await compiles("const x = (=> {"), false, "syntax garbage should be rejected");

// 2. Crop clamp — mirrors the formula in crop_page_image.
function clampBox(x, y, w, h, imgW, imgH) {
  const left = Math.min(Math.max(Math.round(x * imgW), 0), imgW - 1);
  const top = Math.min(Math.max(Math.round(y * imgH), 0), imgH - 1);
  const cw = Math.min(Math.max(Math.round(w * imgW), 1), imgW - left);
  const ch = Math.min(Math.max(Math.round(h * imgH), 1), imgH - top);
  return { left, top, cw, ch };
}
const a = clampBox(0.25, 0.1, 0.5, 0.4, 1000, 800);
assert.deepEqual(a, { left: 250, top: 80, cw: 500, ch: 320 }, "normal crop maps to pixels");
// A box that overflows the right/bottom edge gets clamped to stay inside.
const b = clampBox(0.9, 0.9, 0.5, 0.5, 1000, 800);
assert.ok(b.left + b.cw <= 1000 && b.top + b.ch <= 800, "overflowing crop stays in bounds");
assert.ok(b.cw >= 1 && b.ch >= 1, "crop has positive size");

// 3. Artifact lint — mirrors lintArtifact() in services/agent/src/tools.ts.
function lintArtifact(code) {
  const issues = [];
  if (/\bprox-crop\b/.test(code) || /<img[^>]*style=["'][^"']*transform\s*:[^"']*(scale|translate)\s*\(/i.test(code))
    issues.push("css-crop");
  const badImg = [...code.matchAll(/<img[^>]*\bsrc=["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]).find((u) => !u.includes("/assets/"));
  if (badImg) issues.push("bad-img");
  if (/<(div|p|li)\b[^>]*>\s*\[p\.?\s*\d+[^<]*\]\s*<\/\1>/i.test(code)) issues.push("boxed-citation");
  if (/<(div|p|li)\b[^>]*>\s*[.:;,]+\s*<\/\1>/i.test(code)) issues.push("stray-punct");
  return issues;
}
// clean artifact → no issues
assert.deepEqual(lintArtifact('<div class="prox-doc"><p>Shade 10 helmet [p.18].</p><figure class="prox-figure"><img src="/assets/crops/x.png"/></figure></div>'), [], "clean artifact passes");
// each bad pattern is caught
assert.ok(lintArtifact('<div class="prox-crop"><img src="/assets/x.png"/></div>').includes("css-crop"), "css-crop caught");
assert.ok(lintArtifact('<img src="/assets/x.png" style="transform:scale(2) translate(-18%,-22%)"/>').includes("css-crop"), "transform crop caught");
assert.ok(lintArtifact('<img src="https://example.com/x.png"/>').includes("bad-img"), "external image caught");
assert.ok(lintArtifact('<div class="prox-callout">[p.18]</div>').includes("boxed-citation"), "boxed citation caught");
assert.ok(lintArtifact('<p>.</p>').includes("stray-punct"), "stray punctuation caught");
// a real full-page URL and inline citation must NOT trip the lint
assert.deepEqual(lintArtifact('<p>Use <b>DCEP</b> for stainless [p.14].</p>'), [], "inline citation is fine");

console.log("artifact-gate tests passed");
