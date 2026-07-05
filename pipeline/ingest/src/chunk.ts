import { createHash } from "node:crypto";
import type { ChunkKind } from "@prox/shared";

export interface DraftChunk {
  pageNumber: number;
  kind: ChunkKind;
  content: string;   // stored + shown to the model verbatim
  embedText: string; // what we actually embed (content + situating context)
  contentHash: string;
}

const MAX_CHARS = 2000; // ~500 tokens
const OVERLAP = 320; // ~80 tokens

function hash(parts: (string | number)[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

// Split page text on paragraph boundaries into overlapping windows.
function windowText(text: string): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (clean.length <= MAX_CHARS) return clean ? [clean] : [];
  const paras = clean.split(/\n\s*\n/);
  const windows: string[] = [];
  let buf = "";
  for (const para of paras) {
    if (buf && buf.length + para.length + 2 > MAX_CHARS) {
      windows.push(buf.trim());
      buf = buf.slice(Math.max(0, buf.length - OVERLAP));
    }
    buf += (buf ? "\n\n" : "") + para;
  }
  if (buf.trim()) windows.push(buf.trim());
  return windows;
}

/**
 * Build chunks for one page: its embedded text (split) as `text` chunks, plus
 * the vision caption as a single rich `image_caption` chunk. The caption is the
 * primary retrieval signal for visual pages where embedded text is sparse.
 */
export function chunkPage(opts: {
  productSlug: string; sourceTitle: string; manualKind: string; pageNumber: number;
  text: string; caption: string;
}): DraftChunk[] {
  const out: DraftChunk[] = [];
  // Contextual retrieval (Anthropic-style), but the situating context is built
  // from data we ALREADY have — the source title/page and the page's own vision
  // caption — so it costs zero extra tokens. Each chunk becomes self-contained,
  // which is the single biggest fix for the "orphan chunk retrieved out of
  // context" RAG failure. We embed `embedText` but store/show `content` verbatim.
  const label = `[${opts.sourceTitle} · p.${opts.pageNumber}]`;
  const gist = opts.caption.replace(/\s+/g, " ").trim().slice(0, 180);
  const prefix = gist ? `${label} ${gist}\n\n` : `${label}\n\n`;

  for (const w of windowText(opts.text)) {
    const embedText = prefix + w;
    out.push({
      pageNumber: opts.pageNumber, kind: "text", content: w, embedText,
      contentHash: hash([opts.productSlug, opts.manualKind, opts.pageNumber, "text", embedText]),
    });
  }
  const caption = opts.caption.trim();
  if (caption) {
    const embedText = `${label} ${caption}`;
    out.push({
      pageNumber: opts.pageNumber, kind: "image_caption", content: caption, embedText,
      contentHash: hash([opts.productSlug, opts.manualKind, opts.pageNumber, "image_caption", embedText]),
    });
  }
  return out;
}
