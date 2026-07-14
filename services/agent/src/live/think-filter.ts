// Some providers (MiniMax M2.x always-on; M3 when thinking is enabled) stream
// their reasoning INLINE in the text channel as <think>…</think>. A live call
// SPEAKS the text stream, so any leaked reasoning gets read aloud — strip it
// at the source. Streaming-safe: markers can split across deltas, and the
// observed leak includes malformed tags ("<thinkThe user…", "</think<think"),
// so we match on the bare markers and swallow one trailing ">" when present.

const OPEN = "<think";
const CLOSE = "</think";

/** Stateful per-turn filter: feed text deltas, get speakable text back. */
export function makeThinkFilter(): (chunk: string) => string {
  let inThink = false;
  let carry = ""; // tail held back in case a marker is split across chunks
  return (chunk: string): string => {
    let s = carry + chunk;
    carry = "";
    let out = "";
    for (;;) {
      if (inThink) {
        const end = s.indexOf(CLOSE);
        if (end === -1) {
          // keep a tail long enough to complete a split "</think"
          carry = s.slice(Math.max(0, s.length - (CLOSE.length - 1)));
          return out;
        }
        s = s.slice(end + CLOSE.length);
        if (s.startsWith(">")) s = s.slice(1);
        else if (!s) { carry = ""; inThink = false; return out; } // ">" may arrive next chunk — harmless if it doesn't
        inThink = false;
      } else {
        const start = s.indexOf(OPEN);
        if (start === -1) {
          // hold back a tail that could be the start of a split "<think"
          const keep = Math.max(0, s.length - (OPEN.length - 1));
          const tail = s.slice(keep);
          const lt = tail.lastIndexOf("<");
          if (lt !== -1 && OPEN.startsWith(tail.slice(lt))) {
            out += s.slice(0, keep + lt);
            carry = s.slice(keep + lt);
          } else {
            out += s;
          }
          return out;
        }
        out += s.slice(0, start);
        s = s.slice(start + OPEN.length);
        if (s.startsWith(">")) s = s.slice(1);
        inThink = true;
      }
    }
  };
}

/** One-shot strip for a complete turn's text (assistant history). */
export function stripThink(text: string): string {
  const f = makeThinkFilter();
  return (f(text) + f("")).replace(/[ \t]{2,}/g, " ").trim();
}

// ── self-check: `tsx src/live/think-filter.ts` ──────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  const run = (chunks: string[]) => { const f = makeThinkFilter(); return chunks.map(f).join("") + f(""); };
  assert(run(["hello world"]) === "hello world", "plain text passes");
  assert(run(["a<think>secret</think>b"]) === "ab", "single-chunk strip");
  assert(run(["a<thi", "nk>sec", "ret</thi", "nk>b"]) === "ab", "markers split across chunks");
  assert(run(["a<thinkNo bracket</think>b"]) === "ab", "malformed open tag (no >)");
  assert(run(["a<think>one</think<think>two</think>b"]) === "ab", "back-to-back malformed close");
  assert(run(["say 2 < 3 ok"]) === "say 2 < 3 ok", "lone < untouched");
  assert(run(["tail holds <t", "hink>x</think>done"]) === "tail holds done", "partial tail completes");
  assert(run(["open only <think>never closes"]) === "open only ", "unclosed think swallowed");
  assert(stripThink("<think>plan</think>The answer is 215.") === "The answer is 215.", "stripThink one-shot");
  console.log("think-filter self-check ok");
}
