import { z } from "zod";
import { askQuestionSchema } from "./ask-spec";

// The wire protocol between the agent service and the browser. One JSON object
// per SSE `data:` line. The agent emits these; the web `/api/chat` route is a
// dumb byte-pass-through proxy; the chat-stream hook decodes them.

export const sseEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text_delta"), text: z.string() }),
  z.object({ type: z.literal("reasoning_delta"), text: z.string() }),
  z.object({ type: z.literal("tool_start"), id: z.string(), tool: z.string(), summary: z.string().optional() }),
  z.object({ type: z.literal("tool_done"), id: z.string(), detail: z.string().optional() }),
  z.object({
    type: z.literal("page_image"),
    citationId: z.string(),
    url: z.string(),
    page: z.number(),
    manualKind: z.string(),
    manualTitle: z.string().optional(),
    caption: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("artifact"),
    artifactId: z.string(),
    title: z.string(),
    kind: z.enum(["react", "html"]),
    groupKey: z.string(),
    version: z.number(),
  }),
  z.object({
    type: z.literal("citation"),
    citationId: z.string(),
    page: z.number(),
    manualKind: z.string(),
  }),
  z.object({ type: z.literal("title"), title: z.string() }),
  z.object({ type: z.literal("ask_user"), askId: z.string(), questions: z.array(askQuestionSchema) }),
  z.object({
    type: z.literal("usage"),
    contextTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
  }),
  z.object({ type: z.literal("done") }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type SseEvent = z.infer<typeof sseEventSchema>;

/** Encode an event as an SSE frame (server side). */
export function encodeSse(event: SseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Stateful SSE line decoder (client side). Feed it raw chunks from a fetch
 * ReadableStream reader; it yields parsed events on complete `\n\n` frames.
 */
export function createSseDecoder() {
  let buffer = "";
  return function push(chunk: string): SseEvent[] {
    buffer += chunk;
    const events: SseEvent[] = [];
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const parsed = sseEventSchema.safeParse(JSON.parse(payload));
          if (parsed.success) events.push(parsed.data);
        } catch {
          // ignore malformed frame
        }
      }
    }
    return events;
  };
}
