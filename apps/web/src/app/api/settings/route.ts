import { NextResponse } from "next/server";
import { getAllSettings, setSetting } from "@prox/db";
import { DEFAULT_CHAT_MODEL, DEFAULT_CAPTION_MODEL, DEFAULT_EFFORT } from "@prox/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULTS = { chatModel: DEFAULT_CHAT_MODEL, captionModel: DEFAULT_CAPTION_MODEL, effort: DEFAULT_EFFORT };

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
