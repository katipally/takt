// Static model metadata for the cost + context meter and the adaptive effort
// selector. Pricing/context verified against Anthropic docs (mid-2026).
// Effort levels differ per tier: Haiku doesn't take the effort param at all,
// Sonnet 4.6 tops out at "max", only Opus has "xhigh".

export interface ModelMeta {
  contextWindow: number;
  maxOutput: number;
  inputPrice: number; // $ / 1M tokens
  outputPrice: number;
  efforts: string[];
  thinking: boolean;
}

const OPUS: ModelMeta = { contextWindow: 1_000_000, maxOutput: 128_000, inputPrice: 5, outputPrice: 25, efforts: ["none", "low", "medium", "high", "xhigh", "max"], thinking: true };
const SONNET: ModelMeta = { contextWindow: 1_000_000, maxOutput: 64_000, inputPrice: 3, outputPrice: 15, efforts: ["none", "low", "medium", "high", "max"], thinking: true };
const HAIKU: ModelMeta = { contextWindow: 200_000, maxOutput: 64_000, inputPrice: 1, outputPrice: 5, efforts: ["none", "low", "medium", "high"], thinking: true };
const FALLBACK: ModelMeta = { contextWindow: 200_000, maxOutput: 64_000, inputPrice: 3, outputPrice: 15, efforts: ["none", "low", "medium", "high"], thinking: true };

export function metaFor(modelId: string | undefined): ModelMeta {
  if (!modelId) return FALLBACK;
  if (modelId.includes("opus")) return OPUS;
  if (modelId.includes("sonnet")) return SONNET;
  if (modelId.includes("haiku")) return HAIKU;
  return FALLBACK;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function costFromTokens(input: number, output: number, model: string | undefined): number {
  const m = metaFor(model);
  return (input * m.inputPrice + output * m.outputPrice) / 1_000_000;
}

// Rough pre-ingest estimate: one vision call per page. A 2x manual page ~ a
// capped image (~1.6k input tokens) + ~0.7k output tokens of transcription.
// ponytail: a heuristic, labelled "~"; the actual spend is shown after.
export function estimateIngestCost(pages: number, model: string | undefined): number {
  return costFromTokens(pages * 1600, pages * 700, model);
}
