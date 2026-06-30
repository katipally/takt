import { NextResponse } from "next/server";
import { listProducts, getSetting } from "@prox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Attach the product-specific starter questions stored at ingest (settings KV).
// The UI falls back to generic starters when a product has none.
export function GET() {
  const products = listProducts().map((p) => {
    const raw = getSetting(`starters:${p.id}`);
    let starters: string[] | undefined;
    if (raw) { try { const a = JSON.parse(raw); if (Array.isArray(a) && a.length) starters = a; } catch { /* ignore */ } }
    return starters ? { ...p, starters } : p;
  });
  return NextResponse.json(products);
}
