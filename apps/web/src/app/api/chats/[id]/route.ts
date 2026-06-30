import { NextResponse } from "next/server";
import { renameChat, deleteChat } from "@prox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { title } = await req.json();
  if (typeof title === "string" && title.trim()) renameChat(id, title.trim());
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteChat(id);
  return NextResponse.json({ ok: true });
}
