// Curated "best for Live voice" model shortlist, per provider. Live mode wants
// FAST time-to-first-token + short spoken replies, and vision when the camera is
// on. This is a hand-picked convenience layer over each provider's full model
// list (still fetched live) — NOT an allowlist. IDs are best-effort as of
// mid-2026; if a provider renames one, the full picker still works and this table
// is a one-file edit. `vision: false` means camera frames are skipped for it.
export interface LiveModelRec {
  model: string;       // provider model id (what gets stored as `liveModel`)
  label: string;       // short human label for the chip
  note: string;        // why it's good for live
  vision: boolean;     // can it take a camera frame?
  default?: boolean;   // the ✦ pick for this provider
}

export const LIVE_MODEL_RECS: Record<string, LiveModelRec[]> = {
  anthropic: [
    { model: "claude-haiku-4-5", label: "Haiku 4.5", note: "~600ms first token, vision, natural short replies", vision: true, default: true },
  ],
  google: [
    { model: "gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "fast, cheap, multimodal", vision: true, default: true },
    { model: "gemini-2.5-flash-lite", label: "Flash Lite", note: "lowest latency, vision", vision: true },
  ],
  openai: [
    { model: "gpt-5-mini", label: "GPT-5 mini", note: "fast, multimodal, cheap", vision: true, default: true },
    { model: "gpt-5-nano", label: "GPT-5 nano", note: "lowest latency", vision: true },
  ],
  groq: [
    { model: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout", note: "sub-100ms first token, vision", vision: true, default: true },
    { model: "moonshotai/kimi-k2-instruct", label: "Kimi K2", note: "very fast, strong chat (text)", vision: false },
    { model: "openai/gpt-oss-120b", label: "gpt-oss 120B", note: "fast open model (text)", vision: false },
  ],
  cerebras: [
    { model: "llama-3.3-70b", label: "Llama 3.3 70B", note: "fastest tokens/sec (text)", vision: false, default: true },
    { model: "qwen-3-32b", label: "Qwen3 32B", note: "fast, capable (text)", vision: false },
  ],
  xai: [
    { model: "grok-4-fast", label: "Grok 4 Fast", note: "fast, multimodal", vision: true, default: true },
  ],
  mistral: [
    { model: "mistral-small-latest", label: "Mistral Small", note: "fast, cheap, multimodal", vision: true, default: true },
  ],
  deepseek: [
    { model: "deepseek-chat", label: "DeepSeek Chat", note: "cheap, capable (text)", vision: false, default: true },
  ],
  openrouter: [
    { model: "anthropic/claude-haiku-4-5", label: "Haiku 4.5", note: "fast, vision", vision: true, default: true },
    { model: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", note: "fast, vision", vision: true },
  ],
  together: [
    { model: "meta-llama/Llama-4-Scout-17B-16E-Instruct", label: "Llama 4 Scout", note: "fast, vision", vision: true, default: true },
  ],
  fireworks: [
    { model: "accounts/fireworks/models/llama4-scout-instruct-basic", label: "Llama 4 Scout", note: "fast, vision", vision: true, default: true },
  ],
  deepinfra: [
    { model: "meta-llama/Llama-4-Scout-17B-16E-Instruct", label: "Llama 4 Scout", note: "fast, vision", vision: true, default: true },
  ],
};

/** Recommended live models for a provider (empty if none curated). */
export function liveRecsFor(providerId: string): LiveModelRec[] {
  return LIVE_MODEL_RECS[providerId] ?? [];
}

/** Does this provider+model take a camera frame? Looks up the curated table;
 *  returns undefined when unknown (caller decides — we default to attaching). */
export function liveModelVision(providerId: string, model: string): boolean | undefined {
  return LIVE_MODEL_RECS[providerId]?.find((r) => r.model === model)?.vision;
}
