import { NextResponse } from "next/server";
import { updateProvider, clearProviderKey } from "@prox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Update the Anthropic API key (the only field the UI changes), or clear it.
// Validate the shape up front so an obviously-wrong paste fails here with a
// clear message instead of a confusing 401 mid-chat.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  if (body.clear) {
    const provider = clearProviderKey(id);
    if (!provider) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(provider);
  }

  const key = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!key) return NextResponse.json({ error: "Paste an API key." }, { status: 400 });
  if (!key.startsWith("sk-ant-")) {
    return NextResponse.json({ error: "That doesn't look like an Anthropic key (it should start with sk-ant-)." }, { status: 400 });
  }

  const provider = updateProvider(id, { apiKey: key });
  if (!provider) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(provider);
}
