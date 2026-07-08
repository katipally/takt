import type { ProviderEvent, ToolCall } from "@takt/harness";
import type { SseEvent } from "@takt/shared";
import { streamingJsonSurface, surfacePartId } from "@takt/shared";

export type Emit = (e: SseEvent) => Promise<void> | void;

export interface Turn {
  text: string;
  reasoning: string;
  reasoningSignature?: string;
  toolCalls: ToolCall[];
  usage: { input: number; output: number };
}

// Fold a provider's normalized event stream into one assistant turn, emitting
// SSE deltas as it goes. Replaces the Claude Agent SDK's stream_event handling.
export async function collectTurn(gen: AsyncGenerator<ProviderEvent>, emit: Emit): Promise<Turn> {
  let text = "";
  let reasoning = "";
  let reasoningSignature: string | undefined;
  const usage = { input: 0, output: 0 };
  // Tool-use blocks arrive as start + streamed JSON-arg deltas + stop, keyed by index.
  const calls = new Map<number, { id: string; name: string; args: string }>();
  // emit_ui streams a large surface arg before it runs. Rather than waiting with a
  // "Designing…" status, we leniently parse the accumulating arg and emit PARTIAL
  // surfaces so the stage fills in as the model writes it. The final whole-surface
  // emit (from the emit_ui tool) reuses the same partId and replaces the partial.
  let buildingIndex: number | null = null;
  let lastPartialLen = 0;      // arg length at the last partial emit (throttle)
  let partialPartId: string | null = null;

  for await (const ev of gen) {
    switch (ev.type) {
      case "text": {
        // Drop leading whitespace at the very start of the reply so the chat
        // bubble never opens with blank lines (weak models often emit "\n\n…").
        let d = ev.delta;
        if (text.length === 0) { d = d.replace(/^\s+/, ""); if (!d) break; }
        text += d;
        await emit({ type: "text_delta", text: d });
        break;
      }
      case "reasoning":
        reasoning += ev.delta;
        await emit({ type: "reasoning_delta", text: ev.delta });
        break;
      case "reasoning_signature":
        reasoningSignature = ev.signature;
        break;
      case "tool_start":
        calls.set(ev.index, { id: ev.id, name: ev.name, args: "" });
        if (ev.name.includes("emit_ui")) {
          buildingIndex = ev.index;
          lastPartialLen = 0; partialPartId = null;
          await emit({ type: "status", text: "Designing your answer…" });
        }
        break;
      case "tool_delta": {
        const c = calls.get(ev.index);
        if (c) c.args += ev.argsDelta;
        // Throttled progressive emit for the surface being built. Small step so the
        // page visibly types itself in rather than jumping in big chunks; the host
        // just re-sets innerHTML on a partial (scripts stripped), so it's cheap.
        if (c && ev.index === buildingIndex && c.args.length - lastPartialLen > 120) {
          lastPartialLen = c.args.length;
          const surface = streamingJsonSurface(c.args);
          if (surface) {
            partialPartId = surfacePartId(surface);
            await emit({ type: "ui_surface", partId: partialPartId, surface, partial: true });
          }
        }
        break;
      }
      case "tool_stop":
        if (buildingIndex === ev.index) {
          buildingIndex = null;
          // Clear the status; the emit_ui tool emits the final whole surface next,
          // replacing the partial under the same partId.
          await emit({ type: "status", text: null });
        }
        break;
      case "usage":
        usage.input += ev.input;
        usage.output += ev.output;
        break;
      case "done":
        break;
    }
  }

  const toolCalls: ToolCall[] = [...calls.values()].map((c) => ({ id: c.id, name: c.name, arguments: c.args }));
  return { text, reasoning, reasoningSignature, toolCalls, usage };
}
