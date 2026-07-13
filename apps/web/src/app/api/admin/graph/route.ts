import { NextResponse } from "next/server";
import { listProducts, graphStats } from "@takt/db";
import { forbidden, isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-product knowledge-graph size — shown in the admin dashboard so an operator
// can see at a glance what each ingest produced (and spot an empty/failed one).
export async function GET() {
  if (!(await isAdmin())) return forbidden();
  return NextResponse.json(listProducts().map((p) => ({ slug: p.slug, name: p.name, ...graphStats(p.id) })));
}
