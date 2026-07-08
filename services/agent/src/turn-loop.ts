import { streamProvider, type Effort, type Message, type ProviderInfo } from "@takt/harness";
import { collectTurn, type Emit } from "./turn.js";
import type { TaktTool, ToolResult } from "./tools.js";

/** Parse streamed tool-arg JSON; tolerate an empty/blank string. */
export function safeParseArgs(s: string): any {
  const t = (s ?? "").trim();
  if (!t) return {};
  try { return JSON.parse(t); } catch { return {}; }
}

export interface TurnLoopOpts {
  provider: ProviderInfo;
  apiKey?: string;
  model: string;
  effort?: Effort;
  reasoningEffort?: string;
  maxTokens?: number;
  messages: Message[]; // grows in place across steps
  tools: TaktTool[];
  emit: Emit;
  signal: AbortSignal;
  maxSteps: number;
  cost?: { input: number; output: number };
  /** Tools deferred to run AFTER the parallel gather, in call order (e.g. builds
   *  that consume what was just gathered, or ask_user which blocks). */
  deferLast?: (name: string) => boolean;
  /** Record a successful tool result's side-effects (facts, asset URLs, images). */
  onResult?: (name: string, res: ToolResult) => void;
}

/** The ONE agentic gather loop: stream a turn, dispatch its tool calls (parallel
 *  reads first, deferred builds/asks after in order), feed results back, repeat.
 *  Returns the final assistant text (the turn that made no tool call). Used by
 *  both HTTP chat and live voice. */
export async function runTurnLoop(opts: TurnLoopOpts): Promise<{ text: string }> {
  const { provider, apiKey, model, effort, reasoningEffort, maxTokens, messages, tools, emit, signal, maxSteps, cost, deferLast, onResult } = opts;
  const toolDefs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));
  const defer = deferLast ?? (() => false);
  let finalText = "";

  for (let step = 0; step < maxSteps; step++) {
    if (signal.aborted) return { text: finalText };
    const turn = await collectTurn(
      streamProvider(provider, apiKey, { model, messages, tools: toolDefs, effort, reasoningEffort, maxTokens }, signal),
      emit,
    );
    messages.push({
      role: "assistant",
      text: turn.text,
      reasoning: turn.reasoning || undefined,
      reasoningSignature: turn.reasoningSignature,
      toolCalls: turn.toolCalls.length ? turn.toolCalls : undefined,
    });
    if (cost) await emit({
      type: "usage",
      contextTokens: turn.usage.input,
      outputTokens: turn.usage.output,
      costUsd: (turn.usage.input * cost.input + turn.usage.output * cost.output) / 1_000_000,
    });
    if (!turn.toolCalls.length) { finalText = turn.text; break; }

    const runOne = async (tc: (typeof turn.toolCalls)[number]) => {
      const tool = tools.find((t) => t.name === tc.name);
      if (!tool) return { tc, res: { output: `Unknown tool "${tc.name}".`, isError: true as const } };
      try { return { tc, res: await tool.execute(safeParseArgs(tc.arguments)) }; }
      catch (e: any) { return { tc, res: { output: `Error: ${String(e?.message ?? e)}`, isError: true as const } }; }
    };
    const record = (r: { res: ToolResult }, name: string) => { if (!r.res.isError) onResult?.(name, r.res); };

    // Independent reads fan out; deferred tools (builds/asks) run after, in order.
    const gathered = await Promise.all(turn.toolCalls.filter((t) => !defer(t.name)).map(runOne));
    for (const r of gathered) record(r, r.tc.name);
    const deferred: Awaited<ReturnType<typeof runOne>>[] = [];
    for (const tc of turn.toolCalls.filter((t) => defer(t.name))) {
      if (signal.aborted) return { text: finalText };
      const r = await runOne(tc); record(r, tc.name); deferred.push(r);
    }
    // Push results in the original call order (each keyed by its callId).
    const byId = new Map([...gathered, ...deferred].map(({ tc, res }) => [tc.id, res]));
    for (const tc of turn.toolCalls) {
      const res = byId.get(tc.id)!;
      messages.push({ role: "tool", callId: tc.id, name: tc.name, result: res.output, images: res.images, isError: res.isError });
    }
  }
  return { text: finalText };
}
