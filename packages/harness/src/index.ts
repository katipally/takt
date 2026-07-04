import type { ChatRequest, ProviderEvent, ProviderInfo } from "./types"
import { streamAnthropic } from "./anthropic"
import { streamGoogle } from "./google"
import { streamOpenAI } from "./openai"
import { streamOpenAIResponses } from "./openai-responses"

export * from "./types"
export * from "./catalog"
export * from "./models"
export * from "./registry"

/** Dispatch a streaming chat request to the right wire adapter. */
export function streamProvider(
  provider: ProviderInfo,
  apiKey: string | undefined,
  req: ChatRequest,
  signal: AbortSignal,
): AsyncGenerator<ProviderEvent> {
  const headers =
    provider.id === "openrouter" ? { "HTTP-Referer": "https://prox.local", "X-Title": "Prox" } : undefined
  if (provider.protocol === "anthropic")
    return streamAnthropic({ baseURL: provider.baseURL, apiKey, req, signal, headers })
  if (provider.protocol === "google") return streamGoogle({ baseURL: provider.baseURL, apiKey, req, signal })
  // OpenAI (and any provider that advertises it) uses the newer Responses API.
  if (provider.supportsResponses)
    return streamOpenAIResponses({ baseURL: provider.baseURL, apiKey, req, signal, headers })
  return streamOpenAI({ baseURL: provider.baseURL, apiKey, req, signal, headers })
}
