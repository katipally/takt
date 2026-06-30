import Anthropic from "@anthropic-ai/sdk";

// Lazy so the client picks up ANTHROPIC_API_KEY after the CLI loads .env.
let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

// Vision-caption a rendered page. This is the key move that makes image-only
// content (selection charts, schematics, weld-diagnosis photos, wiring
// diagrams) retrievable: the caption becomes an embedded `image_caption` chunk,
// and the original PNG is one get_page_image call away for display.
const DEFAULT_CAPTION_MODEL = process.env.PROX_CAPTION_MODEL ?? "claude-sonnet-4-6";

const PROMPT = `You are digitizing a page of a product owner's manual so it becomes searchable.
Transcribe and describe EVERYTHING on this page so a technician could answer questions from your text alone:
- All body text, headings, labels, and callouts (verbatim where it matters).
- Every table as a GitHub-flavored markdown table (keep all rows/columns/units).
- Every diagram, schematic, photo, chart, or control panel: describe what it shows, every labeled part, and what real question it answers (e.g. "which socket the ground clamp goes into for DCEN", "duty cycle at 200A on 240V").
- Numbers, settings, amperage/voltage/wire-speed values, polarity, part numbers.
Be thorough and literal. Do not add information that is not on the page. Output plain text + markdown, no preamble.`;

export async function captionPage(png: Uint8Array, model = DEFAULT_CAPTION_MODEL): Promise<string> {
  const base64 = Buffer.from(png).toString("base64");
  const msg = await getClient().messages.create({
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
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
