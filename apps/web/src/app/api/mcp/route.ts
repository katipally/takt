import { NextResponse } from "next/server";
import { REPO_ROOT } from "@takt/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Connection details for Takt's MCP server (services/agent/src/mcp.ts) — the
// graph tools exposed over stdio so any MCP client can query the catalog. The
// command embeds this install's real repo path so it's copy-paste ready.
export function GET() {
  return NextResponse.json({
    command: `claude mcp add takt -- pnpm --dir ${REPO_ROOT}/services/agent mcp`,
    tools: ["list_products", "find_entity", "explore_entity", "trace_path", "search_product", "get_media", "read_profile"],
  });
}
