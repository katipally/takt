import {
  listProviders, createProvider, updateProvider,
  getProviderApiKey, getSetting, setSetting,
} from "@prox/db";
import { BUILTIN_PROVIDERS, type ProviderInfo, type Effort } from "@prox/harness";
import { DEFAULT_EFFORT } from "@prox/shared";

// Provider-neutral resolution. Keys live in the DB `providers` table (kind =
// harness provider id) or fall back to the provider's declared env vars. Which
// provider + model to chat with is a setting — nothing is hardcoded to Anthropic.

export function providerInfo(id: string): ProviderInfo | undefined {
  return BUILTIN_PROVIDERS.find((p) => p.id === id);
}

// Seed a DB provider row for every builtin whose env key is present, so a
// freshly-booted instance is usable from whatever key the host set (ANTHROPIC_,
// OPENAI_, GEMINI_, …). The first one seeded becomes the default.
export function ensureSeedProviders() {
  const existing = listProviders();
  let seededDefault = existing.some((p) => p.isDefault);
  for (const p of BUILTIN_PROVIDERS) {
    const envKey = p.envKeys?.map((k) => process.env[k]?.trim()).find(Boolean) || null;
    if (!envKey) continue;
    const row = existing.find((e) => e.kind === p.id);
    if (!row) {
      createProvider({ name: p.name, kind: p.id, apiKey: envKey, isDefault: !seededDefault });
      seededDefault = true;
    } else if (!row.hasKey) {
      updateProvider(row.id, { apiKey: envKey });
    }
  }
  if (getSetting("effort") === undefined) setSetting("effort", DEFAULT_EFFORT);
}

// Decrypted key for a provider id: DB row first, then the provider's env vars.
export function getProviderKey(providerId: string): string | null {
  const row = listProviders().find((p) => p.kind === providerId);
  const dbKey = row ? getProviderApiKey(row.id) : null;
  if (dbKey) return dbKey;
  const info = providerInfo(providerId);
  return info?.envKeys?.map((k) => process.env[k]?.trim()).find(Boolean) || null;
}

// The provider id the user is chatting with: the `chatProviderId` setting if
// set, else prefer a provider that actually has a usable key — so a fresh clone
// with any single key (Anthropic OR OpenAI OR …) works with no picking required.
function resolveChatProviderId(): string {
  const set = getSetting("chatProviderId");
  if (set && providerInfo(set)) return set;
  const def = listProviders().find((p) => p.isDefault);
  if (def && getProviderKey(def.kind)) return def.kind;
  const dbKeyed = listProviders().find((p) => getProviderKey(p.kind))?.kind;
  const envKeyed = BUILTIN_PROVIDERS.find((p) => getProviderKey(p.id))?.id;
  return dbKeyed ?? envKeyed ?? def?.kind ?? BUILTIN_PROVIDERS[0]!.id;
}

export interface ResolvedChat {
  provider: ProviderInfo;
  model: string;
  apiKey: string | null;
  effort?: Effort;
}

export function resolveChat(): ResolvedChat {
  const providerId = resolveChatProviderId();
  const provider = providerInfo(providerId) ?? BUILTIN_PROVIDERS[0]!;
  const effortSetting = getSetting("effort") ?? DEFAULT_EFFORT;
  return {
    provider,
    model: getSetting("chatModel") ?? "",
    apiKey: getProviderKey(provider.id),
    // "none" disables reasoning; anything else passes through and the adapter
    // computes the thinking budget from the effort level.
    effort: effortSetting === "none" ? undefined : (effortSetting as Effort),
  };
}

// Which provider + model captions manual pages at ingest. Its own settings so
// it can differ from chat; falls back to the chat provider when unset.
export function resolveCaption(): { provider: ProviderInfo; model: string; apiKey: string | null } {
  const providerId = getSetting("captionProviderId");
  const provider = (providerId && providerInfo(providerId)) || resolveChat().provider;
  return {
    provider,
    model: getSetting("captionModel") ?? getSetting("chatModel") ?? "",
    apiKey: getProviderKey(provider.id),
  };
}
