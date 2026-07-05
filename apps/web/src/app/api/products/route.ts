import { NextResponse } from "next/server";
import { listProducts, getSuggestions } from "@takt/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Attach each product's suggested questions — the most-asked opening questions
// for that product first, padded with the ingest-generated starters. The UI
// falls back to generic starters when this is empty (brand-new product).
export function GET() {
  const products = listProducts().map((p) => {
    const starters = getSuggestions(p.id, 4);
    return starters.length ? { ...p, starters } : p;
  });
  return NextResponse.json(products);
}
