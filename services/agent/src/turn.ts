import type { ProviderEvent, ToolCall } from "@prox/harness";
import type { SseEvent } from "@prox/shared";

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
  // emit_artifact streams a large code arg before it runs — surface a "Building…"
  // status for that gap (preserves the SDK-era behavior), keyed by its block index.
  let buildingIndex: number | null = null;

  for await (const ev of gen) {
    switch (ev.type) {
      case "text":
        text += ev.delta;
        await emit({ type: "text_delta", text: ev.delta });
        break;
      case "reasoning":
        reasoning += ev.delta;
        await emit({ type: "reasoning_delta", text: ev.delta });
        break;
      case "reasoning_signature":
        reasoningSignature = ev.signature;
        break;
      case "tool_start":
        calls.set(ev.index, { id: ev.id, name: ev.name, args: "" });
        if (ev.name.includes("emit_artifact")) {
          buildingIndex = ev.index;
          await emit({ type: "status", text: "Building the artifact…" });
        }
        break;
      case "tool_delta": {
        const c = calls.get(ev.index);
        if (c) c.args += ev.argsDelta;
        break;
      }
      case "tool_stop":
        if (buildingIndex === ev.index) {
          buildingIndex = null;
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
