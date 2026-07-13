import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminRequired, adminToken, isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → whether admin is gated and whether this browser is already authed.
export async function GET() {
  return NextResponse.json({ required: adminRequired(), authed: await isAdmin() });
}

// POST { token } → set the admin cookie if the token matches. When admin isn't
// gated (no env token) this is a no-op success.
export async function POST(req: Request) {
  if (!adminRequired()) return NextResponse.json({ ok: true });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (token && token === adminToken()) {
    const c = await cookies();
    c.set(ADMIN_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid token" }, { status: 401 });
}
