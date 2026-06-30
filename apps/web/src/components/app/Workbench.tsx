"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Boxes, PanelLeftOpen } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ArtifactPart } from "@/lib/chatStore";
import { Sidebar } from "./Sidebar";
import { ContextMeter } from "./ContextMeter";
import { ProductSwitcher } from "./ProductSwitcher";
import { Transcript } from "@/components/chat/Transcript";
import { Composer } from "@/components/chat/Composer";
import { Canvas, ArtifactDock } from "@/components/canvas/Canvas";
import { SourceModal } from "@/components/canvas/SourceModal";
import { AskModal } from "@/components/chat/AskModal";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { Wordmark } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { useWorkbench } from "@/hooks/useWorkbench";
import { useUi } from "@/lib/uiStore";
import { STARTERS } from "@/lib/starters";
import { quick } from "@/lib/motion";
import { cn } from "@/lib/cn";

export function Workbench({ slug, productName, starters }: { slug: string; productName: string; starters?: string[] }) {
  const wb = useWorkbench(slug);
  const empty = wb.messages.length === 0;
  const prompts = starters?.length ? starters : STARTERS;
  const { sidebarWidth, canvasWidth, setSidebarWidth, setCanvasWidth, sidebarCollapsed, toggleSidebar } = useUi();
  const reduce = useReducedMotion();
  const [maximized, setMaximized] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile sidebar (off-canvas under md)
  const closeCanvas = () => { wb.closeCanvas(); setMaximized(false); };
  const panelOpen = wb.canvas.open && !maximized;
  // While dragging a resizer: bypass the width spring so the panel tracks the
  // pointer 1:1 (the spring made it lag), and honor reduced-motion.
  const widthTransition = reduce || resizing ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 40 };

  // On phones the side panel is hidden, so opening an artifact there shows the
  // full-screen overlay instead — the artifact is the deliverable, it must be reachable.
  useEffect(() => {
    if (wb.canvas.open && !maximized && window.matchMedia("(max-width: 767px)").matches) setMaximized(true);
  }, [wb.canvas.open, wb.canvas.artifactId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every artifact generated in this chat (across the visible transcript).
  const artifacts = wb.messages.flatMap((m) =>
    m.role === "assistant" ? m.parts.filter((p): p is ArtifactPart => p.kind === "artifact") : []);

  // Deep-links: ?chat=<id> loads a conversation; ?q=<text> opens a fresh chat
  // with that question asked. Runs ONCE — and we strip ?q from the URL right
  // after sending so a reload (or remount) never re-fires the prompt and spawns
  // duplicate chats. After a ?q send we point the URL at the new chat so a
  // reload restores its history instead.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const params = new URLSearchParams(window.location.search);
    const chat = params.get("chat");
    const q = params.get("q");
    if (chat) {
      wb.loadChat(chat);
    } else if (q) {
      wb.send(q);
      window.history.replaceState(null, "", `/${slug}?chat=${wb.chatId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-dvh w-full gap-2 overflow-hidden bg-background p-2">
      <motion.div
        initial={false}
        animate={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        transition={widthTransition}
        className="relative hidden h-full shrink-0 overflow-hidden md:block">
        <div style={{ width: sidebarWidth }} className="h-full">
          <Sidebar currentSlug={slug} onNewChat={wb.newChat} onSelectChat={wb.loadChat} activeChatId={wb.chatId} />
        </div>
        {!sidebarCollapsed && <Resizer side="right" min={200} max={360} value={sidebarWidth} onChange={setSidebarWidth} onActive={setResizing} />}
      </motion.div>

      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <button onClick={() => setDrawerOpen(true)} title="Menu" aria-label="Open menu"
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground md:hidden">
              <PanelLeftOpen className="size-4" />
            </button>
            {sidebarCollapsed && (
              <span className="hidden items-center gap-1.5 md:flex">
                <button onClick={toggleSidebar} title="Open sidebar" className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
                  <PanelLeftOpen className="size-4" />
                </button>
                <Link href="/" title="All products" className="transition hover:opacity-70"><Wordmark size="sm" /></Link>
                <span className="h-4 w-px bg-border" />
              </span>
            )}
            <ProductSwitcher currentSlug={slug} variant="bar" />
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block"><ContextMeter usage={wb.usage} /></div>
            <ThemeToggle />
            <button onClick={wb.toggleCanvas} title={wb.canvas.open ? "Hide artifacts" : "Show artifacts"}
              className={cn("flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] transition hover:bg-foreground/[0.06]",
                wb.canvas.open ? "text-foreground" : "text-muted-foreground")}>
              <Boxes className="size-3.5" /> Artifacts
              {artifacts.length > 0 && <span className="text-faint">· {artifacts.length}</span>}
            </button>
          </div>
        </div>

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12">
            <div className="w-full max-w-2xl text-center">
              <Wordmark size="lg" className="mb-4 inline-block" />
              <h1 className="text-[22px] font-semibold tracking-tight">{productName}</h1>
              <p className="mt-1.5 text-[13px] text-muted-foreground">Ask anything — answers are grounded in the manual, cited to the page, and drawn when words aren&apos;t enough.</p>
              <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {prompts.map((s) => (
                  <button key={s} onClick={() => wb.send(s)}
                    className="rounded-2xl border border-border bg-surface px-4 py-3 text-left text-[13px] text-foreground transition hover:-translate-y-0.5 hover:border-border-heavy">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <Transcript messages={wb.messages} branchInfo={wb.branchInfo} switchBranch={wb.switchBranch}
            onCitation={wb.openCitation}
            onOpenSource={(b) => wb.openSource({ url: b.url, page: b.page, manualKind: b.manualKind, manualTitle: b.manualTitle, caption: b.caption })}
            onOpenArtifact={(b) => wb.openArtifact(b.artifactId)}
            onRegenerate={wb.regenerate} onEdit={(node, text) => wb.editUser(node, text)} />
        )}
        <Composer onSend={wb.send} onStop={wb.stop} isStreaming={wb.isStreaming}
          voiceEnabled={wb.voiceEnabled} setVoiceEnabled={wb.setVoiceEnabled} />

        {/* Floating artifact switcher — thumbnails over the chat's empty space. */}
        <ArtifactDock artifacts={artifacts} selectedId={wb.canvas.artifactId} panelOpen={wb.canvas.open} onSelect={wb.openArtifact} />

        <AnimatePresence>
          {wb.ask && <AskModal key="ask" ask={wb.ask} onSubmit={wb.submitAsk} onCancel={wb.cancelAsk} />}
        </AnimatePresence>

        {/* Maximized artifact fills the window (overlay scoped above the chat). */}
        <AnimatePresence>
          {wb.canvas.open && maximized && (
            <motion.div key="canvas-max" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}
              className="fixed inset-0 z-50 bg-background p-2">
              <Canvas artifacts={artifacts} selectedId={wb.canvas.artifactId} onSelect={wb.openArtifact}
                onClose={closeCanvas} maximized onToggleMaximize={() => setMaximized(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Artifacts panel — width-collapse spring, matching the sidebar. Stays
          mounted so the iframe doesn't re-spin on every open. Hidden on mobile;
          there the artifact opens as the full-screen overlay above. */}
      <motion.div
        initial={false}
        animate={{ width: panelOpen ? canvasWidth : 0 }}
        transition={widthTransition}
        className="relative hidden h-full shrink-0 overflow-hidden md:block">
        <div style={{ width: canvasWidth }} className="h-full">
          <Canvas artifacts={artifacts} selectedId={wb.canvas.artifactId} onSelect={wb.openArtifact}
            onClose={closeCanvas} maximized={false} onToggleMaximize={() => setMaximized(true)} />
        </div>
        {panelOpen && <Resizer side="left" min={360} max={760} value={canvasWidth} onChange={setCanvasWidth} onActive={setResizing} />}
      </motion.div>

      {/* While resizing, this overlay sits above the artifact iframe so pointer
          events reach the window listeners instead of being swallowed by it. */}
      {resizing && <div className="fixed inset-0 z-[60] cursor-col-resize" />}

      {/* Mobile sidebar drawer (off-canvas; desktop sidebar is hidden under md). */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div key="drawer" className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 380, damping: 40 }}
              className="absolute left-0 top-0 h-full w-[82%] max-w-[320px] border-r border-border bg-background shadow-2xl">
              <Sidebar currentSlug={slug}
                onNewChat={() => { wb.newChat(); setDrawerOpen(false); }}
                onSelectChat={(id) => { wb.loadChat(id); setDrawerOpen(false); }}
                activeChatId={wb.chatId} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SourceModal source={wb.source} onClose={wb.closeSource}
        onNavigate={(p) => wb.openCitation(p, wb.source?.manualKind)} />
      <SettingsModal />
    </div>
  );
}

function Resizer({ side, min, max, value, onChange, onActive }: { side: "left" | "right"; min: number; max: number; value: number; onChange: (w: number) => void; onActive?: (active: boolean) => void }) {
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    onActive?.(true);
    const startX = e.clientX, startW = value;
    const move = (ev: PointerEvent) => {
      const d = ev.clientX - startX;
      const next = side === "left" ? startW - d : startW + d;
      onChange(Math.max(min, Math.min(max, next)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = ""; document.body.style.userSelect = "";
      onActive?.(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  return (
    <div onPointerDown={onPointerDown}
      className={cn("absolute top-0 z-20 h-full w-1.5 cursor-col-resize transition hover:bg-accent/40 active:bg-accent/60", side === "right" ? "-right-0.5" : "left-0")} />
  );
}
