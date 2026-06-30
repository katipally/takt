import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ChatRequest } from "@prox/shared";
import { DATA_DIR, getProductBySlug, getManualsByProduct, listArtifactsByChat } from "@prox/db";
import { buildProxServer, PROX_TOOL_NAMES, type Emit } from "./tools.js";
import { buildSystemPrompt, formatTranscript } from "./prompt.js";
import { resolveChat } from "./providers.js";

// Drive one chat turn through the Claude Agent SDK, mapping its stream events to
// our SSE frames. Text deltas come from partial messages; multimodal frames
// (page_image, artifact) are emitted by the tools themselves.
export async function runAgent(req: ChatRequest, emit: Emit, signal?: AbortSignal): Promise<void> {
  const product = getProductBySlug(req.productSlug);
  if (!product) { await emit({ type: "error", message: `Unknown product "${req.productSlug}"` }); return; }

  // Tear down the Claude turn when the user presses Stop (or navigates away):
  // the web proxy forwards its request abort signal all the way here.
  const ac = new AbortController();
  if (signal) {
    if (signal.aborted) ac.abort();
    else signal.addEventListener("abort", () => ac.abort(), { once: true });
  }

  const manuals = getManualsByProduct(product.id);
  const resolved = resolveChat();
  if (!resolved.apiKey) {
    await emit({ type: "error", message: "No API key configured. Add one in Settings or set ANTHROPIC_API_KEY." });
    return;
  }

  const server = buildProxServer({ product, manuals, emit, chatId: req.chatId });

  // Latest version of each artifact already made in this chat, so the model can
  // reuse a key to publish a new version instead of spawning a near-duplicate.
  const priorArtifacts = req.chatId
    ? [...new Map(listArtifactsByChat(req.chatId).map((a) => [a.groupKey ?? a.id, a])).values()]
        .map((a) => ({ key: a.groupKey ?? a.id, title: a.title, version: a.version }))
    : [];

  // When the user attached images, send a structured user message (text + image
  // blocks) so Claude can see them; otherwise a plain string prompt.
  const promptText = formatTranscript(req.messages);
  const prompt: any = req.attachments?.length
    ? (async function* () {
        yield {
          type: "user",
          parent_tool_use_id: null,
          message: {
            role: "user",
            content: [
              { type: "text", text: promptText },
              ...req.attachments!.map((a) => ({ type: "image", source: { type: "base64", media_type: a.mediaType, data: a.data } })),
            ],
          },
        };
      })()
    : promptText;

  let building = false;
  try {
    for await (const msg of query({
      prompt,
      options: {
        mcpServers: { prox: server },
        allowedTools: PROX_TOOL_NAMES,
        systemPrompt: buildSystemPrompt(product, manuals, priorArtifacts),
        model: resolved.modelId,
        ...(resolved.thinkingTokens > 0 ? { maxThinkingTokens: resolved.thinkingTokens } : {}),
        includePartialMessages: true,
        permissionMode: "bypassPermissions",
        settingSources: [],
        maxTurns: 16,
        cwd: DATA_DIR,
        abortController: ac,
        env: { ...process.env, ANTHROPIC_API_KEY: resolved.apiKey },
      },
    })) {
      if (msg.type === "stream_event") {
        const ev: any = msg.event;
        if (ev?.type === "content_block_delta") {
          if (ev.delta?.type === "text_delta") await emit({ type: "text_delta", text: ev.delta.text });
          else if (ev.delta?.type === "thinking_delta") await emit({ type: "reasoning_delta", text: ev.delta.thinking ?? "" });
        } else if (ev?.type === "content_block_start") {
          // emit_artifact streams a large code input before the tool runs — that
          // long gap looks frozen in chat. Surface a "Building…" status for it.
          const cb = ev.content_block;
          if (cb?.type === "tool_use" && String(cb.name ?? "").includes("emit_artifact")) {
            building = true;
            await emit({ type: "status", text: "Building the artifact…" });
          }
        } else if (ev?.type === "content_block_stop" && building) {
          building = false;
          await emit({ type: "status", text: null });
        }
      } else if (msg.type === "result") {
        const u: any = (msg as any).usage ?? {};
        const contextTokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        await emit({ type: "usage", contextTokens, outputTokens: u.output_tokens ?? 0, costUsd: (msg as any).total_cost_usd ?? 0 });
      }
    }
    await emit({ type: "done" });
  } catch (err: any) {
    // User pressed Stop — not an error. The partial turn is persisted upstream.
    if (ac.signal.aborted || err?.name === "AbortError") return;
    await emit({ type: "error", message: String(err?.message ?? err) });
  }
}
