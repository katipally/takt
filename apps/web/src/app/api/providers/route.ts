import { NextResponse } from "next/server";
import { listProviders } from "@prox/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anthropic-only: read-only list (shows key status). Key updates go via PATCH.
export function GET() {
  return NextResponse.json(listProviders());
}
