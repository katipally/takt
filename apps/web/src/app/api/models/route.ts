import { NextResponse } from "next/server";
import { listProviders, getProviderApiKey } from "@prox/db";
import { FALLBACK_MODELS as FALLBACK } from "@prox/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live model list from the Anthropic API (no hardcoding). Falls back to the
// shared known set if the key is missing or the call fails.

export async function GET() {
  const anthropic = listProviders().find((p) => p.kind === "anthropic");
  const key = anthropic ? getProviderApiKey(anthropic.id) : process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json(FALLBACK);
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) return NextResponse.json(FALLBACK);
    const json = (await res.json()) as { data: { id: string; display_name?: string; created_at?: string }[] };
    const models = json.data
      .filter((m) => m.id.startsWith("claude-"))
      .map((m) => ({ id: m.id, display_name: m.display_name ?? m.id, created_at: m.created_at }));
    return NextResponse.json(models.length ? models : FALLBACK);
  } catch {
    return NextResponse.json(FALLBACK);
  }
}
