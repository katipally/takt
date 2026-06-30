export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pass-through proxy for ask_user answers → resolves the awaiting tool in the
// agent service so the in-flight chat stream continues.
const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8787";

export async function POST(req: Request) {
  const body = await req.text();
  const upstream = await fetch(`${AGENT_URL}/chat/answer`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-prox-secret": process.env.PROX_AGENT_SECRET ?? "" },
    body,
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
