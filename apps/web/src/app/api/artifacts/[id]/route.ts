import { NextResponse } from "next/server";
import { getArtifact } from "@prox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const artifact = getArtifact(id);
  if (!artifact) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(artifact);
}
