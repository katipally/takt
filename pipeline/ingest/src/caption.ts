import { streamProvider, type ProviderInfo, type ChatRequest } from "@takt/harness";
import type { ParsedItem } from "./graph-build.js";

// Vision-PARSE a rendered page into (a) a full markdown transcription and (b) the
// typed things on it — parts, specs, symptoms, procedures, warnings, figures.
// The transcription stays retrievable + displayable; the typed items feed the
// knowledge graph (buildGraphInput). One vision call per page produces both, so
// the graph is built at no extra per-page cost over the old flat caption.
//
// Provider-neutral: runs through the harness `streamProvider`, so any
// vision-capable provider/model the user picks in Settings works — the key and
// provider come from the caller (the stored provider key), not process.env.

export interface PageParseResult {
  textMd: string;                         // full transcription (caption + page chunk)
  parts: ParsedItem[];
  specs: ParsedItem[];                    // value/unit; refHint = part it belongs to
  symptoms: ParsedItem[];                 // layman + technical; refHint = the fix
  procedures: ParsedItem[];
  warnings: ParsedItem[];
  figures: { label: string; caption: string }[];
  inputTokens: number;
  outputTokens: number;
}

// Drain a (tool-free) provider turn into its final text + token usage.
async function complete(
  provider: ProviderInfo,
  apiKey: string | undefined,
  req: ChatRequest,
): Promise<{ text: string; input: number; output: number }> {
  let text = "";
  let input = 0;
  let output = 0;
  const signal = new AbortController().signal;
  // Ingest is structured extraction, never a reasoning task. Force MINIMAL
  // reasoning so OpenAI reasoning models (gpt-5*) don't spend the whole token
  // budget "thinking" and emit no text. No-op for Anthropic/MiniMax (they read
  // `effort`, not `reasoningEffort`).
  const r: ChatRequest = { ...req, reasoningEffort: req.reasoningEffort ?? "minimal" };
  for await (const ev of streamProvider(provider, apiKey, r, signal)) {
    if (ev.type === "text") text += ev.delta;
    else if (ev.type === "usage") { input += ev.input; output += ev.output; }
  }
  return { text: text.trim(), input, output };
}

const PARSE_PROMPT = `You are digitizing ONE page of a product manual into a searchable knowledge graph.
Return ONLY a JSON object (no preamble, no markdown fence) with this exact shape:
{
  "textMd": "<full faithful transcription of the page as markdown — ALL body text, headings, callouts; EVERY table as a GFM table with all rows/cols/units; describe every diagram/schematic/photo and its labeled parts and what question it answers. Be literal; add nothing not on the page.>",
  "parts": [{"name":"<component/assembly>","aliases":["<other names, incl. plain-language>"],"summary":"<what it is / does, one line>"}],
  "specs": [{"name":"<what is measured, e.g. PLA nozzle temperature>","value":"<number>","unit":"<unit>","refHint":"<the part/assembly this spec is for, if any>"}],
  "symptoms": [{"name":"<problem in TECHNICAL terms>","aliases":["<how a NON-technical user would describe it, e.g. clicking noise, won't feed>"],"summary":"<what's happening>","refHint":"<the procedure/fix that resolves it, if on the page>"}],
  "procedures": [{"name":"<a task/fix/how-to on this page>","aliases":["<plain-language name>"],"summary":"<one line>"}],
  "warnings": [{"name":"<safety/caution note>","summary":"<what to avoid>"}],
  "figures": [{"label":"<figure label e.g. Fig 3>","caption":"<what the diagram/photo shows + every labeled part>"}]
}
Rules: Every array may be empty. Only include items actually present on THIS page. For symptoms, ALWAYS include layman aliases so a non-technical user's words find it. Keep names short and canonical (so the same part on other pages matches). Do NOT invent part numbers or values.`;

const EMPTY_PARSE: Omit<PageParseResult, "inputTokens" | "outputTokens"> = { textMd: "", parts: [], specs: [], symptoms: [], procedures: [], warnings: [], figures: [] };

// Parse the model's JSON reply; fall back to raw-as-transcription so the page is
// still captioned + searchable even if the model didn't return clean JSON.
function parseStructured(raw: string, input: number, output: number): PageParseResult {
  try {
    const obj = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
    return {
      textMd: typeof obj.textMd === "string" ? obj.textMd : "",
      parts: arr(obj.parts), specs: arr(obj.specs), symptoms: arr(obj.symptoms),
      procedures: arr(obj.procedures), warnings: arr(obj.warnings),
      figures: arr(obj.figures).filter((f) => f && typeof f.caption === "string"),
      inputTokens: input, outputTokens: output,
    };
  } catch {
    return { ...EMPTY_PARSE, textMd: raw, inputTokens: input, outputTokens: output };
  }
}

/** Parse a page IMAGE into a transcription + typed graph items (needs a vision model). */
export async function parsePage(
  png: Uint8Array,
  provider: ProviderInfo,
  model: string,
  apiKey?: string,
): Promise<PageParseResult> {
  const base64 = Buffer.from(png).toString("base64");
  const { text: raw, input, output } = await complete(provider, apiKey, {
    model, maxTokens: 4096, tools: [],
    messages: [{ role: "user", text: PARSE_PROMPT, images: [{ data: base64, mime: "image/png" }] }],
  });
  return parseStructured(raw, input, output);
}

const IMAGE_PROMPT = `You are digitizing ONE product photo or diagram into a searchable knowledge graph. Return ONLY a JSON object (no preamble, no fence) with this exact shape:
{
  "textMd": "<a faithful, specific description of what this image shows — the object(s), their visible parts, any printed text/labels, and what question it helps answer. Be literal; add nothing not visible.>",
  "parts": [{"name":"<component shown>","aliases":["<plain-language names>"],"summary":"<what it is, one line>"}],
  "specs": [], "symptoms": [], "procedures": [],
  "warnings": [{"name":"<visible caution>","summary":"<what to avoid>"}],
  "figures": [{"label":"","caption":"<what the image shows + every labeled part>"}]
}
Rules: describe ONLY what is visible; name the parts so they match the manual's parts (short, canonical); include layman aliases; do NOT invent values or part numbers. Every array may be empty.`;

/** Parse a loose product IMAGE (photo/diagram) into a rich caption + typed items,
 *  so it becomes a first-class, retrievable, linkable node — not a filename. */
export async function parseImage(
  png: Uint8Array,
  provider: ProviderInfo,
  model: string,
  apiKey?: string,
  mime = "image/png",
): Promise<PageParseResult> {
  const base64 = Buffer.from(png).toString("base64");
  const { text: raw, input, output } = await complete(provider, apiKey, {
    model, maxTokens: 2048, tools: [],
    messages: [{ role: "user", text: IMAGE_PROMPT, images: [{ data: base64, mime }] }],
  });
  return parseStructured(raw, input, output);
}

/** Parse a page's EMBEDDED TEXT into the same structure — works with any text
 *  model (e.g. MiniMax, which can't take images). Used when the PDF has real text
 *  or the caption model isn't vision-capable. Diagrams-only pages yield little. */
export async function parsePageText(
  pageText: string,
  provider: ProviderInfo,
  model: string,
  apiKey?: string,
): Promise<PageParseResult> {
  if (!pageText.trim()) return { ...EMPTY_PARSE, inputTokens: 0, outputTokens: 0 };
  const { text: raw, input, output } = await complete(provider, apiKey, {
    model, maxTokens: 4096, tools: [],
    messages: [{ role: "user", text: `${PARSE_PROMPT}\n\nHere is the extracted text of the page:\n"""\n${pageText.slice(0, 12000)}\n"""` }],
  });
  return parseStructured(raw, input, output);
}

// Vision-detect the product's identity from its cover / first manual page. One
// cheap call at the very start of an ingest so a "drop a folder" run needs no
// --name/--manufacturer: the model reads the title block and tells us what this
// is. Robust parse; {} on any failure so ingest can fall back to file names.
export async function detectProduct(
  coverPng: Uint8Array,
  provider: ProviderInfo,
  model: string,
  apiKey?: string,
): Promise<{ name?: string; manufacturer?: string; summary?: string }> {
  try {
    const base64 = Buffer.from(coverPng).toString("base64");
    const { text: raw } = await complete(provider, apiKey, {
      model, maxTokens: 500, tools: [],
      messages: [{
        role: "user",
        text: `This is the cover / first page of a product's manual. Identify the product. Return ONLY a JSON object: {"name":"<product model name>","manufacturer":"<maker>","summary":"<one concise line describing what it is>"}. Use "" for anything you can't determine.`,
        images: [{ data: base64, mime: "image/png" }],
      }],
    });
    const obj = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
    const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    return { name: clean(obj.name), manufacturer: clean(obj.manufacturer), summary: clean(obj.summary) };
  } catch { return {}; }
}

// Generate a few natural, product-specific starter questions from what we know
// about the product. One cheap text call at ingest time; stored and reused.
export async function generateStarters(opts: {
  provider: ProviderInfo; model: string; apiKey?: string;
  name: string; manufacturer?: string | null; summary?: string | null;
  manualTitles: string[]; sampleText: string;
}): Promise<string[]> {
  const ctx = [
    `Product: ${opts.name}${opts.manufacturer ? ` by ${opts.manufacturer}` : ""}`,
    opts.summary ? `Summary: ${opts.summary}` : "",
    opts.manualTitles.length ? `Manuals: ${opts.manualTitles.join(", ")}` : "",
    opts.sampleText ? `Excerpts from the manual:\n${opts.sampleText.slice(0, 4000)}` : "",
  ].filter(Boolean).join("\n");
  const { text: raw } = await complete(opts.provider, opts.apiKey, {
    model: opts.model,
    // Headroom: reasoning models (e.g. gpt-5-mini) spend part of the budget on
    // reasoning tokens; 400 left nothing for the actual JSON, yielding no starters.
    maxTokens: 1500,
    tools: [],
    messages: [{
      role: "user",
      text: `${ctx}\n\nWrite exactly 4 starter questions a new owner of THIS product would actually ask, grounded in what its manuals cover (setup, controls, a real spec/setting, and troubleshooting). Each ≤ 9 words, specific to this product, no numbering. Return ONLY a JSON array of 4 strings.`,
    }],
  });
  try {
    const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
    if (Array.isArray(arr)) return arr.filter((s) => typeof s === "string" && s.trim()).slice(0, 4);
  } catch { /* fall through */ }
  return [];
}
