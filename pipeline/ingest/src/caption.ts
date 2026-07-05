import { streamProvider, type ProviderInfo, type ChatRequest } from "@prox/harness";

// Vision-caption a rendered page. This is the key move that makes image-only
// content (selection charts, schematics, weld-diagnosis photos, wiring
// diagrams) retrievable: the caption becomes an embedded `image_caption` chunk,
// and the original PNG is one get_page_image call away for display.
//
// Provider-neutral: runs through the harness `streamProvider`, so any
// vision-capable provider/model the user picks in Settings works — the key and
// provider come from the caller (the stored provider key), not process.env.

export interface CaptionResult {
  text: string;
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
  for await (const ev of streamProvider(provider, apiKey, req, signal)) {
    if (ev.type === "text") text += ev.delta;
    else if (ev.type === "usage") { input += ev.input; output += ev.output; }
  }
  return { text: text.trim(), input, output };
}

const PROMPT = `You are digitizing a page of a product owner's manual so it becomes searchable.
Transcribe and describe EVERYTHING on this page so a technician could answer questions from your text alone:
- All body text, headings, labels, and callouts (verbatim where it matters).
- Every table as a GitHub-flavored markdown table (keep all rows/columns/units).
- Every diagram, schematic, photo, chart, or control panel: describe what it shows, every labeled part, and what real question it answers (e.g. "which socket the ground clamp goes into for DCEN", "duty cycle at 200A on 240V").
- Numbers, settings, amperage/voltage/wire-speed values, polarity, part numbers.
Be thorough and literal. Do not add information that is not on the page. Output plain text + markdown, no preamble.`;

export async function captionPage(
  png: Uint8Array,
  provider: ProviderInfo,
  model: string,
  apiKey?: string,
): Promise<CaptionResult> {
  const base64 = Buffer.from(png).toString("base64");
  const { text, input, output } = await complete(provider, apiKey, {
    model,
    maxTokens: 2048,
    tools: [],
    messages: [{ role: "user", text: PROMPT, images: [{ data: base64, mime: "image/png" }] }],
  });
  return { text, inputTokens: input, outputTokens: output };
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
