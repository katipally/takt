export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Public MCP endpoint for HOSTED Takt: <site>/mcp → the agent service's
// Streamable HTTP MCP server. One origin for users; the agent stays private
// behind the shared secret. Read-only graph tools, so it's safe to expose —
// same openness as the site itself.
const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8787";

export async function POST(req: Request) {
  const upstream = await fetch(`${AGENT_URL}/mcp`, {
    method: "POST",
    headers: {
      "content-type": req.headers.get("content-type") ?? "application/json",
      accept: req.headers.get("accept") ?? "application/json, text/event-stream",
      "x-takt-secret": process.env.TAKT_AGENT_SECRET ?? "",
    },
    body: await req.text(),
    signal: req.signal,
  });
  const headers = new Headers();
  for (const h of ["content-type", "mcp-session-id", "cache-control"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

const notAllowed = () =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed — this MCP server is stateless; use POST." }, id: null },
    { status: 405 },
  );
export const GET = notAllowed;
export const DELETE = notAllowed;
