import type { ChatRequest, AskQuestion, AskAnswer } from "@prox/shared";
import { streamChat } from "./sse-client";
import { api } from "./api";

// A background, multi-session chat store backed by a conversation TREE. Editing a
// user message or regenerating an answer creates a sibling branch instead of
// destroying history; the UI renders the active path and offers ‹ k/n › nav at
// any branch point. Streams keep running per chatId even when another chat is
// viewed — switching never cancels an in-flight answer.

export interface PageImagePart { id: string; kind: "page_image"; citationId: string; url: string; page: number; manualKind: string; manualTitle?: string; caption?: string | null; }
export interface ArtifactPart { id: string; kind: "artifact"; artifactId: string; title: string; artifactKind: "react" | "html"; groupKey: string; version: number; }
export interface ReasoningPart { id: string; kind: "reasoning"; text: string; }
export interface ToolPart { id: string; kind: "tool"; tool: string; summary?: string; detail?: string; status: "running" | "done"; }
export interface TextPart { id: string; kind: "text"; text: string; }
export type Part = ReasoningPart | ToolPart | TextPart | PageImagePart | ArtifactPart;

export interface Attachment { id: string; mediaType: string; dataUrl: string; }

export type Node =
  | { id: string; parentId: string | null; role: "user"; text: string; attachments?: Attachment[] }
  | { id: string; parentId: string | null; role: "assistant"; parts: Part[]; streaming: boolean; status?: string | null };

export interface CanvasSource { url: string; page: number; manualKind: string; manualTitle?: string; caption?: string | null; }
// The right-hand canvas holds artifacts only. Manual pages (sources) open in a
// modal instead — see `Session.source` and the SourceModal.
export interface CanvasState { open: boolean; artifactId?: string }

export interface Usage { contextTokens: number; outputTokens: number; costUsd: number; }

export interface Session {
  chatId: string; productSlug: string;
  nodes: Record<string, Node>;
  children: Record<string, string[]>; // parentKey -> ordered child ids
  active: Record<string, string>;     // parentKey -> selected child id
  streaming: boolean;
  canvas: CanvasState;
  source?: CanvasSource; // manual page open in the source modal (null/undefined = closed)
  ask?: AskState;        // ask_user questions awaiting answers (undefined = none open)
  usage: Usage;
  abort?: AbortController;
}

export interface AskState { askId: string; questions: AskQuestion[] }

export interface BranchInfo { index: number; total: number; }

const ROOT = "__root__";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random() + Date.now()));
const keyOf = (parentId: string | null) => parentId ?? ROOT;
const blank = (chatId: string, productSlug: string): Session => ({
  chatId, productSlug, nodes: {}, children: {}, active: {}, streaming: false,
  canvas: { open: false }, usage: { contextTokens: 0, outputTokens: 0, costUsd: 0 },
});

const sessions = new Map<string, Session>();
const perChat = new Map<string, Set<() => void>>();
const notify = (chatId: string) => perChat.get(chatId)?.forEach((l) => l());

export function getSession(chatId: string, productSlug = ""): Session {
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

// ── streaming ───────────────────────────────────────────────────────────────
async function runStream(chatId: string, productSlug: string, userNodeId: string, attachments: Attachment[] | undefined, onFinalText?: (t: string) => void) {
  const assistantId = uid();
  const abort = new AbortController();
  update(chatId, (s) => {
    const withNode = addNode(s, { id: assistantId, parentId: userNodeId, role: "assistant", parts: [], streaming: true });
    return { ...withNode, productSlug, streaming: true, abort };
  });

  const messages = ancestryText(getSession(chatId), userNodeId);
  const req: ChatRequest = {
    productSlug, chatId, messages,
    attachments: attachments?.map((a) => ({ mediaType: a.mediaType, data: a.dataUrl.split(",")[1] ?? "" })),
  };

  try {
    await streamChat(req, (e) => {
      if (e.type === "text_delta") update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "text", e.text)));
      else if (e.type === "reasoning_delta") update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "reasoning", e.text)));
      else if (e.type === "status") update(chatId, (s) => setStatus(s, assistantId, e.text));
      else if (e.type === "tool_start") update(chatId, (s) => setStatus(patchAssistant(s, assistantId, (p) => [...p, { id: e.id, kind: "tool", tool: e.tool, summary: e.summary, status: "running" }]), assistantId, null));
      else if (e.type === "tool_done") update(chatId, (s) => patchAssistant(s, assistantId, (p) => p.map((q) => (q.kind === "tool" && q.id === e.id ? { ...q, status: "done", detail: e.detail } : q))));
      // Sources just appear in the answer footer — no auto-open. The user opens
      // the page in a modal by clicking it.
      else if (e.type === "page_image") update(chatId, (s) =>
        patchAssistant(s, assistantId, (p) => [...p, { id: uid(), kind: "page_image", citationId: e.citationId, url: e.url, page: e.page, manualKind: e.manualKind, manualTitle: e.manualTitle, caption: e.caption }]),
      );
      else if (e.type === "artifact") update(chatId, (s) => {
        const withPart = patchAssistant(s, assistantId, (p) => [...p, { id: uid(), kind: "artifact", artifactId: e.artifactId, title: e.title, artifactKind: e.kind, groupKey: e.groupKey, version: e.version }]);
        return { ...setStatus(withPart, assistantId, null), canvas: { open: true, artifactId: e.artifactId } };
      });
      else if (e.type === "ask_user") update(chatId, (s) => ({ ...s, ask: { askId: e.askId, questions: e.questions } }));
      else if (e.type === "usage") update(chatId, (s) => ({ ...s, usage: { contextTokens: e.contextTokens || s.usage.contextTokens, outputTokens: s.usage.outputTokens + e.outputTokens, costUsd: s.usage.costUsd + e.costUsd } }));
      else if (e.type === "error") update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "text", `\n\n_${e.message}_`)));
    }, abort.signal);
  } catch (err) {
    update(chatId, (s) => patchAssistant(s, assistantId, (p) => appendText(p, "text", `\n\n_Connection error: ${String(err)}_`)));
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
  openArtifact(chatId: string, artifactId: string) { update(chatId, (s) => ({ ...s, canvas: { open: true, artifactId } })); },
  closeCanvas(chatId: string) { update(chatId, (s) => ({ ...s, canvas: { ...s.canvas, open: false } })); },
  toggleCanvas(chatId: string) { update(chatId, (s) => ({ ...s, canvas: { ...s.canvas, open: !s.canvas.open } })); },

  stop(chatId: string) { getSession(chatId).abort?.abort(); update(chatId, (s) => ({ ...s, streaming: false })); },
  reset(chatId: string, productSlug: string) { sessions.set(chatId, blank(chatId, productSlug)); notify(chatId); },

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

  async send(chatId: string, productSlug: string, text: string, attachments: Attachment[] | undefined, onFinalText?: (t: string) => void) {
    const s = getSession(chatId, productSlug);
    if (s.streaming || !text.trim()) return;
    const path = activePath(s);
    const parentId = path.length ? path[path.length - 1]!.id : null;
    const userId = uid();
    update(chatId, (x) => ({ ...addNode(x, { id: userId, parentId, role: "user", text: text.trim(), attachments }), productSlug }));
    await runStream(chatId, productSlug, userId, attachments, onFinalText);
  },

  async editUser(chatId: string, productSlug: string, node: Node, text: string, onFinalText?: (t: string) => void) {
    if (node.role !== "user") return;
    const userId = uid();
    update(chatId, (x) => addNode(x, { id: userId, parentId: node.parentId, role: "user", text: text.trim(), attachments: node.attachments }));
    await runStream(chatId, productSlug, userId, node.attachments, onFinalText);
  },

  async regenerate(chatId: string, productSlug: string, onFinalText?: (t: string) => void) {
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
            else if (b.type === "page_image") parts.push({ id: uid(), kind: "page_image", citationId: b.citationId, url: b.url, page: b.page, manualKind: b.manualKind, caption: b.caption });
            else if (b.type === "artifact") parts.push({ id: uid(), kind: "artifact", artifactId: b.artifactId, title: b.title, artifactKind: b.kind, groupKey: b.groupKey ?? b.artifactId, version: b.version ?? 1 });
          }
          next = addNode(next, { id, parentId, role: "assistant", parts, streaming: false });
        }
        parentId = id;
      }
      return next;
    });
  },
};
