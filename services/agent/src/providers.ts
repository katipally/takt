import {
  listProviders, createProvider, updateProvider,
  getProviderApiKey, getSetting, setSetting,
} from "@prox/db";
import { DEFAULT_CHAT_MODEL, DEFAULT_CAPTION_MODEL, DEFAULT_EFFORT } from "@prox/shared";

// Anthropic-only. The .env ANTHROPIC_API_KEY seeds the provider on first boot;
// model choice + reasoning effort + the caption (vision) model live in settings.
const DEFAULTS = {
  chatModel: DEFAULT_CHAT_MODEL,
  captionModel: DEFAULT_CAPTION_MODEL,
  effort: DEFAULT_EFFORT,
};

export function ensureSeedProviders() {
  let anthropic = listProviders().find((p) => p.kind === "anthropic");
  const envKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  if (!anthropic) {
    anthropic = createProvider({ name: "Anthropic", kind: "anthropic", apiKey: envKey, isDefault: true });
  } else if (envKey && !anthropic.hasKey) {
    updateProvider(anthropic.id, { apiKey: envKey });
  }
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (getSetting(k) === undefined) setSetting(k, v);
  }
}

export function getAnthropicKey(): string | null {
  const anthropic = listProviders().find((p) => p.kind === "anthropic");
  return (anthropic ? getProviderApiKey(anthropic.id) : null) ?? process.env.ANTHROPIC_API_KEY ?? null;
}

// Reasoning effort → extended-thinking token budget. "none" disables thinking.
const EFFORT_BUDGET: Record<string, number> = { none: 0, low: 2048, medium: 6144, high: 14336, xhigh: 24576, max: 32768 };

export interface ResolvedChat {
  modelId: string;
  apiKey: string | null;
  thinkingTokens: number;
}

export function resolveChat(): ResolvedChat {
  const effort = getSetting("effort") ?? DEFAULTS.effort;
  return {
    modelId: getSetting("chatModel") ?? DEFAULTS.chatModel,
    apiKey: getAnthropicKey(),
    thinkingTokens: EFFORT_BUDGET[effort] ?? EFFORT_BUDGET.medium!,
  };
}
