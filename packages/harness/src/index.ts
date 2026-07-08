import type { ChatRequest, ProviderEvent, ProviderInfo } from "./types"
import { streamAnthropic } from "./anthropic"
import { streamOpenAIResponses } from "./openai-responses"

export * from "./types"
export * from "./effort"
export * from "./catalog"
export * from "./models"
export * from "./registry"

/** Dispatch a streaming chat request to the right wire adapter. Two adapters:
 *  Anthropic (Claude + MiniMax's Anthropic-compat endpoint) and OpenAI Responses. */
export function streamProvider(
  provider: ProviderInfo,
  apiKey: string | undefined,
  req: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<ProviderEvent> {
  if (provider.protocol === "anthropic")
    return streamAnthropic({ baseURL: provider.baseURL, apiKey, req, signal, quirks: provider.quirks })
  return streamOpenAIResponses({ baseURL: provider.baseURL, apiKey, req, signal })
}
