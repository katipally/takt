import { NextResponse } from "next/server";
import { getProductBySlug, graphSample } from "@takt/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A display sample of a product's knowledge graph for the landing-page
// visualization: the most-connected entities + the edges among them.
export function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("product") ?? "";
  const product = slug ? getProductBySlug(slug) : undefined;
  if (!product) return NextResponse.json({ nodes: [], links: [] });
  return NextResponse.json(graphSample(product.id));
}
