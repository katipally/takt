import { NextResponse } from "next/server";
import { getProductBySlug, getPageImage } from "@prox/db";
import type { ManualKind } from "@prox/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve a manual page image for the Canvas Source viewer (used when a citation
// chip is clicked). Tries the requested manual, then falls back across kinds.
export function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("product");
  const page = Number(url.searchParams.get("page"));
  const manual = url.searchParams.get("manual") as ManualKind | null;
  const product = slug ? getProductBySlug(slug) : undefined;
  if (!product || !page) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const order: (ManualKind | null)[] = [manual, "owner", "quick_start", "selection_chart", null];
  for (const kind of order) {
    const pi = getPageImage(product.id, kind, page);
    if (pi) {
      return NextResponse.json({
        url: `/assets/${pi.pngPath}`, page: pi.pageNumber,
        manualKind: pi.manualKind, manualTitle: pi.manualTitle, caption: pi.caption,
      });
    }
  }
  return NextResponse.json({ error: "page not found" }, { status: 404 });
}
