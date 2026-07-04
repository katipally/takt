// Streaming sentence splitter for the LLM text delta stream, so TTS can start
// speaking sentence 1 while the model still generates sentence 2. Splits on
// .!? + whitespace, but NOT inside decimals ("3.5") or page citations
// ("[p.18]") — both of those keep a non-space char right after the dot, so the
// boundary test naturally skips them. Merges sub-MIN fragments so TTS never
// synthesizes a one-word blip.

const MIN = 16;

export class SentenceChunker {
  private buf = "";

  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    let scan = 0; // where to resume searching after a merged (too-short) boundary
    while (scan < this.buf.length) {
      const b = nextBoundary(this.buf, scan);
      if (b === -1) break;
      const candidate = this.buf.slice(0, b + 1).trim();
      if (candidate.length >= MIN) {
        out.push(candidate);
        this.buf = this.buf.slice(b + 1).replace(/^\s+/, "");
        scan = 0;
      } else {
        scan = b + 1; // too short — keep it, look for the next boundary to merge
      }
    }
    return out;
  }

  /** Remaining buffered text at end of turn (may be a partial sentence). */
  flush(): string {
    const r = this.buf.trim();
    this.buf = "";
    return r;
  }
}

// Index of the sentence-ending punctuation for the first real boundary at/after
// `from`, or -1. A boundary is .!? followed by whitespace or end-of-string.
function nextBoundary(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    const c = s[i]!;
    if (c === "." || c === "!" || c === "?") {
      const next = s[i + 1];
      if (next === undefined || /\s/.test(next)) return i;
    }
  }
  return -1;
}

/** Strip markdown/citations/URLs so TTS reads clean prose, not symbols. */
export function cleanForSpeech(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[p\.?\s*\d+[^\]]*\]/gi, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\((https?:[^)]+)\)/g, "$1")
    .replace(/[#*_>|~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
