import { NextResponse } from "next/server";
import { updateProvider } from "@prox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Update the Anthropic API key (only field the UI changes).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const provider = updateProvider(id, { apiKey: body.apiKey });
  if (!provider) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(provider);
}
