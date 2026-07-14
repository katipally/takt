"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AudioLines } from "lucide-react";
import { Canvas } from "@/components/canvas/Canvas";
import type { CanvasPart } from "@/lib/chatStore";
import { Wordmark } from "@/components/brand/Wordmark";

// The stage is a pure ARTIFACT surface — it shows the SINGLE most-recent canvas
// (the composed HTML page), rendered in a sandboxed iframe (see Canvas.tsx).
// A new canvas replaces the previous one (like an artifact panel), so the Canvas
// stays mounted (stable key by canvasId). It never shows the conversation;
// prose/reasoning/tools/sources live in the rail.

export function Stage({
  canvas, chatId, productSlug, constructing, buildStatus, streaming, canvasStreaming, empty, heading, subheading, starters, onStarter,
}: {
  canvas?: CanvasPart;
  chatId: string;
  productSlug: string | null;
  constructing: boolean;            // this turn is building a new canvas that hasn't painted yet
  buildStatus?: string | null;      // live gather/compose status line
  streaming: boolean;
  canvasStreaming?: boolean;        // the SHOWN canvas is this turn's, still streaming (live preview)
  empty: boolean;
  heading?: string;
  subheading?: string;
  starters?: string[];
  onStarter?: (s: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Stick to bottom while a canvas streams in.
  useEffect(() => {
    if (!streaming) return;
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  });

  const reduce = useReducedMotion();
  // constructing = a build is running but its first paint hasn't landed → a
  // full-bleed skeleton (NOT the centered text) so gather → paint is one
  // continuous motion, never a title-then-blank jump.
  const mode: "empty" | "canvas" | "building" | "placeholder" =
    empty ? "empty" : constructing ? "building" : canvas ? "canvas" : "placeholder";
  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: reduce ? 0 : 0.18 } };

  return (
    <div ref={scrollRef} className="takt-scroll relative min-h-0 flex-1 overflow-y-auto">
      {/* The ONE build cue: a thin accent bar rides the top while the latest turn
          is still composing, then vanishes. */}
      {streaming && (
        <div aria-hidden className="pointer-events-none sticky inset-x-0 top-0 z-30 h-[3px] bg-accent/80 animate-pulse" />
      )}
      {/* The canvas owns the WHOLE stage (full-bleed; .takt-page provides its own
          padding + layout). It renders OUTSIDE the crossfade so the iframe never
          remounts. */}
      {mode === "canvas" && canvas ? (
        <div className="relative w-full pb-48">
          <Canvas key={canvas.canvasId} part={canvas} chatId={chatId} productSlug={productSlug} streaming={!!canvasStreaming} />
        </div>
      ) : mode === "building" ? (
        <div className="relative w-full pb-48"><CanvasSkeleton status={buildStatus ?? null} /></div>
      ) : (
        <div className="relative mx-auto w-full max-w-3xl px-6 pb-48 pt-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} {...fade}>
              {mode === "empty"
                ? <EmptyState heading={heading} subheading={subheading} starters={starters} onStarter={onStarter} />
                : <Placeholder streaming={streaming} status={buildStatus ?? null} />}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// Full-bleed loading skeleton shaped like a poster page (eyebrow, headline, lead,
// a lead visual, a two-column body) using the same .takt-page grid + shimmer as
// the real canvas — so when the finished page lands, it's a seamless
// continuation, never a jump from a centered spinner.
function CanvasSkeleton({ status }: { status?: string | null }) {
  return (
    <div className="takt-page takt-building" aria-hidden>
      <div className="sk sk-line" style={{ width: "22%", height: 12 }} />
      <div className="sk sk-line" style={{ width: "70%", height: 44 }} />
      <div className="sk sk-line" style={{ width: "52%", height: 20 }} />
      <div className="sk sk-block" style={{ height: 260 }} />
      <div className="takt-grid takt-cols-2" style={{ display: "grid" }}>
        <div className="sk sk-block" style={{ height: 150 }} />
        <div className="sk sk-block" style={{ height: 150 }} />
      </div>
      <div className="sk sk-line" style={{ width: "84%" }} />
      <div className="sk sk-line" style={{ width: "68%" }} />
      {status && <div className="arc-shimmer text-[12px] font-medium text-muted-foreground" style={{ marginTop: 8 }}>{status}</div>}
    </div>
  );
}

// The one non-empty, non-canvas state: a calm status line while a turn streams,
// or a quiet wordmark when settled. (Live mode is a fullscreen overlay — see
// components/live/LiveDock — so the stage has no live state.)
function Placeholder({ streaming, status }: { streaming: boolean; status?: string | null }) {
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
