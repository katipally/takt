"use client";

import { useEffect, useRef } from "react";
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
  surfaces, building, streaming, isLatest, ctx, empty, heading, subheading, starters, onStarter, liveMode,
}: {
  surfaces: UIPart[];
  building: boolean;
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
  const showingSurfaces = !empty && !building && surfaces.length > 0;
  const pageMode = showingSurfaces && surfaces.every(isPageSurface);

  return (
    <div ref={scrollRef} className="takt-scroll relative min-h-0 flex-1 overflow-y-auto">
      {liveMode && <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_28%,var(--accent-soft,rgba(120,130,255,0.1)),transparent_70%)]" />}
      <div className={pageMode ? "relative w-full pb-40" : "relative mx-auto w-full max-w-3xl px-6 pb-40 pt-8"}>
        {empty ? (
          <EmptyState heading={heading} subheading={subheading} starters={starters} onStarter={onStarter} />
        ) : building ? (
          <ArtifactSkeleton live={liveMode} />
        ) : surfaces.length ? (
          <div className={pageMode ? "" : "space-y-6"}>
            {surfaces.map((p) => <UIRenderer key={p.id} surface={p.surface} ctx={{ ...ctx, readOnly: ctx.readOnly ?? !isLatest }} animate={isLatest && streaming} />)}
          </div>
        ) : (
          <ArtifactIdle streaming={streaming} live={liveMode} />
        )}
      </div>
    </div>
  );
}

// Ghost/skeleton shown while the agent is composing an artifact — mimics the
// shape of a designed surface (title · figure · text · media grid) so the canvas
// reads as "a polished thing is being built here," not a spinner.
function ArtifactSkeleton({ live }: { live?: boolean }) {
  return (
    <div>
      <div className="mb-4 text-[12px] font-medium"><span className="arc-shimmer">{live ? "Designing a visual…" : "Designing the answer…"}</span></div>
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="animate-pulse space-y-5">
          <div className="h-6 w-2/5 rounded-md bg-foreground/10" />
          <div className="h-44 w-full rounded-xl bg-foreground/[0.06]" />
          <div className="space-y-2.5">
            <div className="h-3 w-full rounded bg-foreground/10" />
            <div className="h-3 w-11/12 rounded bg-foreground/10" />
            <div className="h-3 w-3/5 rounded bg-foreground/10" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="h-20 rounded-lg bg-foreground/[0.06]" />
            <div className="h-20 rounded-lg bg-foreground/[0.06]" />
            <div className="h-20 rounded-lg bg-foreground/[0.06]" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Calm placeholder when the current reply carries no artifact (a purely
// conversational answer lives in the chat).
function ArtifactIdle({ streaming, live }: { streaming: boolean; live?: boolean }) {
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
      {streaming ? (
        <span className="arc-shimmer text-[13px] font-medium text-muted-foreground">Working…</span>
      ) : (
        <>
          <div className="text-[13px] text-muted-foreground">{live ? "Talking with Takt" : "The reply is in the chat"}</div>
          <div className="mt-1 max-w-xs text-[12px] text-faint">Diagrams, cropped figures, 3D parts, video and step-by-step guides appear here when they help explain something.</div>
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
