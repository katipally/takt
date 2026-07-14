import { NextResponse } from "next/server";
import { getAllSettings, setSetting } from "@takt/db";
import { DEFAULT_EFFORT } from "@takt/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No model defaults — model + provider are chosen live in Settings. Only the
// reasoning effort has a sensible default.
const DEFAULTS = { effort: DEFAULT_EFFORT };
// Model/provider CHOICE is user-writable (the user settings modal) — it's not
// sensitive. API keys (/api/providers) and product ingestion (/api/products)
// stay admin-gated. captionModel is included so admins can set the vision model,
// but only the admin console surfaces it.
const KEYS = ["chatModel", "captionModel", "effort", "chatProviderId", "captionProviderId", "buildModel", "buildProviderId", "liveProviderId", "liveModel", "liveEffort"];

export function GET() {
  return NextResponse.json({ ...DEFAULTS, ...getAllSettings() });
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Record<string, string>;
  for (const [k, v] of Object.entries(body)) {
    if (KEYS.includes(k) && typeof v === "string") setSetting(k, v);
  }
  return NextResponse.json({ ...DEFAULTS, ...getAllSettings() });
}
