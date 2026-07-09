"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { AskAnswer } from "@takt/shared";
import { chatStore, type CanvasSource, type Attachment } from "@/lib/chatStore";
import { api } from "@/lib/api";

export type { Node, Part, Attachment } from "@/lib/chatStore";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random() + Date.now()));

export function useWorkbench(productSlug: string | null) {
  const [chatId, setChatId] = useState(uid);

  const session = useSyncExternalStore(
    useCallback((cb) => chatStore.subscribe(chatId, cb), [chatId]),
    () => chatStore.getSession(chatId, productSlug),
    () => chatStore.getSession(chatId, productSlug),
  );

  const send = useCallback((text: string, attachments?: Attachment[]) => chatStore.send(chatId, productSlug, text, attachments), [chatId, productSlug]);
  const stop = useCallback(() => chatStore.stop(chatId), [chatId]);
  const regenerate = useCallback(() => chatStore.regenerate(chatId, productSlug), [chatId, productSlug]);

  const newChat = useCallback(() => { const id = uid(); chatStore.reset(id, productSlug); setChatId(id); }, [productSlug]);
  const loadChat = useCallback(async (id: string) => { setChatId(id); await chatStore.load(id); }, []);

  const openSource = useCallback((s: CanvasSource) => chatStore.openSource(chatId, s), [chatId]);
  const closeSource = useCallback(() => chatStore.closeSource(chatId), [chatId]);
  const submitAsk = useCallback((answers: AskAnswer[]) => chatStore.submitAsk(chatId, answers), [chatId]);
  const cancelAsk = useCallback(() => chatStore.cancelAsk(chatId), [chatId]);
  // `product` overrides the workbench's slug — a cross-product citation (master
  // mode) carries its own product so it opens the right page.
  const openCitation = useCallback(async (page: number, manual?: string, product?: string | null) => {
    const slug = product ?? productSlug;
    if (!slug) return;
    try {
      const r = await api.page(slug, page, manual);
      chatStore.openSource(chatId, { url: r.url, page: r.page, manualKind: r.manualKind, manualTitle: r.manualTitle, caption: r.caption, productSlug: slug });
    } catch { /* page not found */ }
  }, [productSlug, chatId]);

  return {
    chatId, messages: chatStore.activePath(session), isStreaming: session.streaming, source: session.source, ask: session.ask, todos: session.todos, usage: session.usage,
    send, stop, regenerate, newChat, loadChat,
    openSource, closeSource, openCitation, submitAsk, cancelAsk,
  };
}
