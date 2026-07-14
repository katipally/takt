import type { ProviderEvent, ToolCall } from "@takt/harness";
import type { SseEvent } from "@takt/shared";

export type Emit = (e: SseEvent) => Promise<void> | void;

export interface Turn {
  text: string;
  reasoning: string;
  reasoningSignature?: string;
  toolCalls: ToolCall[];
  usage: { input: number; output: number };
  /** provider stop reason — "max_tokens" means the turn was truncated mid-output */
  stopReason: string;
}

/** Fold a provider's normalized event stream into one assistant turn, emitting
 *  SSE text/reasoning deltas as it goes. `onArgDelta` fires as a tool's argument
 *  JSON streams in (name + accumulated args) — the canvas worker uses it to
 *  decode and stream the HTML page live. */
export async function collectTurn(
  gen: AsyncGenerator<ProviderEvent>,
  emit: Emit,
  onArgDelta?: (name: string, argsSoFar: string) => void | Promise<void>,
): Promise<Turn> {
  let text = "";
  let reasoning = "";
  let reasoningSignature: string | undefined;
  let stopReason = "stop";
  const usage = { input: 0, output: 0 };
  // Tool-use blocks arrive as start + streamed JSON-arg deltas + stop, keyed by index.
  const calls = new Map<number, { id: string; name: string; args: string }>();

  for await (const ev of gen) {
    switch (ev.type) {
      case "text": {
        // Drop leading whitespace at the very start so a bubble never opens blank.
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
        break;
      case "tool_delta": {
        const c = calls.get(ev.index);
        if (!c) break;
        c.args += ev.argsDelta;
        if (onArgDelta) await onArgDelta(c.name, c.args);
        break;
      }
      case "tool_stop":
        break;
      case "usage":
        usage.input += ev.input;
        usage.output += ev.output;
        break;
      case "done":
        stopReason = ev.stopReason;
        break;
    }
  }

  const toolCalls: ToolCall[] = [...calls.values()].map((c) => ({ id: c.id, name: c.name, arguments: c.args }));
  return { text, reasoning, reasoningSignature, toolCalls, usage, stopReason };
}
