import { NextResponse } from "next/server";
import { REPO_ROOT } from "@takt/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Connection details for Takt's MCP server. Two transports:
//   • http  — <this site>/mcp, works for ANY visitor of a hosted Takt (and
//             locally too); this is the command the UI leads with.
//   • stdio — only meaningful on the machine that runs Takt from source.
export function GET(req: Request) {
  // Behind a hosting proxy (HF Spaces, any LB) req.url carries the INTERNAL
  // container host — use the platform host / forwarded headers for the public
  // origin, falling back to the request origin for plain local dev.
  const fwdHost = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const origin = process.env.SPACE_HOST
    ? `https://${process.env.SPACE_HOST}`
    : fwdHost
      ? `${proto}://${fwdHost.split(",")[0]!.trim()}`
      : new URL(req.url).origin;
  return NextResponse.json({
    httpUrl: `${origin}/mcp`,
    httpCommand: `claude mcp add --transport http takt ${origin}/mcp`,
    stdioCommand: `claude mcp add takt -- pnpm --dir ${REPO_ROOT}/services/agent mcp`,
    tools: ["list_products", "find_entity", "explore_entity", "trace_path", "search_product", "get_media", "read_profile"],
  });
}
