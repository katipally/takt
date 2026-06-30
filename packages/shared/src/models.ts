// Single source of truth for the default models, effort, and the key-free
// fallback list shown in the picker before an API key is set. Imported by the
// agent service and the web settings/models routes so they can never drift.

export const DEFAULT_CHAT_MODEL = "claude-sonnet-5";
export const DEFAULT_CAPTION_MODEL = "claude-sonnet-5";
export const DEFAULT_EFFORT = "medium";

export interface ModelOption {
  id: string;
  display_name: string;
}

// Shown when no API key is set yet (the picker otherwise lists live models from
// the Anthropic API). Newest first.
export const FALLBACK_MODELS: ModelOption[] = [
  { id: "claude-opus-4-8", display_name: "Claude Opus 4.8" },
  { id: "claude-sonnet-5", display_name: "Claude Sonnet 5" },
  { id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5" },
];
