// The canvas is streamed as a single HTML string inside a `create_canvas({html})`
// tool call. The provider streams the tool ARGUMENTS token-by-token as a partial
// JSON string; this decoder pulls the decoded HTML out of that partial JSON so
// the client can morphdom the page in live ("types itself in") — the same trick
// claude.ai's generative UI uses. It tolerates a chunk boundary mid-escape.

/** Extract the decoded value of the top-level `"html"` string from a (possibly
 *  incomplete) JSON args string. Returns "" until the key/opening-quote appears,
 *  then the HTML decoded so far. Stops cleanly at an incomplete trailing escape. */
export function decodeStreamingHtml(args: string): string {
  const ki = args.indexOf('"html"');
  if (ki === -1) return "";
  let i = args.indexOf(":", ki + 6);
  if (i === -1) return "";
  i++;
  while (i < args.length && /\s/.test(args[i]!)) i++;
  if (args[i] !== '"') return "";
  i++; // past opening quote
  let out = "";
  while (i < args.length) {
    const c = args[i]!;
    if (c === '"') break; // closing quote → value complete
    if (c === "\\") {
      const n = args[i + 1];
      if (n === undefined) break; // escape split across chunks — resume next delta
      if (n === "u") {
        if (i + 6 > args.length) break; // incomplete \uXXXX
        out += String.fromCharCode(parseInt(args.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      out += ({ '"': '"', "\\": "\\", "/": "/", n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[n] ?? n;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// ── self-check: `tsx src/canvas.ts` ──────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  assert(decodeStreamingHtml('{"html":"<h1>Hi</h1>') === "<h1>Hi</h1>", "partial (no closing quote)");
  assert(decodeStreamingHtml('{"html":"<p>a\\nb"}') === "<p>a\nb", "escaped newline");
  assert(decodeStreamingHtml('{"html":"say \\"hi\\""}') === 'say "hi"', "escaped quotes → value ends at real close");
  assert(decodeStreamingHtml('{"html":"2\\u00b0C"}') === "2°C", "unicode escape");
  assert(decodeStreamingHtml('{"html":"a\\') === "a", "incomplete escape at chunk end");
  assert(decodeStreamingHtml('{"html":"a\\u00') === "a", "incomplete unicode at chunk end");
  assert(decodeStreamingHtml('{"title":"x"}') === "", "no html key yet");
  assert(decodeStreamingHtml('{"html"') === "", "key but no value yet");
  console.log("canvas decoder self-check ok");
}
