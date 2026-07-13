import { NextResponse } from "next/server";
import { deleteProduct } from "@takt/db";
import { forbidden, isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Remove a product and everything it owns (graph, manuals, page images, chats,
// and on-disk PDFs/pages/media/hero). Admin-gated + irreversible.
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAdmin())) return forbidden();
  const { slug } = await params;
  const ok = deleteProduct(slug);
  if (!ok) return NextResponse.json({ error: `No product "${slug}".` }, { status: 404 });
  return NextResponse.json({ ok: true });
}
