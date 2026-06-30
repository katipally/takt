import Anthropic from "@anthropic-ai/sdk";

// Vision-caption a rendered page. This is the key move that makes image-only
// content (selection charts, schematics, weld-diagnosis photos, wiring
// diagrams) retrievable: the caption becomes an embedded `image_caption` chunk,
// and the original PNG is one get_page_image call away for display.
const DEFAULT_CAPTION_MODEL = process.env.PROX_CAPTION_MODEL ?? "claude-sonnet-5";

// Cache one client per key. The key comes from the caller (the stored provider
// key the user pasted in Settings) — NOT process.env, so UI ingestion works on
// hosts where ANTHROPIC_API_KEY is deliberately unset (e.g. the HF Space).
const clients = new Map<string, Anthropic>();
function clientFor(apiKey?: string): Anthropic {
  const key = apiKey || process.env.ANTHROPIC_API_KEY || "";
  let c = clients.get(key);
  if (!c) { c = new Anthropic({ apiKey: key }); clients.set(key, c); }
  return c;
}

export interface CaptionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
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
  model = DEFAULT_CAPTION_MODEL,
  apiKey?: string,
): Promise<CaptionResult> {
  const base64 = Buffer.from(png).toString("base64");
  const msg = await clientFor(apiKey).messages.create({
    model,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: base64 } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { text, inputTokens: msg.usage?.input_tokens ?? 0, outputTokens: msg.usage?.output_tokens ?? 0 };
}

// Generate a few natural, product-specific starter questions from what we know
// about the product. One cheap text call at ingest time; stored and reused.
export async function generateStarters(opts: {
  model: string; apiKey?: string;
  name: string; manufacturer?: string | null; summary?: string | null;
  manualTitles: string[]; sampleText: string;
}): Promise<string[]> {
  const ctx = [
    `Product: ${opts.name}${opts.manufacturer ? ` by ${opts.manufacturer}` : ""}`,
    opts.summary ? `Summary: ${opts.summary}` : "",
    opts.manualTitles.length ? `Manuals: ${opts.manualTitles.join(", ")}` : "",
    opts.sampleText ? `Excerpts from the manual:\n${opts.sampleText.slice(0, 4000)}` : "",
  ].filter(Boolean).join("\n");
  const msg = await clientFor(opts.apiKey).messages.create({
    model: opts.model,
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `${ctx}\n\nWrite exactly 4 starter questions a new owner of THIS product would actually ask, grounded in what its manuals cover (setup, controls, a real spec/setting, and troubleshooting). Each ≤ 9 words, specific to this product, no numbering. Return ONLY a JSON array of 4 strings.`,
    }],
  });
  const raw = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
  try {
    const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
    if (Array.isArray(arr)) return arr.filter((s) => typeof s === "string" && s.trim()).slice(0, 4);
  } catch { /* fall through */ }
  return [];
}
