import type { ChatRequest, AskQuestion, AskAnswer, SseEvent } from "@takt/shared";
import { streamChat } from "./sse-client";
import { api } from "./api";
import { useUi } from "./uiStore";

// A background, multi-session chat store. Conversation is a LINEAR list of nodes
// (user / assistant); editing/branching was removed. Streams keep running per
// chatId even when another chat is viewed — switching never cancels an answer.

export interface SourcePart { id: string; kind: "source"; citationId: string; url: string; page: number; manualKind: string; manualTitle?: string; caption?: string | null; productSlug?: string | null; productName?: string | null; }
export interface ReasoningPart { id: string; kind: "reasoning"; text: string; }
export interface ToolPart { id: string; kind: "tool"; tool: string; summary?: string; detail?: string; status: "running" | "done"; lane?: "main" | "build"; }
export interface TodoItem { text: string; done: boolean; }
export interface TextPart { id: string; kind: "text"; text: string; }
export interface AskPart { id: string; kind: "ask"; askId: string; questions: AskQuestion[]; answers?: AskAnswer[]; cancelled?: boolean; }
export interface CanvasPart { id: string; kind: "canvas"; canvasId: string; title?: string; html: string; specCheck?: { checked: number; flagged: number }; }
export type Part = ReasoningPart | ToolPart | TextPart | SourcePart | AskPart | CanvasPart;

// The CANVAS renders ONLY the streamed HTML canvas — a polished final product,
// never the conversation. Everything else (prose reply, reasoning, tool calls,
// source page-images) renders in the CHAT panel. `ask` is a modal.
export const CANVAS_PART_KINDS = new Set(["canvas"]);
export const CHAT_PART_KINDS = new Set(["text", "reasoning", "tool", "source"]);

export interface Attachment { id: string; mediaType: string; dataUrl: string; }

export type Node =
  | { id: string; role: "user"; text: string; attachments?: Attachment[]; live?: boolean }
  | { id: string; role: "assistant"; parts: Part[]; streaming: boolean; status?: string | null };

export interface CanvasSource { url: string; page: number; manualKind: string; manualTitle?: string; caption?: string | null; productSlug?: string | null; productName?: string | null; }
export interface Usage { contextTokens: number; outputTokens: number; costUsd: number; }
export interface AskState { askId: string; questions: AskQuestion[] }

export interface Session {
  chatId: string; productSlug: string | null;
  messages: Node[];
  streaming: boolean;
  source?: CanvasSource; // manual page open in the source modal
  ask?: AskState;
  todos?: TodoItem[];
  usage: Usage;
  abort?: AbortController;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random() + Date.now()));
const blank = (chatId: string, productSlug: string | null): Session => ({
  chatId, productSlug, messages: [], streaming: false,
  usage: { contextTokens: 0, outputTokens: 0, costUsd: 0 },
});

const sessions = new Map<string, Session>();
const perChat = new Map<string, Set<() => void>>();
const notify = (chatId: string) => perChat.get(chatId)?.forEach((l) => l());

export function getSession(chatId: string, productSlug: string | null = null): Session {
  let s = sessions.get(chatId);
  if (!s) { s = blank(chatId, productSlug); sessions.set(chatId, s); }
  return s;
}
export function subscribe(chatId: string, cb: () => void): () => void {
  let set = perChat.get(chatId);
  if (!set) { set = new Set(); perChat.set(chatId, set); }
  set.add(cb);
  return () => set!.delete(cb);
}
function update(chatId: string, fn: (s: Session) => Session) {
  sessions.set(chatId, fn(getSession(chatId)));
  notify(chatId);
}

/** The ordered conversation. (Kept for consumers that used the old tree path.) */
export function activePath(s: Session): Node[] { return s.messages; }

function patchAssistant(s: Session, id: string, fn: (parts: Part[]) => Part[]): Session {
  const messages = s.messages.map((n) => (n.id === id && n.role === "assistant" ? { ...n, parts: fn(n.parts.slice()) } : n));
  return { ...s, messages };
}
function setStatus(s: Session, id: string, status: string | null): Session {
  return { ...s, messages: s.messages.map((n) => (n.id === id && n.role === "assistant" ? { ...n, status } : n)) };
}
function appendText(parts: Part[], key: "reasoning" | "text", text: string): Part[] {
  const last = parts[parts.length - 1];
  if (last && last.kind === key) { parts[parts.length - 1] = { ...last, text: (last as TextPart).text + text }; return parts; }
  parts.push({ id: uid(), kind: key, text } as Part);
  return parts;
}
function upsertCanvas(parts: Part[], canvasId: string, patch: (c: CanvasPart) => CanvasPart): Part[] {
  const i = parts.findIndex((p) => p.kind === "canvas" && p.canvasId === canvasId);
  if (i >= 0) { parts[i] = patch(parts[i] as CanvasPart); return parts; }
  parts.push(patch({ id: uid(), kind: "canvas", canvasId, html: "" }));
  return parts;
}

// Apply one streamed SSE event to an assistant node. Shared by the HTTP stream and
// the live-mode WebSocket, so canvas, sources, tool rows, and usage render identically.
function applyStreamEvent(chatId: string, assistantId: string, e: SseEvent) {
  if (e.type === "text_delta") update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "text", e.text)));
  else if (e.type === "reasoning_delta") update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "reasoning", e.text)));
  else if (e.type === "status") update(chatId, (s) => setStatus(s, assistantId, e.text));
  else if (e.type === "tool_start") update(chatId, (s) => setStatus(patchAssistant(s, assistantId, (p) => [...p, { id: e.id, kind: "tool", tool: e.tool, summary: e.summary, status: "running", lane: e.lane ?? "main" }]), assistantId, null));
  else if (e.type === "todos") update(chatId, (s) => ({ ...s, todos: e.items }));
  else if (e.type === "tool_done") update(chatId, (s) => patchAssistant(s, assistantId, (p) => p.map((q) => (q.kind === "tool" && q.id === e.id ? { ...q, status: "done", detail: e.detail } : q))));
  else if (e.type === "source") update(chatId, (s) =>
    patchAssistant(s, assistantId, (p) => [...p, { id: uid(), kind: "source", citationId: e.citationId, url: e.url, page: e.page, manualKind: e.manualKind, manualTitle: e.manualTitle, caption: e.caption, productSlug: e.productSlug ?? null, productName: e.productName ?? null }]),
  );
  else if (e.type === "canvas_start") update(chatId, (s) => setStatus(patchAssistant(s, assistantId, (p) => upsertCanvas(p, e.canvasId, (c) => ({ ...c, title: e.title ?? c.title }))), assistantId, null));
  else if (e.type === "canvas_delta") update(chatId, (s) => patchAssistant(s, assistantId, (p) => upsertCanvas(p, e.canvasId, (c) => ({ ...c, html: e.html }))));
  else if (e.type === "canvas_end") update(chatId, (s) => patchAssistant(s, assistantId, (p) => upsertCanvas(p, e.canvasId, (c) => ({ ...c, html: e.html, title: e.title ?? c.title, specCheck: e.specCheck }))));
  else if (e.type === "canvas_error") update(chatId, (s) => setStatus(patchAssistant(s, assistantId, (p) => p.filter((q) => !(q.kind === "canvas" && q.canvasId === e.canvasId))), assistantId, null));
  else if (e.type === "canvas_highlight") useUi.getState().highlightCanvas(e.target);
  else if (e.type === "action_result") { /* client ack only */ }
  else if (e.type === "ask_user") update(chatId, (s) => {
    const withPart = patchAssistant(s, assistantId, (p) => p.some((q) => q.kind === "ask" && q.askId === e.askId) ? p : [...p, { id: uid(), kind: "ask", askId: e.askId, questions: e.questions }]);
    return { ...withPart, ask: { askId: e.askId, questions: e.questions } };
  });
  else if (e.type === "ask_answer") update(chatId, (s) => patchAssistant(s, assistantId, (p) => p.map((q) => (q.kind === "ask" && q.askId === e.askId ? { ...q, answers: e.answers, cancelled: e.cancelled } : q))));
  else if (e.type === "usage") update(chatId, (s) => ({ ...s, usage: { contextTokens: e.contextTokens || s.usage.contextTokens, outputTokens: s.usage.outputTokens + e.outputTokens, costUsd: s.usage.costUsd + e.costUsd } }));
  else if (e.type === "error") update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "text", `\n\n_${e.message}_`)));
}

function historyText(s: Session): { role: "user" | "assistant"; text: string }[] {
  return s.messages.map((n) => ({
    role: n.role,
    text: n.role === "user" ? n.text : n.parts.filter((p) => p.kind === "text").map((p) => (p as TextPart).text).join(""),
  })).filter((m) => m.text);
}

async function runStream(chatId: string, productSlug: string | null, attachments: Attachment[] | undefined, onFinalText?: (t: string) => void) {
  const assistantId = uid();
  const abort = new AbortController();
  const messages = historyText(getSession(chatId));
  update(chatId, (s) => ({ ...s, messages: [...s.messages, { id: assistantId, role: "assistant", parts: [], streaming: true }], productSlug, streaming: true, abort, todos: undefined }));

  const req: ChatRequest = {
    productSlug, chatId, messages,
    attachments: attachments?.map((a) => ({ mediaType: a.mediaType, data: a.dataUrl.split(",")[1] ?? "" })),
  };
  try {
    await streamChat(req, (e) => applyStreamEvent(chatId, assistantId, e), abort.signal);
  } catch (err) {
    if (!abort.signal.aborted) update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "text", `\n\n_Connection error: ${String(err)}_`)));
  } finally {
    let finalText = "";
    update(chatId, (s) => {
      const messages = s.messages.map((n) => {
        if (n.id !== assistantId || n.role !== "assistant") return n;
        finalText = n.parts.filter((p) => p.kind === "text").map((p) => (p as TextPart).text).join("");
        return { ...n, streaming: false, status: null };
      });
      return { ...s, streaming: false, abort: undefined, messages };
    });
    if (finalText) onFinalText?.(finalText);
  }
}

export const chatStore = {
  getSession, subscribe, activePath,

  // ── live-mode transcript (driven by the /live WebSocket, not HTTP) ──────────
  // A spoken user turn: push the user node (flagged live) + a fresh streaming
  // assistant node; returns the assistant id the live events attach to.
  liveUserTurn(chatId: string, text: string): string {
    const assistantId = uid();
    update(chatId, (s) => ({
      ...s,
      messages: [...s.messages,
        { id: uid(), role: "user", text: text.trim(), live: true },
        { id: assistantId, role: "assistant", parts: [], streaming: true }],
      streaming: true,
    }));
    return assistantId;
  },
  // Voice-synced transcript: REPLACE the spoken text so far (the reveal is paced
  // to the TTS, so the panel never runs ahead of what was actually said).
  liveText(chatId: string, assistantId: string, fullText: string) {
    update(chatId, (s) => patchAssistant(s, assistantId, (p) => {
      const i = p.findIndex((q) => q.kind === "text");
      if (i >= 0) { p[i] = { ...(p[i] as TextPart), text: fullText }; return p; }
      p.push({ id: uid(), kind: "text", text: fullText });
      return p;
    }));
  },
  liveReason(chatId: string, assistantId: string, delta: string) {
    update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "reasoning", delta)));
  },
  // Any other live SSE event (tool_start/tool_done/source/usage…) — same reducer
  // as the HTTP stream so tool chips and sources render identically.
  liveEvent(chatId: string, assistantId: string, e: SseEvent) {
    applyStreamEvent(chatId, assistantId, e);
  },
  liveFinish(chatId: string, assistantId: string) {
    update(chatId, (s) => ({
      ...s,
      streaming: false,
      messages: s.messages.map((n) => (n.id === assistantId && n.role === "assistant" ? { ...n, streaming: false, status: null } : n)),
    }));
  },

  submitAsk(chatId: string, answers: AskAnswer[]) {
    const ask = getSession(chatId).ask; if (!ask) return;
    void api.answerAsk({ askId: ask.askId, answers }).catch(() => {});
    update(chatId, (s) => ({ ...s, ask: undefined }));
  },
  cancelAsk(chatId: string) {
    const ask = getSession(chatId).ask; if (!ask) return;
    void api.answerAsk({ askId: ask.askId, cancelled: true }).catch(() => {});
    update(chatId, (s) => ({ ...s, ask: undefined }));
  },

  openSource(chatId: string, source: CanvasSource) { update(chatId, (s) => ({ ...s, source })); },
  closeSource(chatId: string) { update(chatId, (s) => ({ ...s, source: undefined })); },
  stop(chatId: string) { getSession(chatId).abort?.abort(); update(chatId, (s) => ({ ...s, streaming: false })); },
  reset(chatId: string, productSlug: string | null) { sessions.set(chatId, blank(chatId, productSlug)); notify(chatId); },

  async send(chatId: string, productSlug: string | null, text: string, attachments: Attachment[] | undefined, onFinalText?: (t: string) => void) {
    const s = getSession(chatId, productSlug);
    if (s.streaming || !text.trim()) return;
    update(chatId, (x) => ({ ...x, messages: [...x.messages, { id: uid(), role: "user", text: text.trim(), attachments }], productSlug }));
    await runStream(chatId, productSlug, attachments, onFinalText);
  },

  async regenerate(chatId: string, productSlug: string | null, onFinalText?: (t: string) => void) {
    const s = getSession(chatId);
    if (s.streaming) return;
    // Drop the last assistant turn, re-run from the same history.
    const lastA = [...s.messages].reverse().find((n) => n.role === "assistant");
    if (!lastA) return;
    update(chatId, (x) => ({ ...x, messages: x.messages.filter((n) => n.id !== lastA.id) }));
    await runStream(chatId, productSlug, undefined, onFinalText);
  },

  async load(chatId: string) {
    const msgs = await api.messages(chatId);
    update(chatId, (s) => {
      const messages: Node[] = [];
      for (const m of msgs) {
        if (m.role === "user") {
          messages.push({ id: m.id, role: "user", text: m.content.filter((b) => b.type === "text").map((b: any) => b.text).join(""), live: (m as any).live || undefined });
        } else {
          const parts: Part[] = [];
          for (const b of m.content) {
            if (b.type === "text" && b.text) parts.push({ id: uid(), kind: "text", text: b.text });
            else if (b.type === "reasoning" && b.text) parts.push({ id: uid(), kind: "reasoning", text: b.text });
            else if (b.type === "tool") parts.push({ id: uid(), kind: "tool", tool: b.tool, summary: b.summary, detail: b.detail, status: "done" });
            else if (b.type === "source") parts.push({ id: uid(), kind: "source", citationId: b.citationId, url: b.url, page: b.page, manualKind: b.manualKind, manualTitle: b.manualTitle ?? undefined, caption: b.caption, productSlug: b.productSlug ?? null, productName: b.productName ?? null });
            else if (b.type === "canvas") parts.push({ id: uid(), kind: "canvas", canvasId: b.canvasId, title: b.title, html: b.html, specCheck: b.specCheck });
            else if (b.type === "ask_user") parts.push({ id: uid(), kind: "ask", askId: b.askId, questions: b.questions, answers: b.answers, cancelled: b.cancelled });
          }
          messages.push({ id: m.id, role: "assistant", parts, streaming: false });
        }
      }
      return { ...blank(chatId, s.productSlug), messages };
    });
  },
};
