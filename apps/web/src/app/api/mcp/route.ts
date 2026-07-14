import { NextResponse } from "next/server";
import { REPO_ROOT } from "@takt/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Connection details for Takt's MCP server. Two transports:
//   • http  — <this site>/mcp, works for ANY visitor of a hosted Takt (and
//             locally too); this is the command the UI leads with.
//   • stdio — only meaningful on the machine that runs Takt from source.
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    httpUrl: `${origin}/mcp`,
    httpCommand: `claude mcp add --transport http takt ${origin}/mcp`,
    stdioCommand: `claude mcp add takt -- pnpm --dir ${REPO_ROOT}/services/agent mcp`,
    tools: ["list_products", "find_entity", "explore_entity", "trace_path", "search_product", "get_media", "read_profile"],
  });
}
