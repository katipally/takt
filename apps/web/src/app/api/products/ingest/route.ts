export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8787";

// Forward the multipart upload straight to the agent service (which holds the
// ingest pipeline) and stream its SSE progress back to the browser.
export async function POST(req: Request) {
  const upstream = await fetch(`${AGENT_URL}/ingest`, {
    method: "POST",
    headers: { "content-type": req.headers.get("content-type") ?? "multipart/form-data" },
    body: req.body,
    // @ts-expect-error Node fetch requires duplex for a streamed request body
    duplex: "half",
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform" },
  });
}
