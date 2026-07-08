"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Sidebar } from "./Sidebar";
import { ContextMeter } from "./ContextMeter";
import { ProductSwitcher } from "./ProductSwitcher";
import { Stage } from "@/components/stage/Stage";
import { FloatingComposer } from "@/components/stage/FloatingComposer";
import { StatusBar } from "@/components/stage/StatusBar";
import { ProcessRail } from "@/components/rail/ProcessRail";
import { LiveDock } from "@/components/live/LiveDock";
import { SourceModal } from "@/components/canvas/SourceModal";
import { AskModal } from "@/components/chat/AskModal";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { Wordmark } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { RenderCtx } from "@/components/ui-catalog/ctx";
import type { UIPart } from "@/lib/chatStore";
import { useWorkbench } from "@/hooks/useWorkbench";
import { useUi } from "@/lib/uiStore";
import { useLiveStore } from "@/lib/live/liveStore";
import { STARTERS } from "@/lib/starters";
import { quick } from "@/lib/motion";
import { cn } from "@/lib/cn";

// Turn an interactive submit into a readable follow-up message.
function formatAction(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== "" && v != null);
    if (pairs.length) return pairs.map(([k, v]) => `${k}: ${v}`).join(", ");
  }
  return String(value);
}

export function Workbench({ slug, productName, starters }: { slug: string | null; productName?: string; starters?: string[] }) {
  const wb = useWorkbench(slug);
  const isMaster = !slug;
  const basePath = slug ? `/${slug}` : "/master";
  const heading = productName ?? (isMaster ? "Takt" : "");
  const empty = wb.messages.length === 0;
  const prompts = starters?.length ? starters : STARTERS;
  const { sidebarCollapsed, toggleSidebar, railOpen, toggleRail, liveOpen, setLiveOpen, railWidth, setRailWidth } = useUi();
  const liveActive = useLiveStore((s) => s.active);
  const reduce = useReducedMotion();
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile sidebar
  const [sheetOpen, setSheetOpen] = useState(false);    // mobile activity sheet
  const [viewUserId, setViewUserId] = useState<string | null>(null); // which turn on stage (null = latest)
  const [resizing, setResizing] = useState(false);
  const [handleHover, setHandleHover] = useState(false);
  const widthTransition = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 40 };
  // Rail width: user-draggable when open, collapsed to a slim strip when closed.
  // Canvas is flex-1 so it reflows automatically as this changes. While dragging we
  // kill the width spring (instant follow) and overlay the page so pointer moves
  // aren't swallowed by the canvas iframe.
  const railW = railOpen ? railWidth : 44;
  const onResizeMove = (e: React.PointerEvent) => { setRailWidth(Math.max(300, Math.min(640, window.innerWidth - e.clientX - 8))); };

  // A fresh send/edit/regenerate snaps the stage back to the latest answer.
  const follow = () => setViewUserId(null);
  const send = (t: string, a?: Parameters<typeof wb.send>[1]) => { follow(); wb.send(t, a); };

  // Fold the active path into turns (user prompt → its answer).
  const turns = useMemo(() => {
    const out: { userId: string; userText: string; assistant?: Extract<typeof wb.messages[number], { role: "assistant" }> }[] = [];
    for (const n of wb.messages) {
      if (n.role === "user") out.push({ userId: n.id, userText: n.text });
      else if (out.length) out[out.length - 1]!.assistant = n;
    }
    return out;
  }, [wb.messages]);
  const latest = turns[turns.length - 1];
  const view = (viewUserId ? turns.find((t) => t.userId === viewUserId) : null) ?? latest;
  const isLatest = !view || view === latest;

  // The canvas shows ONLY artifacts (UI surfaces). While the agent is composing
  // one (status is "Designing…") show a skeleton; otherwise show this turn's
  // artifact, and if it has none, hold the most recent artifact in the thread so
  // the canvas doesn't blank on a conversational follow-up.
  const viewSurfaces: UIPart[] = view?.assistant?.parts.filter((p): p is UIPart => p.kind === "ui") ?? [];
  // Show the build skeleton while a canvas is being composed AND no surface has
  // landed yet. The ONLY signal is a delegate_build / build-lane tool part: it's
  // durable (stays in the parts array through tool_done until the surface arrives),
  // so `building` is monotonic per turn — false → true (delegate fires) → false
  // (surface lands). Previously we also OR'd in an `isDesigning(status)` check, but
  // `status` is set→null→set churned by every tool_start/ui_surface, which flipped
  // `building` mid-turn and caused the "Working… ↔ skeleton" flicker. In the
  // canvas-first design the main agent never composes UI inline, so that signal was
  // vestigial anyway — every visual now goes through delegate_build.
  const buildPending = (view?.assistant?.parts ?? []).some((p) => p.kind === "tool" && (p.tool === "delegate_build" || p.lane === "build"));
  const building = viewSurfaces.length === 0 && buildPending;
  const canvasSurfaces: UIPart[] = viewSurfaces.length ? viewSurfaces : (() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const s = turns[i]!.assistant?.parts.filter((p): p is UIPart => p.kind === "ui");
      if (s?.length) return s;
    }
    return [];
  })();

  const ctx: RenderCtx = {
    onCitation: (page, slug) => wb.openCitation(page, undefined, slug),
    onSource: (s) => { if (s.url) wb.openSource({ url: s.url, page: s.page ?? 0, manualKind: "other" }); else if (s.page) wb.openCitation(s.page); },
    // A Button/Form/Select submit continues the conversation with the chosen
    // values. The agent commonly re-emits the surface with the same key, so it
    // reads as an in-place update. ponytail: a follow-up turn (works across every
    // provider) rather than mid-turn blocking; only the LATEST answer is armed.
    onAction: (_actionId, value) => send(formatAction(value)),
  };

  // Deep-links: ?chat=<id> loads a conversation; ?q=<text> opens a fresh chat.
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const params = new URLSearchParams(window.location.search);
    const chat = params.get("chat");
    const q = params.get("q");
    if (chat) wb.loadChat(chat);
    else if (q) { wb.send(q); window.history.replaceState(null, "", `${basePath}?chat=${wb.chatId}`); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-dvh w-full gap-1.5 overflow-hidden bg-background p-2">
      {/* Sidebar (chat history) — hidden under md, drawer on mobile. Collapsed = a
          slim transparent "History" strip on the bg (click anywhere to open). */}
      <motion.div initial={false} animate={{ width: sidebarCollapsed ? 44 : 248 }} transition={widthTransition}
        className="relative hidden h-full shrink-0 overflow-hidden md:block">
        {sidebarCollapsed ? (
          <button onClick={toggleSidebar} title="Show history" aria-label="Show history"
            className="group flex h-full w-11 flex-col items-center justify-center gap-3 rounded-2xl text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground">
            <PanelLeftOpen className="size-4 opacity-70 transition group-hover:opacity-100" />
            <span className="[writing-mode:vertical-rl] text-[11px] tracking-wide">History</span>
          </button>
        ) : (
          <div style={{ width: 248 }} className="h-full">
            <Sidebar currentSlug={slug} onNewChat={() => { follow(); wb.newChat(); }} onSelectChat={(id) => { follow(); wb.loadChat(id); }} activeChatId={wb.chatId} />
          </div>
        )}
      </motion.div>

      {/* STAGE — the rendered answer, the star. */}
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        {/* Resize feedback lives ON the canvas's right border — the section's
            overflow-hidden + rounded-2xl clips this bar to the corner shape. */}
        {railOpen && (resizing || handleHover) && (
          <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 z-30 transition-all", resizing ? "w-[3px] bg-accent" : "w-[2px] bg-accent/50")} />
        )}
        {/* Grab zone — absolute on the canvas's right edge so it takes ZERO layout
            width; the rail can sit flush against the canvas (no gutter from a flex handle). */}
        {railOpen && (
          <div onPointerDown={(e) => { e.preventDefault(); setResizing(true); }}
            onPointerEnter={() => setHandleHover(true)} onPointerLeave={() => setHandleHover(false)}
            title="Drag to resize" role="separator" aria-orientation="vertical"
            className="absolute inset-y-0 right-0 z-40 hidden w-2.5 cursor-col-resize md:block" />
        )}
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <button onClick={() => setDrawerOpen(true)} title="Menu" aria-label="Open menu"
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground md:hidden"><PanelLeftOpen className="size-4" /></button>
            {sidebarCollapsed && (
              <span className="hidden items-center gap-1.5 md:flex">
                <button onClick={toggleSidebar} title="Open sidebar" className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"><PanelLeftOpen className="size-4" /></button>
                <Link href="/" title="All products" className="transition hover:opacity-70"><Wordmark size="sm" /></Link>
                <span className="h-4 w-px bg-border" />
              </span>
            )}
            <ProductSwitcher currentSlug={slug} variant="bar" />
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block"><ContextMeter usage={wb.usage} /></div>
            <ThemeToggle />
            <button onClick={() => setSheetOpen(true)} title="Activity" aria-label="Show activity"
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground md:hidden"><PanelRightOpen className="size-4" /></button>
          </div>
        </div>

        {/* The Stage is ALWAYS mounted — even during a live call, so concept
            visuals render live. In live mode it shows visuals only (no transcript).
            The composer stays visible under the setup modal, then MORPHS into the
            voice bar once the call is live (shared layoutId="takt-dock"). */}
        <Stage
          empty={empty && !liveOpen}
          surfaces={canvasSurfaces}
          building={building}
          streaming={!!view?.assistant?.streaming}
          isLatest={isLatest}
          ctx={ctx}
          heading={heading}
          subheading={isMaster
            ? "Ask across all your products at once — or anything else. Answers cite the product and page they come from."
            : "Ask anything — answers are grounded in the manual, cited to the page, and designed when words aren't enough."}
          starters={prompts}
          onStarter={send}
          liveMode={liveOpen}
        />
        {/* Composer shows until the call goes live; it morphs into the voice bar. */}
        {!liveActive && (
          <FloatingComposer onSend={send} onStop={wb.stop} isStreaming={wb.isStreaming}
            voiceEnabled={wb.voiceEnabled} setVoiceEnabled={wb.setVoiceEnabled} onOpenLive={() => setLiveOpen(true)}
            above={!wb.ask && !liveOpen ? <StatusBar node={latest?.assistant} streaming={wb.isStreaming} todos={wb.todos} /> : undefined} />
        )}
        {/* Closing the call just stops live (leak-free teardown in useLiveSession)
            and stays in the SAME chat — the artifact it produced remains on the
            canvas. `follow()` snaps the stage to the latest answer. */}
        {liveOpen && <LiveDock key={wb.chatId} chatId={wb.chatId} productSlug={slug} onExit={() => { setLiveOpen(false); follow(); }} />}

        <AnimatePresence>
          {wb.ask && <AskModal key="ask" ask={wb.ask} onSubmit={wb.submitAsk} onCancel={wb.cancelAsk} />}
        </AnimatePresence>
      </section>

      {/* PROCESS RAIL — collapsed strip by default; hidden under md (sheet there).
          Handle is absolute on the canvas edge (above), so the rail sits flush. */}
      <motion.div initial={false} animate={{ width: railW }} transition={resizing ? { duration: 0 } : widthTransition}
        className="hidden h-full shrink-0 overflow-hidden md:block">
        <div style={{ width: railW }} className="h-full">
          <ProcessRail open={railOpen} onToggle={toggleRail} messages={wb.messages}
            selectedUserId={viewUserId} onSelectTurn={setViewUserId} streaming={wb.isStreaming}
            onRegenerate={() => { follow(); wb.regenerate(); }} onCitation={(page) => wb.openCitation(page)}
            onOpenSource={(s) => wb.openSource({ url: s.url, page: s.page, manualKind: "other" })} />
        </div>
      </motion.div>

      {/* While dragging, a full-page overlay captures pointer moves so the canvas
          iframe doesn't swallow them, and shows the col-resize cursor everywhere. */}
      {resizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none"
          onPointerMove={onResizeMove} onPointerUp={() => setResizing(false)} onPointerLeave={() => setResizing(false)} />
      )}

      {/* Mobile sidebar drawer. */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div key="drawer" className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", stiffness: 380, damping: 40 }}
              className="absolute left-0 top-0 h-full w-[82%] max-w-[320px] border-r border-border bg-background shadow-2xl">
              <Sidebar currentSlug={slug} onNewChat={() => { follow(); wb.newChat(); setDrawerOpen(false); }} onSelectChat={(id) => { follow(); wb.loadChat(id); setDrawerOpen(false); }} activeChatId={wb.chatId} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile activity/history bottom sheet. */}
      <AnimatePresence>
        {sheetOpen && (
          <motion.div key="sheet" className="fixed inset-0 z-50 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setSheetOpen(false)} />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 40 }}
              className="absolute inset-x-0 bottom-0 h-[75%] rounded-t-2xl border-t border-border bg-card p-2 shadow-2xl">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
              <div className="h-[calc(100%-1rem)]">
                <ProcessRail open onToggle={() => setSheetOpen(false)} messages={wb.messages}
                  selectedUserId={viewUserId} onSelectTurn={(id) => { setViewUserId(id); setSheetOpen(false); }} streaming={wb.isStreaming}
                  onRegenerate={() => { follow(); wb.regenerate(); }} onCitation={(page) => wb.openCitation(page)}
                  onOpenSource={(s) => wb.openSource({ url: s.url, page: s.page, manualKind: "other" })} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SourceModal source={wb.source} onClose={wb.closeSource}
        onNavigate={(p) => wb.openCitation(p, wb.source?.manualKind, wb.source?.productSlug)} />
      <SettingsModal />
    </div>
  );
}
