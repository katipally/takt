import { NextResponse } from "next/server";
import { getAllSettings, setSetting } from "@takt/db";
import { DEFAULT_EFFORT } from "@takt/shared";
import { forbidden, isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No model defaults — model + provider are chosen live in Settings. Only the
// reasoning effort has a sensible default.
const DEFAULTS = { effort: DEFAULT_EFFORT };
const KEYS = ["chatModel", "captionModel", "effort", "chatProviderId", "captionProviderId", "buildModel", "buildProviderId"];

export function GET() {
  return NextResponse.json({ ...DEFAULTS, ...getAllSettings() });
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) return forbidden();
  const body = (await req.json()) as Record<string, string>;
  for (const [k, v] of Object.entries(body)) {
    if (KEYS.includes(k) && typeof v === "string") setSetting(k, v);
  }
  return NextResponse.json({ ...DEFAULTS, ...getAllSettings() });
}
