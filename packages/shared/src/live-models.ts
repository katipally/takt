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
  openai: [
    { model: "gpt-5-mini", label: "GPT-5 mini", note: "fast, multimodal, cheap", vision: true, default: true },
    { model: "gpt-5-nano", label: "GPT-5 nano", note: "lowest latency", vision: true },
  ],
  // MiniMax runs over its Anthropic-compatible endpoint, which does NOT accept
  // image input (M3 400s on an image, M2.5 says "no image") — so live camera
  // vision must NOT go to MiniMax. Text/voice-only here; for the camera the live
  // resolver prefers a vision-capable provider (OpenAI / Anthropic).
  minimax: [
    { model: "MiniMax-M2.5-highspeed", label: "M2.5 highspeed", note: "fast, strong tool use (voice only — no camera)", vision: false, default: true },
    { model: "MiniMax-M3", label: "M3", note: "1M context (voice only — no camera)", vision: false },
  ],
};

/** Recommended live models for a provider (empty if none curated). */
export function liveRecsFor(providerId: string): LiveModelRec[] {
  return LIVE_MODEL_RECS[providerId] ?? [];
}

/** Does this provider+model accept image input? Curated table wins; otherwise a
 *  per-provider heuristic. Consulted everywhere before attaching an image
 *  (chat gather, live camera frames, page-image tools). */
export function modelVision(providerId: string, model: string): boolean {
  const rec = LIVE_MODEL_RECS[providerId]?.find((r) => r.model === model);
  if (rec) return rec.vision;
  switch (providerId) {
    case "anthropic": return true;                 // all current Claude models see
    case "openai": return !/^(o1-mini|o3-mini)$/i.test(model); // gpt-5 / 4o / o-series see
    case "minimax": return false;                  // no image input over the Anthropic-compat endpoint
    default: return true;
  }
}
