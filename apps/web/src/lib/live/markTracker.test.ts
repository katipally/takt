// Pure-core tests for the live mark tracker (no DOM needed):
//   node --experimental-strip-types markTracker.test.ts
import assert from "node:assert";
import { bestMatch, grabPatch, trackables, applyTrack, PATCH, LOST_SCORE } from "./markTracker.ts";

const W = 160, H = 120;

// A synthetic scene with texture everywhere (so matches are unambiguous):
// a diagonal gradient plus a bright blob whose position we control.
function scene(bx: number, by: number): Uint8Array {
  const f = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = ((x * 3 + y * 2) % 97) + ((x * y) % 31); // repeatable texture
    const dx = x - bx, dy = y - by;
    if (dx * dx + dy * dy < 36) v += 120; // the "object"
    f[y * W + x] = Math.min(255, v);
  }
  return f;
}

// 1. A patch grabbed on the object is found again after the scene shifts.
{
  const a = scene(80, 60);
  const tpl = grabPatch(a, W, H, 80, 60)!;
  assert(tpl && tpl.length === PATCH * PATCH, "patch grabbed");
  const b = scene(87, 55); // object moved (+7, -5)
  const m = bestMatch(b, W, H, tpl, 80, 60);
  assert(Math.abs(m.x - 87) <= 1 && Math.abs(m.y - 55) <= 1, `tracks the shift (got ${m.x},${m.y})`);
  assert(m.score < LOST_SCORE, `good match scores under LOST (${m.score.toFixed(1)})`);
}

// 2. When the object disappears, the best score is clearly a non-match.
{
  const a = scene(80, 60);
  const tpl = grabPatch(a, W, H, 80, 60)!;
  const gone = scene(-100, -100); // same texture, object gone
  const m = bestMatch(gone, W, H, tpl, 80, 60);
  assert(m.score > LOST_SCORE, `missing object scores over LOST (${m.score.toFixed(1)})`);
}

// 3. Edge anchors can't produce a full patch → null (caller drops them).
assert(grabPatch(scene(0, 0), W, H, 2, 2) === null, "edge patch rejected");

// 4. No motion → exact position, near-zero score (template adaptation gate).
{
  const a = scene(40, 90);
  const tpl = grabPatch(a, W, H, 40, 90)!;
  const m = bestMatch(a, W, H, tpl, 40, 90);
  assert(m.x === 40 && m.y === 90 && m.score < 1, "static frame is a perfect match");
}

// 5. Overlay glue: arrows track by tip, movement translates rigidly, losses drop.
{
  const o = {
    overlayId: "t", kind: "marks" as const,
    marks: [
      { shape: "arrow" as const, from: { x: 0.2, y: 0.2 }, to: { x: 0.5, y: 0.5 } },
      { shape: "ring" as const, at: { x: 0.8, y: 0.3 }, r: 0.05 },
    ],
  };
  const pts = trackables(o);
  assert(pts.length === 2 && pts[0]!.x === 0.5 && pts[1]!.x === 0.8, "arrow tracked by tip, ring by center");
  const moved = applyTrack(o, new Map([["m0", { x: 0.6, y: 0.55 }]]), [])!;
  const a = moved.marks![0]!;
  assert(Math.abs(a.to!.x - 0.6) < 1e-9 && Math.abs(a.from!.x - 0.3) < 1e-9, "arrow translates rigidly (tail follows tip)");
  assert(moved.marks![1]!.at!.x === 0.8, "untouched mark stays put");
  const dropped = applyTrack(o, new Map(), ["m0"])!;
  assert(dropped.marks!.length === 1 && dropped.marks![0]!.shape === "ring", "lost mark drops");
  assert(applyTrack(o, new Map(), ["m0", "m1"]) === null, "all lost → overlay gone");
  const pin = { overlayId: "p", kind: "note" as const, caption: "x", anchor: { x: 0.4, y: 0.4 } };
  assert(applyTrack(pin, new Map(), ["anchor"]) === null, "lost pin → overlay gone");
  assert(applyTrack(pin, new Map([["anchor", { x: 0.45, y: 0.42 }]]), [])!.anchor!.x === 0.45, "pin follows");
}

console.log("markTracker.test.ts: all assertions passed");
