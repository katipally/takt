"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MarkdownBody, type RenderLink } from "./MarkdownBody";

// Streaming reveal engine (ported from the reference design system). Decouples
// the incoming buffer from painted text: a rAF-throttled flusher reveals on
// word/line/paragraph boundaries, and the content is split into a stable prefix
// and an animating live tail — never splitting inside an open code fence.

const FLUSH_MS = 32;
const MIN_STEP = 20;
const MAX_STEP = 120;

export function StreamingMarkdown({
  content, isStreaming = false, renderLink,
}: { content: string; isStreaming?: boolean; renderLink?: RenderLink }) {
  const [visible, setVisible] = useState(content);
  const visibleRef = useRef(content);
  const targetRef = useRef(content);
  const frameRef = useRef<number | null>(null);
  const lastFlushRef = useRef(0);
  const liveRef = useRef<HTMLDivElement>(null);
  const prevSplit = useRef({ stable: "", live: "" });

  const schedule = () => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame((ts) => {
      frameRef.current = null;
      if (ts - lastFlushRef.current < FLUSH_MS) { schedule(); return; }
      lastFlushRef.current = ts;
      const next = selectVisible(targetRef.current, visibleRef.current.length);
      if (next.length !== visibleRef.current.length) { visibleRef.current = next; setVisible(next); }
      if (visibleRef.current.length < targetRef.current.length) schedule();
    });
  };

  useEffect(() => {
    targetRef.current = content;
    if (content.length < visibleRef.current.length) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null; lastFlushRef.current = 0;
      visibleRef.current = content; setVisible(content); return;
    }
    if (content.length === visibleRef.current.length) return;
    schedule();
    return () => { if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; } };
  }, [content, isStreaming]);

  const split = useMemo(() => splitContent(visible), [visible]);
  const revealing = visible.length < content.length;

  useLayoutEffect(() => {
    const node = liveRef.current;
    const prev = prevSplit.current;
    const active = split.animateLive && (isStreaming || revealing);
    const firstLive = prev.live.length === 0 && split.live.length > 0;
    const crossed = split.stable.length > prev.stable.length;
    prevSplit.current = { stable: split.stable, live: split.live };
    if (!node) return;
    if (!active) { node.classList.remove("animate-streaming-fade"); return; }
    if (firstLive || crossed) {
      node.classList.remove("animate-streaming-fade");
      void node.offsetHeight;
      node.classList.add("animate-streaming-fade");
    }
  }, [split.stable, split.live, split.animateLive, isStreaming, revealing]);

  return (
    <div className="text-chat text-foreground">
      {split.stable && (
        <MarkdownBody content={split.stable}
          className={split.live ? "[&>*:first-child]:mt-0" : "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"}
          renderLink={renderLink} />
      )}
      {split.live && (
        <div ref={liveRef}>
          <MarkdownBody content={split.live}
            className={split.stable ? "[&>*:last-child]:mb-0" : "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"}
            renderLink={renderLink} />
        </div>
      )}
    </div>
  );
}

function splitContent(content: string): { stable: string; live: string; animateLive: boolean } {
  if (!content) return { stable: "", live: "", animateLive: false };
  const structured = hasOpenFence(content) || hasTrailingTable(content);
  if (!needsSplit(content)) return { stable: "", live: content, animateLive: true };
  const boundary = stableBoundary(content);
  if (boundary < 0 || boundary + 2 >= content.length) return { stable: "", live: content, animateLive: !structured };
  return { stable: content.slice(0, boundary + 2), live: content.slice(boundary + 2), animateLive: !structured };
}

function stableBoundary(content: string): number {
  let b = content.lastIndexOf("\n\n");
  while (b >= 0) {
    if (!hasOpenFence(content.slice(0, b + 2))) return b;
    b = content.lastIndexOf("\n\n", b - 1);
  }
  return -1;
}

function hasOpenFence(c: string): boolean { return (c.match(/```/g)?.length ?? 0) % 2 === 1; }
function hasTrailingTable(c: string): boolean {
  const lines = c.trimEnd().split("\n");
  if (lines.length < 2) return false;
  return lines.slice(-3).filter((l) => l.trim().startsWith("|") && l.trim().endsWith("|")).length >= 2;
}
function needsSplit(c: string): boolean { return c.includes("```") || hasTrailingTable(c); }

function selectVisible(content: string, current: number): string {
  if (content.length <= current) return content;
  const next = Math.min(content.length, current + step(content.length - current));
  if (!hasOpenFence(content) && !hasTrailingTable(content)) return content.slice(0, textBoundary(content, current, next));
  const nl = content.indexOf("\n", next);
  if (nl !== -1 && nl < current + MAX_STEP * 2) return content.slice(0, nl + 1);
  const prior = content.lastIndexOf("\n", next);
  if (prior > current) return content.slice(0, prior + 1);
  return content.slice(0, next);
}
function step(remaining: number): number { return Math.max(MIN_STEP, Math.min(MAX_STEP, Math.ceil(remaining / 4))); }
function textBoundary(content: string, current: number, target: number): number {
  if (target >= content.length) return content.length;
  const para = content.lastIndexOf("\n\n", target);
  if (para >= current + MIN_STEP) return para + 2;
  const line = content.lastIndexOf("\n", target);
  if (line >= current + MIN_STEP / 2) return line + 1;
  const ws = content.lastIndexOf(" ", target);
  if (ws >= current + MIN_STEP / 2) return ws + 1;
  return target;
}
