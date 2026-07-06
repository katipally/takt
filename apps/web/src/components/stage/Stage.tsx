"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Copy, RefreshCw, Volume2, Square, ImageIcon, Check } from "lucide-react";
import { useSyncExternalStore, useState } from "react";
import { StreamingMarkdown } from "@/components/markdown/StreamingMarkdown";
import { CitationChip } from "@/components/chat/CitationChip";
import { Carousel } from "@/components/chat/Carousel";
import { UIRenderer } from "@/components/ui-catalog/UIRenderer";
import type { RenderCtx } from "@/components/ui-catalog/ctx";
import { speech } from "@/lib/speech";
import type { Node, Part, PageImagePart, UIPart, TextPart, AskPart } from "@/lib/chatStore";
import { Wordmark } from "@/components/brand/Wordmark";

const linkify = (t: string) => t.replace(/\[p\.\s*(\d+)\]/g, (_m, n) => `[p.${n}](takt:cite:${n})`);

// The main stage: the rendered ANSWER, full-bleed in a reading column. Renders a
// single turn (the latest, or a past one selected from the rail): the user's
// prompt as an eyebrow, then the assistant's presentational parts (prose + UI
// surfaces + source images) in order. Thinking/tools live in the ProcessRail.
export function Stage({
  userText, node, isLatest, ctx, onRegenerate, empty, heading, subheading, starters, onStarter, liveMode,
}: {
  userText?: string;
  node?: Extract<Node, { role: "assistant" }>;
  isLatest: boolean;
  ctx: RenderCtx;
  onRegenerate: () => void;
  empty: boolean;
  heading?: string;
  subheading?: string;
  starters?: string[];
  onStarter?: (s: string) => void;
  liveMode?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Stick to bottom while the latest answer streams.
  useEffect(() => {
    if (!isLatest || !node?.streaming) return;
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  });

  // During a live call the canvas EXPLAINS the concept — it renders only the
  // visual surfaces (diagrams the worker builds), never the spoken transcript
  // (that's the subtitle + the rail's live-session card).
  if (liveMode) {
    const surfaces = node?.parts.filter((p): p is UIPart => p.kind === "ui") ?? [];
    return (
      <div ref={scrollRef} className="takt-scroll relative min-h-0 flex-1 overflow-y-auto">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_28%,var(--accent-soft,rgba(120,130,255,0.1)),transparent_70%)]" />
        <div className="relative mx-auto w-full max-w-3xl px-6 pb-44 pt-8">
          {surfaces.length ? (
            <div className="space-y-5">{surfaces.map((p) => <UIRenderer key={p.id} surface={p.surface} ctx={{ ...ctx, readOnly: true }} animate />)}</div>
          ) : (
            <LiveIdle />
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="takt-scroll relative min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 pb-40 pt-8">
        {empty ? (
          <EmptyState heading={heading} subheading={subheading} starters={starters} onStarter={onStarter} />
        ) : (
          <>
            {userText ? <div className="mb-6 text-[13px] font-medium uppercase tracking-wide text-arc">{userText}</div> : null}
            {node ? <Answer node={node} isLatest={isLatest} ctx={ctx} onRegenerate={onRegenerate} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

// Calm placeholder shown on the live stage before any visual exists — Takt is
// talking; visuals appear here only when they help explain something.
function LiveIdle() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="text-[13px] text-muted-foreground">Talking with Takt</div>
      <div className="mt-1 max-w-xs text-[12px] text-faint">Diagrams and visuals appear here when they help explain something.</div>
    </div>
  );
}

function Answer({ node, isLatest, ctx, onRegenerate }: { node: Extract<Node, { role: "assistant" }>; isLatest: boolean; ctx: RenderCtx; onRegenerate: () => void }) {
  const speakingId = useSyncExternalStore(speech.subscribe, speech.speakingId, () => null);
  const speaking = speakingId === node.id;
  const images = node.parts.filter((p): p is PageImagePart => p.kind === "page_image");
  const fullText = node.parts.filter((p) => p.kind === "text").map((p) => (p as TextPart).text).join("\n");
  const showThinking = node.streaming && node.parts.every((p) => p.kind === "reasoning" || p.kind === "tool");

  const citeProduct = (() => {
    const slugs = [...new Set(images.map((p) => p.productSlug).filter(Boolean))] as string[];
    return slugs.length === 1 ? slugs[0]! : null;
  })();
  const renderLink = ({ href }: { href: string; children: ReactNode }) => {
    if (href.startsWith("takt:cite:")) { const page = Number(href.slice(10)); return <CitationChip page={page} onClick={() => ctx.onCitation?.(page, citeProduct ?? undefined)} />; }
    return undefined;
  };

  // Presentational parts only (text + ui), in order. Reasoning/tools go to the rail.
  const stageParts = node.parts.filter((p): p is TextPart | UIPart => p.kind === "text" || p.kind === "ui");

  return (
    <div className="group/answer space-y-5 animate-fade-up">
      {showThinking && <div className="text-chat"><span className="arc-shimmer font-medium">Thinking…</span></div>}
      {stageParts.map((p) =>
        p.kind === "text"
          ? <StreamingMarkdown key={p.id} content={linkify(p.text)} isStreaming={node.streaming} renderLink={renderLink} />
          : <UIRenderer key={p.id} surface={p.surface} ctx={{ ...ctx, readOnly: ctx.readOnly ?? !isLatest }} animate={isLatest && node.streaming} />,
      )}

      {images.length > 0 && (
        <Carousel label={images.length > 1 ? `${images.length} sources` : "Source"}>
          {images.map((b) => (
            <button key={b.id} onClick={() => ctx.onSource?.({ page: b.page, url: b.url, caption: b.caption ?? undefined })}
              className="group flex w-28 shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:-translate-y-0.5 hover:border-border-heavy">
              <div className="aspect-[3/4] w-full overflow-hidden bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.url} alt={`page ${b.page}`} className="size-full object-cover object-top opacity-90 transition group-hover:opacity-100" />
              </div>
              <div className="flex items-center gap-1 px-1.5 py-1 text-[10px] text-muted-foreground"><ImageIcon className="size-2.5 shrink-0" /><span className="truncate">p.{b.page}</span></div>
            </button>
          ))}
        </Carousel>
      )}

      {!node.streaming && fullText && (
        <div className="flex items-center gap-1 opacity-0 transition group-hover/answer:opacity-100">
          <Action title="Copy" onClick={() => navigator.clipboard?.writeText(fullText)} copyDone><Copy className="size-3.5" /></Action>
          <Action title={speaking ? "Stop" : "Read aloud"} onClick={() => (speaking ? speech.stop() : speech.speak(node.id, fullText))}>
            {speaking ? <Square className="size-3 fill-current text-arc" /> : <Volume2 className="size-3.5" />}
          </Action>
          {isLatest && <Action title="Regenerate" onClick={onRegenerate}><RefreshCw className="size-3.5" /></Action>}
        </div>
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

function Action({ title, onClick, children, copyDone }: { title: string; onClick: () => void; children: ReactNode; copyDone?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button title={title} onClick={() => { onClick(); if (copyDone) { setDone(true); setTimeout(() => setDone(false), 1200); } }}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
      {done ? <Check className="size-3.5 text-success" /> : children}
    </button>
  );
}
