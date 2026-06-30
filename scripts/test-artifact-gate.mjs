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

console.log("artifact-gate tests passed");
