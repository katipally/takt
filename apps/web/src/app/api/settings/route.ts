import { NextResponse } from "next/server";
import { getAllSettings, setSetting } from "@prox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULTS = { chatModel: "claude-sonnet-4-6", captionModel: "claude-sonnet-4-6", effort: "medium" };

export function GET() {
  return NextResponse.json({ ...DEFAULTS, ...getAllSettings() });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Record<string, string>;
  for (const [k, v] of Object.entries(body)) {
    if (["chatModel", "captionModel", "effort"].includes(k) && typeof v === "string") setSetting(k, v);
  }
  return NextResponse.json({ ...DEFAULTS, ...getAllSettings() });
}
