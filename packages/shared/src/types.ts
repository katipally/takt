// Domain types shared across the web app, agent service, and ingest pipeline.

import type { AskQuestion, AskAnswer } from "./ask-spec";

export type ManualKind = "owner" | "quick_start" | "selection_chart" | "other";
export type ChunkKind = "text" | "image_caption";
export type ProviderKind = "anthropic";
export type ArtifactKind = "react" | "html";
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

export interface SearchResult {
  content: string;
  pageNumber: number;
  manualKind: ManualKind;
  manualTitle: string;
  kind: ChunkKind;
  score: number;
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

export interface Artifact {
  id: string;
  productId: string;
  chatId: string | null;
  title: string;
  kind: ArtifactKind;
  code: string;
  groupKey: string | null;
  version: number;
  thumbnailPath: string | null;
  createdAt: string;
}

export interface ChatSummary {
  id: string;
  productId: string;
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
  | { type: "page_image"; citationId: string; url: string; page: number; manualKind: ManualKind; manualTitle?: string | null; caption: string | null }
  | { type: "artifact"; artifactId: string; title: string; kind: ArtifactKind; groupKey?: string; version?: number }
  | { type: "ask_user"; askId: string; questions: AskQuestion[]; answers?: AskAnswer[]; cancelled?: boolean }
  | { type: "citation"; citationId: string; page: number; manualKind: ManualKind };

/** Request body the web app POSTs to /api/chat (and the agent service). */
export interface ChatRequest {
  productSlug: string;
  chatId: string;
  /** Prior turns + the new user turn (text only on the way in). */
  messages: { role: "user" | "assistant"; text: string }[];
  /** Images attached to the latest user turn (base64), sent to Claude as vision input. */
  attachments?: { mediaType: string; data: string }[];
}
