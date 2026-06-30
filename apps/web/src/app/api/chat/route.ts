export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Thin pass-through proxy to the agent service. Keeps the browser on one origin
// and makes the agent endpoint swappable (local → container) via env.
const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8787";

export async function POST(req: Request) {
  const body = await req.text();
  // Forward the client's abort signal so pressing Stop (or navigating away)
  // tears down the upstream agent stream instead of letting it run on.
  const upstream = await fetch(`${AGENT_URL}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-prox-secret": process.env.PROX_AGENT_SECRET ?? "" },
    body,
    signal: req.signal,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
