import { z } from "zod";
import { askQuestionSchema, askAnswerSchema } from "./ask-spec";

// The wire protocol between the agent service and the browser. One JSON object
// per SSE `data:` line. The agent emits these; the web `/api/chat` route is a
// dumb byte-pass-through proxy; the chat-stream hook decodes them.
//
// The canvas is streamed as raw HTML: `canvas_start` opens it, `canvas_delta`
// carries the full decoded HTML so far (idempotent replace; kept in the store
// and persisted, so an interrupted stream still leaves a partial page — the
// client paints only the finished page), and `canvas_end` delivers the
// authoritative sanitized+linted full page.

export const sseEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text_delta"), text: z.string() }),
  z.object({ type: z.literal("reasoning_delta"), text: z.string() }),
  z.object({ type: z.literal("tool_start"), id: z.string(), tool: z.string(), summary: z.string().optional(), lane: z.enum(["main", "build"]).optional() }),
  z.object({ type: z.literal("tool_done"), id: z.string(), detail: z.string().optional() }),
  // The agent's working checklist, shown (and updated) in the status bar.
  z.object({ type: z.literal("todos"), items: z.array(z.object({ text: z.string(), done: z.boolean() })) }),
  // A manual page/crop shown as a citation source (opens in the source modal).
  z.object({
    type: z.literal("source"),
    citationId: z.string(),
    url: z.string(),
    page: z.number(),
    manualKind: z.string(),
    manualTitle: z.string().optional(),
    caption: z.string().nullable().optional(),
    productSlug: z.string().nullable().optional(),
    productName: z.string().nullable().optional(),
  }),
  // ── canvas (streamed HTML) ──
  // canvas_start opens a canvas (title shell); canvas_delta carries the full
  // decoded HTML so far (crash-resilience only — not painted live); canvas_end
  // is the authoritative sanitized + linted full page under the same canvasId.
  z.object({ type: z.literal("canvas_start"), canvasId: z.string(), title: z.string().optional() }),
  z.object({ type: z.literal("canvas_delta"), canvasId: z.string(), html: z.string() }),
  z.object({ type: z.literal("canvas_end"), canvasId: z.string(), html: z.string(), title: z.string().optional() }),
  // The canvas build failed to produce a usable page (empty/contentless output,
  // or an error). The client clears the build skeleton — the answer stays in chat.
  z.object({ type: z.literal("canvas_error"), canvasId: z.string(), message: z.string() }),
  // Highlight (ring + scroll-into-view) a block by its data-takt-id; empty clears.
  z.object({ type: z.literal("canvas_highlight"), target: z.string() }),
  // ── live overlay (voice mode) ──
  // A visual the agent pins over the live stage while talking: a rotatable 3D
  // part ("model"), a manual figure/photo ("figure"), a repair clip ("video"),
  // or a short pointer label ("note") optionally anchored on the camera view at
  // normalized 0–1 coords. "clear" takes the current overlay down. Ephemeral —
  // rendered live, not persisted into the chat blocks.
  z.object({
    type: z.literal("live_overlay"),
    overlayId: z.string(),
    kind: z.enum(["model", "figure", "video", "note", "clear"]),
    url: z.string().optional(),
    caption: z.string().optional(),
    anchor: z.object({ x: z.number(), y: z.number() }).optional(),
  }),
  // Resolution of an interactive canvas action (ack to the client).
  z.object({ type: z.literal("action_result"), actionId: z.string(), ok: z.boolean().optional() }),
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
