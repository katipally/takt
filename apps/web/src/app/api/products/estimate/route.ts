export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const AGENT_URL = process.env.AGENT_SERVICE_URL ?? "http://localhost:8787";

// Forward the PDF upload to the agent's cheap page-count estimate and return its
// JSON ({ perFile, totalPages, model, hasKey }) so the form can show a cost
// estimate before any paid captioning runs.
export async function POST(req: Request) {
  const upstream = await fetch(`${AGENT_URL}/ingest/estimate`, {
    method: "POST",
    headers: {
      "content-type": req.headers.get("content-type") ?? "multipart/form-data",
      "x-prox-secret": process.env.PROX_AGENT_SECRET ?? "",
    },
    body: req.body,
    // @ts-expect-error Node fetch requires duplex for a streamed request body
    duplex: "half",
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
