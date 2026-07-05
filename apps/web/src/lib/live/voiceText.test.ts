// Runnable self-check (no framework): `node src/lib/live/voiceText.test.ts`.
// Guards the non-trivial voice string logic — chunk merging (voice stability),
// junk filtering (turn detection), and TTS scrubbing.
import assert from "node:assert";
import { isJunk, endsMidThought, stripMarkdown, SentenceChunker, MIN_TTS_CHARS } from "./voiceText.ts";

// isJunk: silence artifacts dropped, real short answers kept.
assert.equal(isJunk("thank you for watching"), true);
assert.equal(isJunk("you"), true);
assert.equal(isJunk("i"), true);            // < 2 chars
assert.equal(isJunk("okay"), false);        // real short answer
assert.equal(isJunk("yeah"), false);
assert.equal(isJunk("so"), false);
assert.equal(isJunk("no"), false);

// endsMidThought: trailing filler = keep listening.
assert.equal(endsMidThought("i want to"), true);
assert.equal(endsMidThought("set it to 250"), false);

// stripMarkdown: symbols gone, citations gone, photo-narration scrubbed.
assert.equal(stripMarkdown("Set it to **250** [p.18]."), "Set it to 250 .");
assert.equal(stripMarkdown("In the image I see a dial"), "here I see a dial");
assert.equal(stripMarkdown("The photo shows a knob"), "this shows a knob");
assert.ok(!/image|photo|picture/i.test(stripMarkdown("Look at the picture and the image")));

// SentenceChunker: full sentences emit; tiny trailing fragments merge, never
// emitted alone (the "different voice" fix).
{
  const c = new SentenceChunker();
  const long = "This is a full first sentence that clears the length bar easily.";
  const out = c.push(long + " Yeah.");
  assert.equal(out.length, 1);                    // only the long one emits
  assert.ok(out[0]!.length >= MIN_TTS_CHARS);
  assert.equal(c.flush(), "Yeah.");               // the tiny bit is held for the tail
}
{
  // Two short sentences: neither clears the bar alone, so nothing is spoken
  // mid-stream; both come out merged on flush (no lone tiny fragment to TTS).
  const c = new SentenceChunker();
  const out = c.push("Hi. Yeah. ");
  assert.equal(out.length, 0);
  assert.equal(c.flush(), "Hi. Yeah.");
}

console.log("voiceText.test.ts: all assertions passed");
