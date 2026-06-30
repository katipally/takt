"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { AskAnswer } from "@prox/shared";
import { chatStore, type CanvasSource, type Node, type Attachment } from "@/lib/chatStore";
import { speech } from "@/lib/speech";
import { useUi } from "@/lib/uiStore";
import { api } from "@/lib/api";

export type { Node, Part, PageImagePart, ArtifactPart, CanvasState, Attachment, BranchInfo } from "@/lib/chatStore";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random() + Date.now()));

export function useWorkbench(productSlug: string) {
  const [chatId, setChatId] = useState(uid);
  const voiceEnabled = useUi((s) => s.voiceEnabled);
  const setVoiceEnabled = useUi((s) => s.setVoiceEnabled);
  const voiceRef = useRef(voiceEnabled);
  voiceRef.current = voiceEnabled;

  const session = useSyncExternalStore(
    useCallback((cb) => chatStore.subscribe(chatId, cb), [chatId]),
    () => chatStore.getSession(chatId, productSlug),
    () => chatStore.getSession(chatId, productSlug),
  );

  const onFinal = useCallback((t: string) => { if (voiceRef.current) speech.speak("auto", t); }, []);

  const send = useCallback((text: string, attachments?: Attachment[]) => chatStore.send(chatId, productSlug, text, attachments, onFinal), [chatId, productSlug, onFinal]);
  const stop = useCallback(() => chatStore.stop(chatId), [chatId]);
  const regenerate = useCallback(() => chatStore.regenerate(chatId, productSlug, onFinal), [chatId, productSlug, onFinal]);
  const editUser = useCallback((node: Node, text: string) => chatStore.editUser(chatId, productSlug, node, text, onFinal), [chatId, productSlug, onFinal]);
  const switchBranch = useCallback((node: Node, dir: -1 | 1) => chatStore.switchBranch(chatId, node, dir), [chatId]);
  const branchInfo = useCallback((node: Node) => chatStore.branchInfo(session, node), [session]);

  const newChat = useCallback(() => { const id = uid(); chatStore.reset(id, productSlug); setChatId(id); }, [productSlug]);
  const loadChat = useCallback(async (id: string) => { setChatId(id); await chatStore.load(id); }, []);

  const openSource = useCallback((s: CanvasSource) => chatStore.openSource(chatId, s), [chatId]);
  const closeSource = useCallback(() => chatStore.closeSource(chatId), [chatId]);
  const submitAsk = useCallback((answers: AskAnswer[]) => chatStore.submitAsk(chatId, answers), [chatId]);
  const cancelAsk = useCallback(() => chatStore.cancelAsk(chatId), [chatId]);
  const openArtifact = useCallback((artifactId: string) => chatStore.openArtifact(chatId, artifactId), [chatId]);
  const closeCanvas = useCallback(() => chatStore.closeCanvas(chatId), [chatId]);
  const toggleCanvas = useCallback(() => chatStore.toggleCanvas(chatId), [chatId]);
  const openCitation = useCallback(async (page: number, manual?: string) => {
    try {
      const r = await api.page(productSlug, page, manual);
      chatStore.openSource(chatId, { url: r.url, page: r.page, manualKind: r.manualKind, manualTitle: r.manualTitle, caption: r.caption });
    } catch { /* page not found */ }
  }, [productSlug, chatId]);

  return {
    chatId, messages: chatStore.activePath(session), isStreaming: session.streaming, canvas: session.canvas, source: session.source, ask: session.ask, usage: session.usage,
    voiceEnabled, setVoiceEnabled,
    send, stop, regenerate, editUser, switchBranch, branchInfo, newChat, loadChat,
    openSource, closeSource, openArtifact, closeCanvas, toggleCanvas, openCitation, submitAsk, cancelAsk,
  };
}
