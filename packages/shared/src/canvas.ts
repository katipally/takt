// The canvas travels as PLAIN TEXT between markers — the model streams
//   ...optional plan prose...
//   <takt:canvas title="...">
//   <style>…</style> …page html… <script>…</script>
//   </takt:canvas>
// No JSON escaping, so weak models can't botch it, streaming preview is a plain
// substring, and a max_tokens truncation is simply an unclosed marker the worker
// can ask the model to continue. (Same shape as Claude's write-a-file contract.)

const OPEN = /<takt:canvas\b([^>]*)>/i;
const CLOSE = /<\/takt:canvas\s*>/i;

/** HTML streamed so far: everything after the opening marker (streaming preview).
 *  "" until the marker appears. Trailing ``` fences and a partial closing marker
 *  are trimmed so the preview never flashes marker debris. */
export function extractCanvasStream(text: string): string {
  const m = OPEN.exec(text);
  if (!m) return "";
  let html = text.slice(m.index + m[0].length);
  const c = CLOSE.exec(html);
  if (c) html = html.slice(0, c.index);
  // trim a partially-streamed closing marker / fence at the tail
  return html.replace(/<\/?t?a?k?t?:?c?a?n?v?a?s?$|```\w*\s*$/i, "");
}

export interface CanvasBlock {
  html: string;
  title?: string;
  /** false = the closing marker never arrived (truncated output) */
  closed: boolean;
}

/** Parse the finished (or truncated) canvas block out of the model's text.
 *  Returns null until the opening marker exists. */
export function extractCanvas(text: string): CanvasBlock | null {
  const m = OPEN.exec(text);
  if (!m) return null;
  const title = m[1]?.match(/title\s*=\s*"([^"]*)"/i)?.[1] || m[1]?.match(/title\s*=\s*'([^']*)'/i)?.[1];
  const rest = text.slice(m.index + m[0].length);
  const c = CLOSE.exec(rest);
  const html = (c ? rest.slice(0, c.index) : rest).replace(/^\s*```\w*\s*/i, "").replace(/```\s*$/i, "").trim();
  return { html, title: title || undefined, closed: !!c };
}

// ── self-check: `tsx src/canvas.ts` ──────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  const full = 'Plan: blue, serif.\n<takt:canvas title="Nozzle Guide">\n<style>.takt-page{}</style><h1>Hi</h1>\n</takt:canvas>\nDone.';
  assert(extractCanvas(full)?.title === "Nozzle Guide", "title parsed");
  assert(extractCanvas(full)?.closed === true, "closed block detected");
  assert(extractCanvas(full)!.html.includes("<h1>Hi</h1>") && !extractCanvas(full)!.html.includes("Plan:"), "html between markers only");
  const trunc = '<takt:canvas title="X"><h1>Hi</h1><p>cut of';
  assert(extractCanvas(trunc)?.closed === false, "truncation = unclosed");
  assert(extractCanvas(trunc)!.html.includes("cut of"), "truncated html kept");
  assert(extractCanvas("no marker here") === null, "no marker → null");
  assert(extractCanvasStream("before <takt:canvas><h1>A</h1>") === "<h1>A</h1>", "stream after marker");
  assert(extractCanvasStream("<takt:canvas><h1>A</h1></takt:can") === "<h1>A</h1>", "partial close trimmed");
  assert(extractCanvasStream("nothing yet") === "", "empty before marker");
  const fenced = '<takt:canvas>\n```html\n<h1>F</h1>\n```\n</takt:canvas>';
  assert(extractCanvas(fenced)!.html === "<h1>F</h1>", "code fences stripped");
  console.log("canvas marker self-check ok");
}
