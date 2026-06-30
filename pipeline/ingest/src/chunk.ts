import { createHash } from "node:crypto";
import type { ChunkKind } from "@prox/shared";

export interface DraftChunk {
  pageNumber: number;
  kind: ChunkKind;
  content: string;
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
  productSlug: string; manualKind: string; pageNumber: number;
  text: string; caption: string;
}): DraftChunk[] {
  const out: DraftChunk[] = [];
  for (const w of windowText(opts.text)) {
    out.push({
      pageNumber: opts.pageNumber, kind: "text", content: w,
      contentHash: hash([opts.productSlug, opts.manualKind, opts.pageNumber, "text", w]),
    });
  }
  const caption = opts.caption.trim();
  if (caption) {
    out.push({
      pageNumber: opts.pageNumber, kind: "image_caption", content: caption,
      contentHash: hash([opts.productSlug, opts.manualKind, opts.pageNumber, "image_caption", caption]),
    });
  }
  return out;
}
