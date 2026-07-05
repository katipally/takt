// Pure text logic for the voice loop, split out from voiceEngine so it has no
// browser deps and can be unit-tested (see voiceText.test.ts). Covers: dropping
// Whisper silence-hallucinations, spotting a mid-thought pause, cleaning text
// before TTS, and chunking the reply stream into stable-length speakable pieces.

export const MIN_TTS_CHARS = 40; // don't hand Kokoro a tiny fragment — short
                                 // snippets render with an unstable timbre.

// Whisper hallucinates these on silence/ambient noise — never treat as a turn.
// Kept tight: only true silence artifacts. Real short answers ("okay", "yeah",
// "so", "bye", "no") must register as turns, so they are NOT here.
const HALLUCINATIONS = new Set(["", "you", "thank you", "thank you.", "thanks for watching", "thank you for watching", "thanks for watching!", "please subscribe", "subtitles by the amara.org community"]);

export function isJunk(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  return t.length < 2 || HALLUCINATIONS.has(t);
}

// Words that, at the very end of an utterance, usually mean "I'm not done yet".
const TRAILING = new Set(["to","the","a","an","and","but","so","or","of","for","with","my","your","is","are","it","that","this","on","at","in","because","if","when","then","like","about","into","um","uh"]);
export function endsMidThought(text: string): boolean {
  // Keep digits — "set it to 250" ends on "250", NOT on the filler "to" (stripping
  // numbers first made a complete sentence look unfinished and stalled the turn).
  const w = text.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim().split(/\s+/);
  const last = w[w.length - 1];
  return !!last && TRAILING.has(last);
}

// Strip markdown so the voice never reads out "-", "*", "#", or "[p.18]" symbols,
// and scrub photo-narration ("the image/photo/…") into natural spoken language as
// a backstop to the prompt — with the camera on the agent should talk about
// "what I'm seeing", not "the image".
export function stripMarkdown(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")   // links → text
    .replace(/`([^`]*)`/g, "$1")                // inline code
    .replace(/[*_~#>]+/g, "")                   // bold/italic/heading/quote marks
    .replace(/^\s*[-•]\s+/gm, "")               // list bullets
    .replace(/^\s*\d+\.\s+/gm, "")              // numbered lists
    .replace(/\[p\.\s*\d+\]/gi, "")             // citation tokens
    .replace(/\bin (?:the|this|your) (?:image|photo|picture|frame)\b/gi, "here")
    .replace(/\b(?:the|this|that|your) (?:image|photo|picture|frame)\b/gi, "this")
    .replace(/\s+/g, " ")
    .trim();
}

// Split a growing text stream into speakable chunks (keep decimals/abbrevs).
// Completed sentences shorter than MIN_TTS_CHARS are held and merged with the
// next one before emitting — so Kokoro always gets enough text to keep a single,
// consistent voice instead of re-rendering tiny fragments oddly.
export class SentenceChunker {
  private buf = "";      // text after the last completed sentence
  private ready = "";    // completed sentences not yet long enough to speak
  push(t: string): string[] {
    this.buf += t;
    const out: string[] = [];
    const re = /[^.!?]+[.!?]+(?:\s|$)/g;
    let m: RegExpExecArray | null, last = 0;
    while ((m = re.exec(this.buf))) {
      this.ready += m[0];
      last = re.lastIndex;
      if (this.ready.trim().length >= MIN_TTS_CHARS) { out.push(this.ready.trim()); this.ready = ""; }
    }
    if (last) this.buf = this.buf.slice(last);
    return out;
  }
  flush(): string { const s = (this.ready + this.buf).trim(); this.ready = ""; this.buf = ""; return s; }
}
