import { streamProvider, catalogModels, type Message } from "@prox/harness";
import type { ChatRequest } from "@prox/shared";
import { getProductBySlug, getManualsByProduct, listArtifactsByChat } from "@prox/db";
import { buildProxTools, type Emit } from "./tools.js";
import { collectTurn } from "./turn.js";
import { buildSystemPrompt, formatTranscript } from "./prompt.js";
import { resolveChat } from "./providers.js";

const MAX_STEPS = 16;

// Per-1M-token prices for the chosen model, from the models.dev catalog
// (cached ~24h). Unknown → zero, so cost just shows $0 rather than breaking.
async function modelCost(provider: any, model: string): Promise<{ input: number; output: number }> {
  try {
    const meta = await catalogModels(provider.catalogId);
    const c = meta[model]?.cost;
    if (c) return { input: c.input ?? 0, output: c.output ?? 0 };
  } catch { /* offline / no catalog */ }
  return { input: 0, output: 0 };
}

// Drive one chat turn through our own provider-agnostic loop (replaces the
// Claude Agent SDK's query()). We own the message list, tool dispatch, and the
// mapping from the normalized ProviderEvent stream to our SSE frames.
export async function runAgent(req: ChatRequest, emit: Emit, signal?: AbortSignal): Promise<void> {
  const product = getProductBySlug(req.productSlug);
  if (!product) { await emit({ type: "error", message: `Unknown product "${req.productSlug}"` }); return; }

  // Tear down the turn when the user presses Stop (or navigates away): the web
  // proxy forwards its request abort signal all the way here.
  const ac = new AbortController();
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener("abort", () => ac.abort(), { once: true });
  }

  const manuals = getManualsByProduct(product.id);
  const { provider, model, apiKey, effort } = resolveChat();
  if (!model) { await emit({ type: "error", message: "No model selected. Open Settings → Models and pick a model." }); return; }
  if (!apiKey && !provider.keyless) {
    await emit({ type: "error", message: `No API key for ${provider.name}. Add one in Settings → Models.` });
    return;
  }

  const tools = buildProxTools({ product, manuals, emit, chatId: req.chatId });
  const toolDefs = tools.map(({ name, description, parameters }) => ({ name, description, parameters }));

  // Latest version of each artifact already made in this chat, so the model can
  // reuse a key to publish a new version instead of spawning a near-duplicate.
  const priorArtifacts = req.chatId
    ? [...new Map(listArtifactsByChat(req.chatId).map((a) => [a.groupKey ?? a.id, a])).values()]
        .map((a) => ({ key: a.groupKey ?? a.id, title: a.title, version: a.version }))
    : [];

  const messages: Message[] = [
    { role: "system", text: buildSystemPrompt(product, manuals, priorArtifacts) },
    {
      role: "user",
      text: formatTranscript(req.messages),
      // When the user attached images, send them so the model can see them.
      images: req.attachments?.map((a) => ({ data: a.data, mime: a.mediaType })),
    },
  ];

  const cost = await modelCost(provider, model);

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (ac.signal.aborted) return;
      const turn = await collectTurn(
        streamProvider(provider, apiKey ?? undefined, { model, messages, tools: toolDefs, effort, maxTokens: 8192 }, ac.signal),
        emit,
      );
      messages.push({
        role: "assistant",
        text: turn.text,
        reasoning: turn.reasoning || undefined,
        reasoningSignature: turn.reasoningSignature,
        toolCalls: turn.toolCalls.length ? turn.toolCalls : undefined,
      });
      await emit({
        type: "usage",
        contextTokens: turn.usage.input,
        outputTokens: turn.usage.output,
        costUsd: (turn.usage.input * cost.input + turn.usage.output * cost.output) / 1_000_000,
      });
      if (!turn.toolCalls.length) break; // no tools requested → the turn is done

      for (const tc of turn.toolCalls) {
        if (ac.signal.aborted) return;
        const tool = tools.find((t) => t.name === tc.name);
        if (!tool) {
          messages.push({ role: "tool", callId: tc.id, name: tc.name, result: `Unknown tool "${tc.name}".`, isError: true });
          continue;
        }
        let res;
        try { res = await tool.execute(safeParseArgs(tc.arguments)); }
        catch (e: any) { res = { output: `Error: ${String(e?.message ?? e)}`, isError: true as const }; }
        messages.push({
          role: "tool", callId: tc.id, name: tc.name,
          result: res.output, images: res.images, isError: res.isError,
        });
      }
    }
    await emit({ type: "done" });
  } catch (err: any) {
    // User pressed Stop — not an error. The partial turn is persisted upstream.
    if (ac.signal.aborted || err?.name === "AbortError") return;
    const raw = String(err?.message ?? err);
    // Turn an opaque auth failure into an actionable, provider-named message.
    const msg = /invalid api key|authentication|401|403|unauthor|x-api-key|forbidden/i.test(raw)
      ? `${provider.name} rejected the API key. Open Settings → Models and paste a valid key.`
      : raw;
    await emit({ type: "error", message: msg });
  }
}

// Tool args arrive as a streamed JSON string; tolerate an empty/blank one.
function safeParseArgs(s: string): any {
  const t = (s ?? "").trim();
  if (!t) return {};
  try { return JSON.parse(t); } catch { return {}; }
}
