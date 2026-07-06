import { z } from "zod";
import { askQuestionSchema, askAnswerSchema } from "./ask-spec";
import { uiSurfaceSchema } from "./ui-spec";

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
    // Which product this page belongs to — set so a cross-product citation opens
    // the right product's page. Omitted/null in single-product mode.
    productSlug: z.string().nullable().optional(),
    productName: z.string().nullable().optional(),
  }),
  // A complete, validated declarative UI surface rendered inline on the stage.
  z.object({ type: z.literal("ui_surface"), partId: z.string(), surface: uiSurfaceSchema }),
  // Resolution of an interactive Button/Form/Select action (ack to the client).
  z.object({ type: z.literal("ui_action_result"), actionId: z.string(), ok: z.boolean().optional() }),
  z.object({ type: z.literal("title"), title: z.string() }),
  z.object({ type: z.literal("ask_user"), askId: z.string(), questions: z.array(askQuestionSchema) }),
  z.object({ type: z.literal("ask_answer"), askId: z.string(), answers: z.array(askAnswerSchema).optional(), cancelled: z.boolean().optional() }),
  z.object({
    type: z.literal("usage"),
    contextTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
  }),
  z.object({ type: z.literal("status"), text: z.string().nullable() }),
  z.object({
    type: z.literal("done"),
    // ingest only: token totals + computed spend so the UI can show the actual
    // cost for whichever provider/model ran (no client-side price table needed).
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    pages: z.number().optional(),
    costUsd: z.number().optional(),
  }),
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
