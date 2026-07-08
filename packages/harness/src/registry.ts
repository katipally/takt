import type { ProviderInfo } from "./types"

/**
 * The three supported providers. Claude and MiniMax both speak the Anthropic
 * wire protocol (MiniMax via its Anthropic-compat endpoint, with quirks);
 * OpenAI speaks the Responses API. `catalogId` maps to the models.dev key.
 */
export interface BuiltinProvider extends ProviderInfo {
  catalogId?: string
}

export const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    protocol: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    envKeys: ["ANTHROPIC_API_KEY"],
    catalogId: "anthropic",
  },
  {
    id: "openai",
    name: "OpenAI",
    protocol: "openai",
    baseURL: "https://api.openai.com/v1",
    envKeys: ["OPENAI_API_KEY"],
    catalogId: "openai",
  },
  {
    id: "minimax",
    name: "MiniMax",
    protocol: "anthropic",
    // Anthropic-compatible endpoint (full path .../anthropic/v1; the adapter
    // appends /messages). MiniMax authenticates with a Bearer token and does
    // NOT accept cache_control blocks or Anthropic's adaptive-thinking params
    // (its M2.x reasoning is always-on) — hence the quirks. It does its own
    // automatic prefix caching, so caching isn't lost.
    baseURL: "https://api.minimax.io/anthropic/v1",
    envKeys: ["MINIMAX_API_KEY"],
    catalogId: "minimax",
    quirks: { noCacheControl: true, noThinking: true, bearerAuth: true },
  },
]

/** A sane default model id for a provider when the user hasn't picked one — the
 *  first snapshot entry (curated "good default" per provider). Keeps the promise
 *  that adding any single key and chatting Just Works with no model pick; without
 *  it the model id is "" and every provider 400s. */
export function defaultModel(providerId: string): string {
  return MODEL_SNAPSHOT[providerId]?.[0] ?? ""
}

/** Small offline snapshot so the /model picker always has options (overridden by models.dev). */
export const MODEL_SNAPSHOT: Record<string, string[]> = {
  anthropic: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  openai: ["gpt-5", "gpt-5-mini", "o3"],
  // MiniMax-M3 (1M ctx, vision) and M2.5 (vision) support images over the
  // Anthropic-compat endpoint; M2 is text-only.
  minimax: ["MiniMax-M3", "MiniMax-M2.5", "MiniMax-M2.5-highspeed"],
}
