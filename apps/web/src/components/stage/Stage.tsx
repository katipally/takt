"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AudioLines } from "lucide-react";
import { UIRenderer } from "@/components/ui-catalog/UIRenderer";
import type { RenderCtx } from "@/components/ui-catalog/ctx";
import type { UIPart } from "@/lib/chatStore";
import { Wordmark } from "@/components/brand/Wordmark";

// The canvas is a pure ARTIFACT surface — a polished, final generative-UI panel
// (like a document/preview). It shows ONLY the generated UI surfaces; it never
// shows the conversation, the AI's commentary, the user's prompt, or a title —
// all of that lives in the chat/activity. While the agent composes an artifact
// the canvas shows a ghost skeleton; between artifacts it holds the last one, or
// a calm idle state.
// A surface is a full-bleed freeform Page when its root node is a `Page`.
function isPageSurface(p: UIPart): boolean {
  return p.surface.nodes.find((n) => n.id === p.surface.root)?.type === "Page";
}

export function Stage({
  surfaces, constructing, buildStatus, streaming, isLatest, ctx, empty, heading, subheading, starters, onStarter, liveMode,
}: {
  surfaces: UIPart[];
  constructing: boolean;            // this turn is building a new artifact whose surface hasn't landed yet
  buildStatus?: string | null;      // live gather/compose status line
  streaming: boolean;
  isLatest: boolean;
  ctx: RenderCtx;
  empty: boolean;
  heading?: string;
  subheading?: string;
  starters?: string[];
  onStarter?: (s: string) => void;
  liveMode?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Stick to bottom while an artifact streams in.
  useEffect(() => {
    if (!streaming) return;
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  });

  // A freeform `Page` surface owns the WHOLE canvas (full-bleed, its own layout +
  // internal padding via the design system). Legacy catalog surfaces stay in a
  // centered reading column. Empty/building/idle keep the narrow, calm layout.
  const reduce = useReducedMotion();
  // While this turn is building a NEW artifact whose surface hasn't landed, show the
  // calm placeholder instead of the previous (now stale) artifact — start_canvas puts
  // the real title up within ~1s, so this window is brief.
  const showingSurfaces = !empty && !constructing && surfaces.length > 0;
  // Full-bleed the canvas if ANY surface is a Page; each non-Page (catalog)
  // surface then keeps its own centered reading column, so a mixed turn still
  // renders the Page edge-to-edge instead of boxing everything.
  const pageMode = showingSurfaces && surfaces.some(isPageSurface);
  const renderSurface = (p: UIPart) => (
    <UIRenderer key={p.id} surface={p.surface} ctx={{ ...ctx, readOnly: ctx.readOnly ?? !isLatest, partial: !!p.partial && streaming }} animate={isLatest && streaming} />
  );

  // One canvas state at a time: empty (first load) · surfaces (the artifact) ·
  // placeholder (calm line while a turn builds, or idle). The non-surface states
  // CROSSFADE so there's no hard cut. Surfaces render outside the crossfade (they
  // own their layout + entrance animation) so their iframes never remount.
  const mode: "empty" | "surfaces" | "placeholder" =
    empty ? "empty" : showingSurfaces ? "surfaces" : "placeholder";
  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: reduce ? 0 : 0.18 } };

  return (
    <div ref={scrollRef} className="takt-scroll relative min-h-0 flex-1 overflow-y-auto">
      {/* The ONE build cue: a thin accent bar rides the top of the canvas while the
          latest turn is still composing, and vanishes when it's done. Present = still
          building, absent = complete — no other spinner/skeleton needed. */}
      {streaming && isLatest && (
        <div aria-hidden className="pointer-events-none sticky inset-x-0 top-0 z-30 h-[3px] bg-accent/80 animate-pulse" />
      )}
      {liveMode && <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_28%,var(--accent-soft,rgba(120,130,255,0.1)),transparent_70%)]" />}
      <div className={pageMode ? "relative w-full pb-48" : "relative mx-auto w-full max-w-3xl px-6 pb-48 pt-8"}>
        {mode === "surfaces" ? (
          <div className={pageMode ? "space-y-8" : "space-y-6"}>
            {surfaces.map((p) => pageMode && !isPageSurface(p)
              ? <div key={p.id} className="mx-auto w-full max-w-3xl px-6">{renderSurface(p)}</div>
              : renderSurface(p))}
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} {...fade}>
              {mode === "empty"
                ? <EmptyState heading={heading} subheading={subheading} starters={starters} onStarter={onStarter} />
                : <Placeholder streaming={streaming} status={buildStatus ?? null} live={liveMode} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// The one non-empty, non-surface canvas state. Artifact-first made the old
// crops-grid skeleton redundant (start_canvas puts the real title up within ~1s,
// and the top build-bar signals progress), so this is just: a calm status line
// while a turn streams, or a quiet wordmark when settled. The canvas is
// artifact-first, so it NEVER tells the user to "look in the chat". Live mode gets
// its own animated "listening" view.
function Placeholder({ streaming, status, live }: { streaming: boolean; status?: string | null; live?: boolean }) {
  if (live) return <LiveIdle streaming={streaming} />;
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
      {streaming ? (
        <span className="arc-shimmer text-[13px] font-medium text-muted-foreground">{status || "Putting your answer together…"}</span>
      ) : (
        <>
          <Wordmark size="lg" className="mb-4 inline-block opacity-40" />
          <div className="max-w-xs text-[12px] text-faint">Your answer renders here as a designed page — steps, cropped figures, 3D parts, charts and diagrams.</div>
        </>
      )}
    </div>
  );
}

// Live-call empty/idle canvas: a breathing "listening" orb with pulsing rings so
// the stage feels alive during a voice call before any visual is built.
function LiveIdle({ streaming }: { streaming: boolean }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
      <div className="relative mb-7 grid size-24 place-items-center">
        <span className="absolute inset-0 rounded-full bg-accent/10 motion-safe:animate-ping" />
        <span className="absolute inset-2 rounded-full bg-accent/10 motion-safe:animate-ping" style={{ animationDelay: "0.7s" }} />
        <motion.span
          className="grid size-14 place-items-center rounded-full bg-accent/20 text-accent"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <AudioLines className="size-6" />
        </motion.span>
      </div>
      <div className="text-[13px] font-medium text-foreground">{streaming ? "Takt is thinking…" : "Talking with Takt"}</div>
      <div className="mt-1 max-w-xs text-[12px] text-faint">Diagrams, cropped figures, 3D parts and step-by-step guides appear here as you talk.</div>
    </div>
  );
}

function EmptyState({ heading, subheading, starters, onStarter }: { heading?: string; subheading?: string; starters?: string[]; onStarter?: (s: string) => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <Wordmark size="lg" className="mb-4 inline-block" />
      <h1 className="text-[22px] font-semibold tracking-tight">{heading}</h1>
      {subheading ? <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground">{subheading}</p> : null}
      {starters?.length ? (
        <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
          {starters.map((s) => (
            <button key={s} onClick={() => onStarter?.(s)}
              className="rounded-2xl border border-border bg-surface px-4 py-3 text-left text-[13px] text-foreground transition hover:-translate-y-0.5 hover:border-border-heavy">{s}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
