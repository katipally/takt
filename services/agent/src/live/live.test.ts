import assert from "node:assert/strict";
import sharp from "sharp";
import { SentenceChunker, cleanForSpeech } from "./sentence.js";
import { VisionController, isVisualQuestion } from "./vision.js";

// Pure-logic self-checks for the live pipeline. Run: pnpm --filter @prox/agent test:live
async function main() {
  // SentenceChunker: emit on real boundary, never split decimals or citations.
  {
    const c = new SentenceChunker();
    assert.deepEqual(
      c.push("Set it to 3.5 volts for 0.030 inch wire on page 18. "),
      ["Set it to 3.5 volts for 0.030 inch wire on page 18."],
      "must not split inside 3.5 / 0.030",
    );
  }
  {
    const c = new SentenceChunker();
    assert.deepEqual(c.push("Ok. "), [], "sub-MIN fragment held back");
    assert.deepEqual(c.push("Now tighten the valve fully. "), ["Ok. Now tighten the valve fully."], "short fragment merged with next");
  }
  {
    const c = new SentenceChunker();
    c.push("Use shade 10 minimum");
    assert.equal(c.flush(), "Use shade 10 minimum", "flush returns the partial tail");
  }

  // cleanForSpeech: strip citations + markdown so TTS reads clean prose.
  assert.equal(cleanForSpeech("Use **shade 10** [p.18] now."), "Use shade 10 now.");

  // Visual-question heuristic.
  assert.equal(isVisualQuestion("what is this thing"), true);
  assert.equal(isVisualQuestion("tell me the warranty length"), false);

  // Vision dedup: identical scene not re-attached; a changed scene is.
  const solid = await sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 200, g: 40, b: 40 } } }).jpeg().toBuffer();
  const changed = await sharp({ create: { width: 48, height: 48, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .composite([{ input: { create: { width: 48, height: 24, channels: 3, background: { r: 15, g: 15, b: 15 } } }, top: 0, left: 0 } as any])
    .jpeg().toBuffer();
  const v = new VisionController();
  v.setCamera(true);
  await v.addFrame(solid);
  assert.equal(v.freshestFrames().length, 1, "first frame attaches");
  await v.addFrame(solid);
  assert.equal(v.freshestFrames().length, 0, "identical scene is not re-attached");
  await v.addFrame(changed);
  assert.equal(v.freshestFrames().length, 1, "changed scene re-attaches");
  await v.addFrame(solid);
  assert.equal(v.freshestFrames({ force: true }).length, 1, "force always attaches");

  // Voice-only: camera off ⇒ never any frames.
  const off = new VisionController();
  await off.addFrame(solid);
  assert.equal(off.freshestFrames({ force: true }).length, 0, "camera off ⇒ no frames");

  console.log("✓ live self-checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
