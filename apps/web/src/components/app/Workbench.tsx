"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PanelLeftOpen, PanelRightOpen, History, ChevronLeft, ChevronRight, SquarePen, X } from "lucide-react";
import { encodeSelection, selectionLabel } from "@/lib/selection";
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
  const { sidebarCollapsed, toggleSidebar, railOpen, toggleRail, liveOpen, setLiveOpen, railWidth, setRailWidth, sidebarWidth, setSidebarWidth } = useUi();
  const liveActive = useLiveStore((s) => s.active);
  const reduce = useReducedMotion();
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile sidebar
  const [sheetOpen, setSheetOpen] = useState(false);    // mobile activity sheet
  const [viewUserId, setViewUserId] = useState<string | null>(null); // which turn on stage (null = latest)
  const [resizing, setResizing] = useState(false);           // right rail drag
  const [handleHover, setHandleHover] = useState(false);
  const [resizingSidebar, setResizingSidebar] = useState(false); // left sidebar drag
  const [selection, setSelection] = useState<{ id: string; text: string } | null>(null); // canvas block selected for a surgical edit
  const [vw, setVw] = useState(1400); // viewport width, to auto-collapse rails when narrow
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const widthTransition = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 380, damping: 40 };
  // Both side panels are user-resizable when open and collapse to a slim strip when
  // closed. Canvas is flex-1 so it reflows automatically. While dragging we kill the
  // width spring (instant follow) and overlay the page so pointer moves aren't
  // swallowed by the canvas iframe. Mins are kept low-but-usable so the canvas gets
  // room; collapsed strips are slim (icon + vertical label).
  const RAIL_MIN = 260, RAIL_MAX = 640, SIDEBAR_MIN = 200, SIDEBAR_MAX = 380, STRIP = 34;
  // Auto-collapse to slim strips when the window gets narrow, so the canvas is never
  // crushed. Display-only override — the user's saved open/width preference returns
  // when the window widens (we don't mutate the store). Below md the drawers take over.
  const sidebarShown = !sidebarCollapsed && vw >= 900;
  const railShown = railOpen && vw >= 1120;
  const railW = railShown ? railWidth : STRIP;
  const sidebarW = sidebarShown ? sidebarWidth : STRIP;
  const onResizeMove = (e: React.PointerEvent) => { setRailWidth(Math.max(RAIL_MIN, Math.min(RAIL_MAX, window.innerWidth - e.clientX - 8))); };
  const onSidebarResizeMove = (e: React.PointerEvent) => { setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, e.clientX - 8))); };

  // A fresh send/edit/regenerate snaps the stage back to the latest answer.
  const follow = () => setViewUserId(null);
  const send = (t: string, a?: Parameters<typeof wb.send>[1]) => { follow(); wb.send(t, a); };
  // Composer send: if a canvas block is selected, scope the message to it (the agent
  // reads the data-takt-id and does a surgical edit_canvas on just that block).
  const sendFromComposer = (t: string, a?: Parameters<typeof wb.send>[1]) => {
    if (selection && !a) {
      const scoped = encodeSelection(selection, t);
      setSelection(null);
      send(scoped);
    } else send(t, a);
  };

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

  // The canvas shows ONLY artifacts. This turn's own surfaces (partials included):
  const viewSurfaces: UIPart[] = view?.assistant?.parts.filter((p): p is UIPart => p.kind === "ui") ?? [];
  // Is this turn building a NEW artifact whose surface hasn't landed yet? True while
  // streaming, no surface for THIS turn, and a build signal is present — the
  // build_canvas/delegate tool is pending, or a crop has already been fetched. Drives
  // the calm placeholder (vs. showing the previous, now-stale artifact) until the
  // start_canvas title shell appears.
  const buildPending = (view?.assistant?.parts ?? []).some((p) => p.kind === "tool" && (p.tool === "build_canvas" || p.tool === "delegate_build" || p.lane === "build"));
  const hasBuildCrops = (view?.assistant?.parts ?? []).some((p) => p.kind === "page_image");
  const constructing = !!view?.assistant?.streaming && viewSurfaces.length === 0 && (buildPending || hasBuildCrops);
  const buildStatus = view?.assistant?.status ?? null;
  // Hold the most recent artifact when this turn produced none (so a plain chat
  // follow-up doesn't blank the canvas); the placeholder overrides it while building.
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
    // Clicking a block on the canvas selects it (empty id = cleared).
    onSelect: (sel) => setSelection(sel.id ? sel : null),
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
      {/* Sidebar (chat history) — resizable; hidden under md, drawer on mobile.
          Collapsed = a slim transparent "History" strip (click to open). */}
      <motion.div initial={false} animate={{ width: sidebarW }} transition={resizingSidebar ? { duration: 0 } : widthTransition}
        className="relative hidden h-full shrink-0 overflow-visible md:block">
        {!sidebarShown ? (
          <button onClick={toggleSidebar} title="Show history" aria-label="Show history"
            className="group flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground">
            <History className="size-4 opacity-70 transition group-hover:opacity-100" />
            <span className="[writing-mode:vertical-rl] text-[11px] tracking-wide">History</span>
          </button>
        ) : (
          <div style={{ width: sidebarW }} className="relative h-full overflow-hidden rounded-2xl">
            <Sidebar currentSlug={slug} onNewChat={() => { follow(); wb.newChat(); }} onSelectChat={(id) => { follow(); wb.loadChat(id); }} activeChatId={wb.chatId} />
            {/* Collapse button — centered on the sidebar's right border. */}
            <button onClick={toggleSidebar} title="Collapse history" aria-label="Collapse history"
              className="absolute right-1 top-1/2 z-40 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:text-foreground">
              <ChevronLeft className="size-3.5" />
            </button>
            {/* Drag handle on the right edge (zero layout width). */}
            <div onPointerDown={(e) => { e.preventDefault(); setResizingSidebar(true); }}
              title="Drag to resize" role="separator" aria-orientation="vertical"
              className="absolute inset-y-0 -right-1 z-30 w-2.5 cursor-col-resize" />
          </div>
        )}
      </motion.div>

      {/* STAGE — the rendered answer, the star. */}
      <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        {/* Resize feedback lives ON the canvas's right border — the section's
            overflow-hidden + rounded-2xl clips this bar to the corner shape. */}
        {railShown && (resizing || handleHover) && (
          <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 z-30 transition-all", resizing ? "w-[3px] bg-accent" : "w-[2px] bg-accent/50")} />
        )}
        {/* Grab zone — absolute on the canvas's right edge so it takes ZERO layout
            width; the rail can sit flush against the canvas (no gutter from a flex handle). */}
        {railShown && (
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
          constructing={constructing}
          buildStatus={buildStatus}
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
          <FloatingComposer onSend={sendFromComposer} onStop={wb.stop} isStreaming={wb.isStreaming}
            voiceEnabled={wb.voiceEnabled} setVoiceEnabled={wb.setVoiceEnabled} onOpenLive={() => setLiveOpen(true)}
            above={!wb.ask && !liveOpen ? (
              <div className="flex flex-col gap-1.5">
                {selection && (
                  <div className="flex items-center gap-1.5 self-start rounded-full border border-accent/45 bg-accent-soft/50 py-1 pl-2.5 pr-1.5 text-[12px]">
                    <SquarePen className="size-3.5 shrink-0 text-accent" />
                    <span className="shrink-0 text-muted-foreground">Editing</span>
                    <span className="max-w-[240px] truncate text-foreground">“{selectionLabel(selection)}”</span>
                    <button onClick={() => setSelection(null)} aria-label="Clear selection"
                      className="grid size-4 shrink-0 place-items-center rounded-full text-faint transition hover:bg-foreground/10 hover:text-foreground"><X className="size-3" /></button>
                  </div>
                )}
                <StatusBar node={latest?.assistant} streaming={wb.isStreaming} todos={wb.todos} />
              </div>
            ) : undefined} />
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
        className="relative hidden h-full shrink-0 overflow-visible md:block">
        {/* Collapse button — centered on the rail's left border. */}
        {railShown && (
          <button onClick={toggleRail} title="Collapse chat" aria-label="Collapse chat"
            className="absolute left-1 top-1/2 z-40 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition hover:text-foreground">
            <ChevronRight className="size-3.5" />
          </button>
        )}
        <div style={{ width: railW }} className="h-full overflow-hidden">
          <ProcessRail open={railShown} onToggle={toggleRail} messages={wb.messages}
            selectedUserId={viewUserId} onSelectTurn={setViewUserId} streaming={wb.isStreaming}
            onRegenerate={() => { follow(); wb.regenerate(); }} onCitation={(page) => wb.openCitation(page)}
            onOpenSource={(s) => wb.openSource({ url: s.url, page: s.page, manualKind: "other" })} />
        </div>
      </motion.div>

      {/* While dragging either panel, a full-page overlay captures pointer moves so
          the canvas iframe doesn't swallow them, and shows the col-resize cursor. */}
      {(resizing || resizingSidebar) && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none"
          onPointerMove={resizing ? onResizeMove : onSidebarResizeMove}
          onPointerUp={() => { setResizing(false); setResizingSidebar(false); }}
          onPointerLeave={() => { setResizing(false); setResizingSidebar(false); }} />
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
