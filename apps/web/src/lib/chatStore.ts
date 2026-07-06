import type { ChatRequest, AskQuestion, AskAnswer, UISurface } from "@takt/shared";
import { streamChat } from "./sse-client";
import { api } from "./api";

// A background, multi-session chat store backed by a conversation TREE. Editing a
// user message or regenerating an answer creates a sibling branch instead of
// destroying history; the UI renders the active path and offers ‹ k/n › nav at
// any branch point. Streams keep running per chatId even when another chat is
// viewed — switching never cancels an in-flight answer.

export interface PageImagePart { id: string; kind: "page_image"; citationId: string; url: string; page: number; manualKind: string; manualTitle?: string; caption?: string | null; productSlug?: string | null; productName?: string | null; }
export interface ReasoningPart { id: string; kind: "reasoning"; text: string; }
export interface ToolPart { id: string; kind: "tool"; tool: string; summary?: string; detail?: string; status: "running" | "done"; lane?: "main" | "build"; }
export interface TodoItem { text: string; done: boolean; }
export interface TextPart { id: string; kind: "text"; text: string; }
export interface AskPart { id: string; kind: "ask"; askId: string; questions: AskQuestion[]; answers?: AskAnswer[]; cancelled?: boolean; }
export interface UIPart { id: string; kind: "ui"; partId: string; surface: UISurface; }
export type Part = ReasoningPart | ToolPart | TextPart | PageImagePart | AskPart | UIPart;

// Parts that render on the STAGE (the rendered answer) vs. the PROCESS RAIL
// (the "how" — thinking + tool calls). page_image + citations ride the stage.
export const STAGE_PART_KINDS = new Set(["text", "ui", "page_image", "ask"]);
export const RAIL_PART_KINDS = new Set(["reasoning", "tool"]);

export interface Attachment { id: string; mediaType: string; dataUrl: string; }

export type Node =
  | { id: string; parentId: string | null; role: "user"; text: string; attachments?: Attachment[]; live?: boolean }
  | { id: string; parentId: string | null; role: "assistant"; parts: Part[]; streaming: boolean; status?: string | null };

export interface CanvasSource { url: string; page: number; manualKind: string; manualTitle?: string; caption?: string | null; productSlug?: string | null; productName?: string | null; }

export interface Usage { contextTokens: number; outputTokens: number; costUsd: number; }

export interface Session {
  chatId: string; productSlug: string | null;
  nodes: Record<string, Node>;
  children: Record<string, string[]>; // parentKey -> ordered child ids
  active: Record<string, string>;     // parentKey -> selected child id
  streaming: boolean;
  source?: CanvasSource; // manual page open in the source modal (null/undefined = closed)
  ask?: AskState;        // ask_user questions awaiting answers (undefined = none open)
  todos?: TodoItem[];    // the current turn's working checklist (status bar)
  usage: Usage;
  abort?: AbortController;
}

export interface AskState { askId: string; questions: AskQuestion[] }

export interface BranchInfo { index: number; total: number; }

const ROOT = "__root__";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random() + Date.now()));
const keyOf = (parentId: string | null) => parentId ?? ROOT;
const blank = (chatId: string, productSlug: string | null): Session => ({
  chatId, productSlug, nodes: {}, children: {}, active: {}, streaming: false,
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

// ── tree helpers ────────────────────────────────────────────────────────────
export function activePath(s: Session): Node[] {
  const out: Node[] = [];
  let key = ROOT;
  for (;;) {
    const kids = s.children[key];
    if (!kids || !kids.length) break;
    const sel = s.active[key] ?? kids[kids.length - 1]!; // default to newest branch
    const node = s.nodes[sel];
    if (!node) break;
    out.push(node);
    key = sel;
  }
  return out;
}
function ancestryText(s: Session, nodeId: string): { role: "user" | "assistant"; text: string }[] {
  const chain: Node[] = [];
  let id: string | null = nodeId;
  while (id) { const n: Node | undefined = s.nodes[id]; if (!n) break; chain.unshift(n); id = n.parentId; }
  return chain.map((n) => ({
    role: n.role,
    text: n.role === "user" ? n.text : n.parts.filter((p) => p.kind === "text").map((p) => (p as TextPart).text).join(""),
  })).filter((m) => m.text);
}
export function branchInfo(s: Session, node: Node): BranchInfo | null {
  const kids = s.children[keyOf(node.parentId)] ?? [];
  if (kids.length < 2) return null;
  return { index: kids.indexOf(node.id), total: kids.length };
}

function addNode(s: Session, node: Node): Session {
  const k = keyOf(node.parentId);
  const children = { ...s.children, [k]: [...(s.children[k] ?? []), node.id] };
  const active = { ...s.active, [k]: node.id };
  return { ...s, nodes: { ...s.nodes, [node.id]: node }, children, active };
}
function patchAssistant(s: Session, id: string, fn: (parts: Part[]) => Part[]): Session {
  const n = s.nodes[id];
  if (!n || n.role !== "assistant") return s;
  return { ...s, nodes: { ...s.nodes, [id]: { ...n, parts: fn(n.parts.slice()) } } };
}
function setStatus(s: Session, id: string, status: string | null): Session {
  const n = s.nodes[id];
  if (!n || n.role !== "assistant") return s;
  return { ...s, nodes: { ...s.nodes, [id]: { ...n, status } } };
}
function appendText(parts: Part[], key: "reasoning" | "text", text: string): Part[] {
  const last = parts[parts.length - 1];
  if (last && last.kind === key) { parts[parts.length - 1] = { ...last, text: (last as TextPart).text + text }; return parts; }
  parts.push({ id: uid(), kind: key, text } as Part);
  return parts;
}

// Apply one streamed SSE event to an assistant node. Shared by the HTTP chat
// stream (runStream) and the live-mode WebSocket (chatStore.liveApply), so
// artifacts, page images, tool rows, and usage all render identically.
function applyStreamEvent(chatId: string, assistantId: string, e: import("@takt/shared").SseEvent) {
  if (e.type === "text_delta") update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "text", e.text)));
  else if (e.type === "reasoning_delta") update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "reasoning", e.text)));
  else if (e.type === "status") update(chatId, (s) => setStatus(s, assistantId, e.text));
  else if (e.type === "tool_start") update(chatId, (s) => setStatus(patchAssistant(s, assistantId, (p) => [...p, { id: e.id, kind: "tool", tool: e.tool, summary: e.summary, status: "running", lane: e.lane ?? "main" }]), assistantId, null));
  else if (e.type === "todos") update(chatId, (s) => ({ ...s, todos: e.items }));
  else if (e.type === "tool_done") update(chatId, (s) => patchAssistant(s, assistantId, (p) => p.map((q) => (q.kind === "tool" && q.id === e.id ? { ...q, status: "done", detail: e.detail } : q))));
  else if (e.type === "page_image") update(chatId, (s) =>
    patchAssistant(s, assistantId, (p) => [...p, { id: uid(), kind: "page_image", citationId: e.citationId, url: e.url, page: e.page, manualKind: e.manualKind, manualTitle: e.manualTitle, caption: e.caption, productSlug: e.productSlug ?? null, productName: e.productName ?? null }]),
  );
  else if (e.type === "ui_surface") update(chatId, (s) => {
    // Replace a surface with the same partId (re-emit / new version), else append.
    const withPart = patchAssistant(s, assistantId, (p) => {
      const i = p.findIndex((q) => q.kind === "ui" && q.partId === e.partId);
      const part: UIPart = { id: uid(), kind: "ui", partId: e.partId, surface: e.surface };
      if (i >= 0) { const next = p.slice(); next[i] = part; return next; }
      return [...p, part];
    });
    return setStatus(withPart, assistantId, null);
  });
  else if (e.type === "ui_action_result") { /* client ack only — no state change */ }
  else if (e.type === "ask_user") update(chatId, (s) => {
    const withPart = patchAssistant(s, assistantId, (p) =>
      p.some((q) => q.kind === "ask" && q.askId === e.askId) ? p : [...p, { id: uid(), kind: "ask", askId: e.askId, questions: e.questions }]);
    return { ...withPart, ask: { askId: e.askId, questions: e.questions } };
  });
  else if (e.type === "ask_answer") update(chatId, (s) => patchAssistant(s, assistantId, (p) =>
    p.map((q) => (q.kind === "ask" && q.askId === e.askId ? { ...q, answers: e.answers, cancelled: e.cancelled } : q))));
  else if (e.type === "usage") update(chatId, (s) => ({ ...s, usage: { contextTokens: e.contextTokens || s.usage.contextTokens, outputTokens: s.usage.outputTokens + e.outputTokens, costUsd: s.usage.costUsd + e.costUsd } }));
  else if (e.type === "error") update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "text", `\n\n_${e.message}_`)));
}

// ── streaming ───────────────────────────────────────────────────────────────
async function runStream(chatId: string, productSlug: string | null, userNodeId: string, attachments: Attachment[] | undefined, onFinalText?: (t: string) => void) {
  const assistantId = uid();
  const abort = new AbortController();
  update(chatId, (s) => {
    const withNode = addNode(s, { id: assistantId, parentId: userNodeId, role: "assistant", parts: [], streaming: true });
    return { ...withNode, productSlug, streaming: true, abort, todos: undefined };
  });

  const messages = ancestryText(getSession(chatId), userNodeId);
  const req: ChatRequest = {
    productSlug, chatId, messages,
    attachments: attachments?.map((a) => ({ mediaType: a.mediaType, data: a.dataUrl.split(",")[1] ?? "" })),
  };

  try {
    await streamChat(req, (e) => applyStreamEvent(chatId, assistantId, e), abort.signal);
  } catch (err) {
    // User pressed Stop → clean stop, keep the partial reply (also persisted
    // server-side). Only surface genuine network errors.
    if (!abort.signal.aborted) update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "text", `\n\n_Connection error: ${String(err)}_`)));
  } finally {
    let finalText = "";
    update(chatId, (s) => {
      const n = s.nodes[assistantId];
      if (n && n.role === "assistant") finalText = n.parts.filter((p) => p.kind === "text").map((p) => (p as TextPart).text).join("");
      return { ...s, streaming: false, abort: undefined, nodes: n && n.role === "assistant" ? { ...s.nodes, [assistantId]: { ...n, streaming: false, status: null } } : s.nodes };
    });
    if (finalText) onFinalText?.(finalText);
  }
}

export const chatStore = {
  getSession, subscribe, activePath, branchInfo,

  // ── live mode ──────────────────────────────────────────────────────────────
  // The live WebSocket drives turns instead of runStream. We still create the
  // user + assistant nodes and reuse applyStreamEvent, so a live conversation
  // renders in the normal transcript and its artifacts land on the Canvas.
  liveUserTurn(chatId: string, productSlug: string | null, text: string): string {
    const s = getSession(chatId, productSlug);
    const path = activePath(s);
    const parentId = path.length ? path[path.length - 1]!.id : null;
    const userId = uid();
    update(chatId, (x) => ({ ...addNode(x, { id: userId, parentId, role: "user", text, live: true }), productSlug }));
    const assistantId = uid();
    update(chatId, (x) => ({ ...addNode(x, { id: assistantId, parentId: userId, role: "assistant", parts: [], streaming: true }), streaming: true }));
    return assistantId;
  },
  liveApply(chatId: string, assistantId: string, e: import("@takt/shared").SseEvent) {
    if (e.type === "done") return;
    applyStreamEvent(chatId, assistantId, e);
  },
  liveFinish(chatId: string, assistantId: string) {
    update(chatId, (s) => {
      const n = s.nodes[assistantId];
      return { ...s, streaming: false, nodes: n && n.role === "assistant" ? { ...s.nodes, [assistantId]: { ...n, streaming: false, status: null } } : s.nodes };
    });
  },

  // Answering ask_user is out-of-band — it resolves the awaiting tool so the
  // SAME open stream resumes; it is NOT a new chat turn.
  submitAsk(chatId: string, answers: AskAnswer[]) {
    const ask = getSession(chatId).ask;
    if (!ask) return;
    void api.answerAsk({ askId: ask.askId, answers }).catch(() => {});
    update(chatId, (s) => ({ ...s, ask: undefined }));
  },
  cancelAsk(chatId: string) {
    const ask = getSession(chatId).ask;
    if (!ask) return;
    void api.answerAsk({ askId: ask.askId, cancelled: true }).catch(() => {});
    update(chatId, (s) => ({ ...s, ask: undefined }));
  },

  openSource(chatId: string, source: CanvasSource) { update(chatId, (s) => ({ ...s, source })); },
  closeSource(chatId: string) { update(chatId, (s) => ({ ...s, source: undefined })); },
  stop(chatId: string) { getSession(chatId).abort?.abort(); update(chatId, (s) => ({ ...s, streaming: false })); },
  reset(chatId: string, productSlug: string | null) { sessions.set(chatId, blank(chatId, productSlug)); notify(chatId); },

  // Switch which sibling branch is active at a node's level.
  switchBranch(chatId: string, node: Node, dir: -1 | 1) {
    update(chatId, (s) => {
      const k = keyOf(node.parentId);
      const kids = s.children[k] ?? [];
      const i = kids.indexOf(node.id);
      const next = kids[(i + dir + kids.length) % kids.length];
      return next ? { ...s, active: { ...s.active, [k]: next } } : s;
    });
  },

  async send(chatId: string, productSlug: string | null, text: string, attachments: Attachment[] | undefined, onFinalText?: (t: string) => void) {
    const s = getSession(chatId, productSlug);
    if (s.streaming || !text.trim()) return;
    const path = activePath(s);
    const parentId = path.length ? path[path.length - 1]!.id : null;
    const userId = uid();
    update(chatId, (x) => ({ ...addNode(x, { id: userId, parentId, role: "user", text: text.trim(), attachments }), productSlug }));
    await runStream(chatId, productSlug, userId, attachments, onFinalText);
  },

  async editUser(chatId: string, productSlug: string | null, node: Node, text: string, onFinalText?: (t: string) => void) {
    if (node.role !== "user") return;
    const userId = uid();
    update(chatId, (x) => addNode(x, { id: userId, parentId: node.parentId, role: "user", text: text.trim(), attachments: node.attachments }));
    await runStream(chatId, productSlug, userId, node.attachments, onFinalText);
  },

  async regenerate(chatId: string, productSlug: string | null, onFinalText?: (t: string) => void) {
    const s = getSession(chatId);
    if (s.streaming) return;
    const path = activePath(s);
    const lastAssistant = [...path].reverse().find((n) => n.role === "assistant");
    if (!lastAssistant || lastAssistant.parentId === null) return;
    await runStream(chatId, productSlug, lastAssistant.parentId, undefined, onFinalText);
  },

  async load(chatId: string) {
    const msgs = await api.messages(chatId);
    update(chatId, (s) => {
      let next = blank(chatId, s.productSlug);
      let parentId: string | null = null;
      for (const m of msgs) {
        const id = m.id;
        if (m.role === "user") {
          next = addNode(next, { id, parentId, role: "user", text: m.content.filter((b) => b.type === "text").map((b: any) => b.text).join("") });
        } else {
          const parts: Part[] = [];
          for (const b of m.content) {
            if (b.type === "text" && b.text) parts.push({ id: uid(), kind: "text", text: b.text });
            else if (b.type === "reasoning" && b.text) parts.push({ id: uid(), kind: "reasoning", text: b.text });
            else if (b.type === "tool") parts.push({ id: uid(), kind: "tool", tool: b.tool, summary: b.summary, detail: b.detail, status: "done" });
            else if (b.type === "page_image") parts.push({ id: uid(), kind: "page_image", citationId: b.citationId, url: b.url, page: b.page, manualKind: b.manualKind, manualTitle: b.manualTitle ?? undefined, caption: b.caption, productSlug: b.productSlug ?? null, productName: b.productName ?? null });
            else if (b.type === "ui") parts.push({ id: uid(), kind: "ui", partId: b.partId, surface: b.surface });
            else if (b.type === "ask_user") parts.push({ id: uid(), kind: "ask", askId: b.askId, questions: b.questions, answers: b.answers, cancelled: b.cancelled });
          }
          next = addNode(next, { id, parentId, role: "assistant", parts, streaming: false });
        }
        parentId = id;
      }
      return next;
    });
  },
};
