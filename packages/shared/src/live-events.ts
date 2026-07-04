import { z } from "zod";
import { sseEventSchema } from "./sse-events";

// The live-mode wire protocol between the browser and the agent's /live
// WebSocket. Two channels share the socket:
//   • BINARY frames — a 1-byte tag says what they are (audio/video). Low overhead
//     for the hot path (PCM + JPEG).
//   • TEXT frames — JSON control/caption/state messages (the discriminated unions
//     below), and — reusing the existing SSE union verbatim — every agent-turn
//     event so the browser feeds them into the same chatStore reducer the text
//     chat uses (artifacts, page images, usage all render unchanged).

/** First byte of a binary WS message. */
export const LIVE_TAG = {
  AUDIO_IN: 0x01, // client→server: Int16LE PCM, mono, 16 kHz
  FRAME_IN: 0x02, // client→server: JPEG camera frame
  AUDIO_OUT: 0x10, // server→client: [tag][uint32LE epoch][Int16LE PCM mono 24 kHz]
} as const;

// ── server → client (JSON) ────────────────────────────────────────────────
export const liveServerMsgSchema = z.discriminatedUnion("t", [
  // Wrap an ordinary chat SSE event so the browser reuses the existing reducer.
  z.object({ t: z.literal("sse"), event: sseEventSchema }),
  // Live transcript: the user's speech and the agent's spoken reply.
  z.object({ t: z.literal("caption"), role: z.enum(["user", "agent"]), text: z.string(), final: z.boolean() }),
  // Barge-in: drop every scheduled audio buffer with an epoch below this one.
  z.object({ t: z.literal("flush"), epoch: z.number() }),
  // Tell the client how to sample the camera (adaptive vision controller).
  z.object({ t: z.literal("vision"), fps: z.number(), size: z.number() }),
  // Coarse UI state for the orb/captions.
  z.object({ t: z.literal("state"), phase: z.enum(["warming", "idle", "listening", "thinking", "speaking"]) }),
  // Ask the client for ONE fresh hi-res frame (the `look` tool). The client
  // replies with a frame_response then sends the JPEG as the next binary frame.
  z.object({ t: z.literal("need_frame"), reqId: z.string() }),
  z.object({ t: z.literal("error"), message: z.string() }),
]);
export type LiveServerMsg = z.infer<typeof liveServerMsgSchema>;

// ── client → server (JSON) ────────────────────────────────────────────────
export const liveClientMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("control"), action: z.enum(["mute", "unmute", "camera_on", "camera_off", "end"]) }),
  // Answer to need_frame; the hi-res JPEG follows as the next FRAME_IN binary.
  z.object({ t: z.literal("frame_response"), reqId: z.string() }),
]);
export type LiveClientMsg = z.infer<typeof liveClientMsgSchema>;

export function encodeLiveMsg(m: LiveServerMsg | LiveClientMsg): string {
  return JSON.stringify(m);
}
