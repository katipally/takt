// Deterministic post-build fact check for the canvas: every "number + unit"
// token on the finished page must appear somewhere in the material gathered
// this turn (graph entity values + retrieved passages — the same GATHERED FACTS
// the composer was given). No LLM judge: the graph build is deterministic, so a
// value either came from the docs or it didn't. Only units that occur in the
// gathered material are checked, which keeps model-computed numbers with
// unrelated units (step counts, layout px, calculator outputs) out of scope.
// ponytail: unit-scoped allowlist, no name↔value pairing — pairing needs NER;
// add it if unit-level checking proves too coarse.

export interface SpecCheck {
  /** number+unit tokens on the page whose unit is covered by gathered facts */
  checked: number;
  /** tokens whose value never occurs in the gathered facts for that unit */
  flagged: string[];
}

// Units worth checking on a product-support page. Case matters for A/V/W/Hz.
const UNIT_SRC = "°\\s?[CF]|℃|℉|%|mm|cm|Nm|N·m|rpm|ipm|psi|bar|kPa|MPa|kW|kg|Hz|kHz|[AVW]";
const NUM_SRC = "\\d[\\d,]*(?:\\.\\d+)?";
const token = () =>
  new RegExp(`(${NUM_SRC})(?:\\s?[–—-]\\s?(${NUM_SRC}))?\\s?(${UNIT_SRC})(?![\\w°])`, "g");

const normUnit = (u: string) =>
  u.replace(/\s+/g, "").replace("℃", "°C").replace("℉", "°F").replace("N·m", "Nm");
const normNum = (n: string) => parseFloat(n.replace(/,/g, ""));

function pairs(text: string): { v: number; unit: string; raw: string }[] {
  const out: { v: number; unit: string; raw: string }[] = [];
  for (const m of text.matchAll(token())) {
    const unit = normUnit(m[3]!);
    out.push({ v: normNum(m[1]!), unit, raw: m[0]! });
    if (m[2]) out.push({ v: normNum(m[2]), unit, raw: m[0]! });
  }
  return out;
}

// Strip markup AND unescape the entities models actually emit around specs
// ("215&nbsp;&deg;C", "50&ndash;60") — without this, entity-encoded values are
// silently skipped and the check undercounts.
const visibleText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|#160|#xa0|thinsp|#8201|ensp|emsp);/gi, " ")
    .replace(/&(deg|#176);/gi, "°")
    .replace(/&(ndash|#8211|mdash|#8212);/gi, "–")
    .replace(/&amp;/gi, "&");

/** Check the built page's numeric specs against the gathered ground truth. */
export function checkSpecValues(canvasHtml: string, groundText: string): SpecCheck {
  const allowed = new Map<string, Set<number>>();
  for (const p of pairs(groundText)) (allowed.get(p.unit) ?? allowed.set(p.unit, new Set()).get(p.unit)!).add(p.v);
  let checked = 0;
  const flagged: string[] = [];
  const seen = new Set<string>();
  for (const p of pairs(visibleText(canvasHtml))) {
    const set = allowed.get(p.unit);
    if (!set) continue; // unit never gathered → out of scope
    checked++;
    if (!set.has(p.v) && !seen.has(p.raw)) { seen.add(p.raw); flagged.push(p.raw); }
  }
  return { checked, flagged };
}

/** One repair instruction listing every unsupported value. */
export function specFeedback(c: SpecCheck): string {
  return `DETERMINISTIC FACT-CHECK FAILED — these values on your page do not appear anywhere in the GATHERED FACTS: ${c.flagged.join(", ")}. Every numeric spec must be copied VERBATIM from the gathered facts (same value, same unit, same condition — never carry a number from an adjacent row or convert units yourself). Correct each one to the retrieved value, or remove the number. Return the FULL corrected page between <takt:canvas> markers, changing nothing else.`;
}

// ── self-check: `tsx src/spec-check.ts` ─────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); process.exit(1); } };
  const ground = "PLA nozzle temperature = 215 °C (p.50). Bed: 60 °C. Duty cycle 25 % at 90 A. Layer 0.2 mm–0.3 mm.";
  const ok = checkSpecValues("<h1>PLA</h1><p>Print at 215 °C, bed 60 °C, 0.2 mm layers.</p>", ground);
  a(ok.flagged.length === 0 && ok.checked === 3, "all grounded values pass");
  const bad = checkSpecValues("<p>Print at 230 °C and 25 %.</p>", ground);
  a(bad.flagged.length === 1 && bad.flagged[0]!.includes("230"), "an invented temperature is flagged");
  a(checkSpecValues("<p>Wait 5 min, tighten 4 screws.</p>", ground).checked === 0, "ungathered units are out of scope");
  a(checkSpecValues("<p>Range 215–230 °C.</p>", "215 °C to 230 °C").flagged.length === 0, "range endpoints match");
  a(checkSpecValues("<script>let x='999 °C'</script><p>215 °C</p>", ground).flagged.length === 0, "script content is skipped");
  a(checkSpecValues("<p>90A</p>", ground).flagged.length === 0, "no-space unit token matches");
  a(checkSpecValues("<p>1,200 rpm</p>", "1200 rpm max").flagged.length === 0, "comma thousands normalize");
  const ent = checkSpecValues("<p>215&nbsp;&deg;C and 50&ndash;60&nbsp;&deg;C</p>", `${ground} Bed range 50-60 °C.`);
  a(ent.checked === 3 && ent.flagged.length === 0, "entity-encoded values are checked, not skipped");
  a(checkSpecValues("<p>230&nbsp;&deg;C</p>", ground).flagged.length === 1, "entity-encoded wrong value is flagged");
  console.log("spec-check self-check ok");
}
