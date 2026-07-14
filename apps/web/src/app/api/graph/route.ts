import { NextResponse } from "next/server";
import { getProductBySlug, graphFull } from "@takt/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The product's COMPLETE knowledge graph — every entity (with value/page/
// summary for the detail panel) and every edge — for the interactive explorer.
export function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("product") ?? "";
  const product = slug ? getProductBySlug(slug) : undefined;
  if (!product) return NextResponse.json({ nodes: [], links: [] });
  return NextResponse.json(graphFull(product.id));
}
