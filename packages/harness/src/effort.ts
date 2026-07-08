import type { Effort } from "./types"

/** Map a reasoning effort level to a thinking token budget (legacy Anthropic form). */
export function thinkingBudget(effort?: Effort): number {
  switch (effort) {
    case "low":
      return 2048
    case "medium":
      return 4096
    case "high":
      return 8192
    case "xhigh":
      return 12288
    case "max":
      return 16384
    default:
      return 0
  }
}

/** OpenAI's `reasoning.effort` only accepts low/medium/high — collapse the top two. */
export const EFFORT_MAP: Record<Effort, string> = {
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
  max: "high",
}

/** Does a model id look like it exposes a reasoning/thinking channel? Single
 *  source of truth (was copy-pasted in models.ts and the live turn runner). */
export function isReasoningModel(id: string): boolean {
  return /(^|[-/])(o\d|gpt-5|gpt-6)|reason|think|deepseek-r|r1|qwq|magistral|minimax-m/i.test(id)
}
