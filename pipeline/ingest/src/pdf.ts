import * as mupdf from "mupdf";

export interface RenderedPage {
  pageNumber: number; // 1-indexed
  png: Uint8Array;
  width: number;
  height: number;
  text: string;
}

// Render every page to a PNG and pull its embedded text via mupdf (wasm, no
// native build). Scale 2x for crisp diagrams/labels in the page viewer.
export function renderPdf(data: Uint8Array, scale = 2): RenderedPage[] {
  const doc = mupdf.Document.openDocument(data, "application/pdf");
  const count = doc.countPages();
  const matrix = mupdf.Matrix.scale(scale, scale);
  const pages: RenderedPage[] = [];
  for (let i = 0; i < count; i++) {
    const page = doc.loadPage(i);
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
    const png = pixmap.asPNG();
    const width = pixmap.getWidth();
    const height = pixmap.getHeight();
    let text = "";
    try {
      text = page.toStructuredText("preserve-whitespace").asText();
    } catch {
      text = "";
    }
    pages.push({ pageNumber: i + 1, png, width, height, text: text.trim() });
    pixmap.destroy?.();
    page.destroy?.();
  }
  return pages;
}
