import { createSseDecoder, type SseEvent, type ChatRequest } from "@prox/shared";

// Stream a chat turn over fetch+SSE (POST with a JSON body — EventSource can't
// do either). Abortable via the passed signal.
export async function streamChat(
  req: ChatRequest,
  onEvent: (e: SseEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.body) throw new Error("No response stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const decode = createSseDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const event of decode(decoder.decode(value, { stream: true }))) onEvent(event);
  }
}
