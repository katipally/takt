// Domain types shared across the web app, agent service, and ingest pipeline.

import type { AskQuestion, AskAnswer } from "./ask-spec";
import type { UISurface } from "./ui-spec";

export type ManualKind = "owner" | "quick_start" | "selection_chart" | "other";
// A provider id from the harness registry (BUILTIN_PROVIDERS): "anthropic",
// "openai", "google", "openrouter", "ollama", … — no longer Anthropic-only.
export type ProviderKind = string;
export type MessageRole = "user" | "assistant" | "tool";

export interface Product {
  id: string;
  slug: string;
  name: string;
  manufacturer: string | null;
  summary: string | null;
  heroPath: string | null;
  createdAt: string;
  /** Product-specific starter questions (from settings KV); generic fallback if absent. */
  starters?: string[];
}

export interface Manual {
  id: string;
  productId: string;
  kind: ManualKind;
  title: string;
  pdfPath: string;
  pageCount: number;
}

export interface PageImage {
  id: string;
  manualId: string;
  productId: string;
  pageNumber: number;
  pngPath: string;
  width: number;
  height: number;
  caption: string | null;
}

// Slugs the product router reserves — a product can never take one (they'd shadow
// a static route like /master, /gallery, /api). Enforced at the ingest boundary.
export const RESERVED_SLUGS = [
  "master", "all", "api", "assets", "sandbox-host", "health", "live", "chat", "settings",
] as const;
export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug.trim().toLowerCase());
}

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  /** Masked for display — never the plaintext key. */
  keyLast4: string | null;
  hasKey: boolean;
  isDefault: boolean;
}

export interface ChatSummary {
  id: string;
  productId: string | null;
  title: string;
  createdAt: string;
}

/** A persisted/transported message. `content` is an array of blocks (see below). */
export interface ChatMessage {
  id: string;
  chatId: string;
  role: MessageRole;
  content: MessageBlock[];
  createdAt: string;
}

export type MessageBlock =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; id?: string; tool: string; summary?: string; detail?: string; status: "running" | "done" }
  | { type: "page_image"; citationId: string; url: string; page: number; manualKind: ManualKind; manualTitle?: string | null; caption: string | null; productSlug?: string | null; productName?: string | null }
  | { type: "ui"; partId: string; surface: UISurface }
  | { type: "ask_user"; askId: string; questions: AskQuestion[]; answers?: AskAnswer[]; cancelled?: boolean };

/** Request body the web app POSTs to /api/chat (and the agent service).
 * `productSlug` is null in master mode (no product selected — search across all). */
export interface ChatRequest {
  productSlug: string | null;
  chatId: string;
  /** Prior turns + the new user turn (text only on the way in). */
  messages: { role: "user" | "assistant"; text: string }[];
  /** Images attached to the latest user turn (base64), sent to Claude as vision input. */
  attachments?: { mediaType: string; data: string }[];
}
