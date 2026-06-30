"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Boxes, ImageIcon, Search, FileText, Check, Loader2,
  ChevronRight, Brain, Copy, RefreshCw, Volume2, Square,
} from "lucide-react";
import { StreamingMarkdown } from "@/components/markdown/StreamingMarkdown";
import { CitationChip } from "./CitationChip";
import { BranchNav } from "./BranchNav";
import { Carousel } from "./Carousel";
import { speech } from "@/lib/speech";
import type { Node, Part, PageImagePart, ArtifactPart, BranchInfo } from "@/lib/chatStore";
import { cn } from "@/lib/cn";

const TOOL_META: Record<string, { label: string; icon: ReactNode }> = {
  search_manual: { label: "Searched the manual", icon: <Search className="size-3.5" /> },
  get_page_image: { label: "Opened a manual page", icon: <ImageIcon className="size-3.5" /> },
  emit_artifact: { label: "Built an interactive view", icon: <Boxes className="size-3.5" /> },
  list_products: { label: "Checked the catalog", icon: <FileText className="size-3.5" /> },
};

const linkify = (t: string) => t.replace(/\[p\.\s*(\d+)\]/g, (_m, n) => `[p.${n}](prox:cite:${n})`);

export function AssistantMessage({
  node, isLast, branch, onSwitch, onCitation, onOpenSource, onOpenArtifact, onRegenerate,
}: {
  node: Extract<Node, { role: "assistant" }>;
  isLast: boolean;
  branch: BranchInfo | null;
  onSwitch: (dir: -1 | 1) => void;
  onCitation: (page: number) => void;
  onOpenSource: (b: PageImagePart) => void;
  onOpenArtifact: (b: ArtifactPart) => void;
  onRegenerate: () => void;
}) {
  const speakingId = useSyncExternalStore(speech.subscribe, speech.speakingId, () => null);
  const speaking = speakingId === node.id;

  const renderLink = ({ href }: { href: string; children: ReactNode }) => {
    if (href.startsWith("prox:cite:")) {
      const page = Number(href.slice("prox:cite:".length));
      return <CitationChip page={page} onClick={() => onCitation(page)} />;
    }
    return undefined;
  };

  const hasText = node.parts.some((p) => p.kind === "text" && p.text);
  const showThinking = node.streaming && node.parts.length === 0;
  const fullText = node.parts.filter((p) => p.kind === "text").map((p) => (p as { text: string }).text).join("\n");

  // Inline reasoning/tool/text in order; collect media into carousels below.
  const inline = node.parts.filter((p) => p.kind === "reasoning" || p.kind === "tool" || p.kind === "text");
  const images = node.parts.filter((p): p is PageImagePart => p.kind === "page_image");
  const artifacts = node.parts.filter((p): p is ArtifactPart => p.kind === "artifact");

  return (
    <div className="group/msg animate-fade-up">
      {showThinking && <div className="text-chat"><span className="arc-shimmer font-medium">Thinking…</span></div>}

      <div className="flex flex-col gap-1.5">
        {inline.map((part) => (
          <PartView key={part.id} part={part} streaming={node.streaming} renderLink={renderLink}
            onOpenSource={onOpenSource} onOpenArtifact={onOpenArtifact} />
        ))}
      </div>

      {images.length > 0 && (
        <div className="mt-3">
          <Carousel label={images.length > 1 ? `${images.length} sources` : "Source"}>
            {images.map((b) => (
              <button key={b.id} onClick={() => onOpenSource(b)}
                className="group flex w-40 shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:-translate-y-0.5 hover:border-border-heavy">
                <div className="aspect-[3/4] w-full overflow-hidden bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.url} alt={`page ${b.page}`} className="size-full object-cover object-top opacity-90 transition group-hover:opacity-100" />
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-muted-foreground">
                  <ImageIcon className="size-3 shrink-0" /><span className="truncate">{b.manualTitle ?? "Manual"} · p.{b.page}</span>
                </div>
              </button>
            ))}
          </Carousel>
        </div>
      )}

      {artifacts.length > 0 && (
        <div className="mt-3">
          <Carousel label={artifacts.length > 1 ? `${artifacts.length} artifacts` : "Artifact"}>
            {artifacts.map((b) => (
              <button key={b.id} onClick={() => onOpenArtifact(b)}
                className="flex w-60 shrink-0 snap-start items-center gap-2.5 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-accent/60">
                <Boxes className="size-4 shrink-0 text-accent" />
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-foreground">{b.title}</div>
                  <div className="text-[11px] text-accent">Interactive · open in Canvas</div>
                </div>
              </button>
            ))}
          </Carousel>
        </div>
      )}

      {!node.streaming && (hasText || branch) && (
        <div className="mt-2 flex items-center gap-1.5">
          {branch && <BranchNav info={branch} onPrev={() => onSwitch(-1)} onNext={() => onSwitch(1)} />}
          <div className="flex items-center gap-1 opacity-0 transition group-hover/msg:opacity-100">
            <Action title="Copy" onClick={() => navigator.clipboard?.writeText(fullText)} copyDone><Copy className="size-3.5" /></Action>
            <Action title={speaking ? "Stop" : "Read aloud"} onClick={() => (speaking ? speech.stop() : speech.speak(node.id, fullText))}>
              {speaking ? <Square className="size-3 fill-current text-arc" /> : <Volume2 className="size-3.5" />}
            </Action>
            {isLast && <Action title="Regenerate" onClick={onRegenerate}><RefreshCw className="size-3.5" /></Action>}
          </div>
        </div>
      )}
    </div>
  );
}

function PartView({
  part, streaming, renderLink, onOpenSource, onOpenArtifact,
}: {
  part: Part; streaming: boolean;
  renderLink: (i: { href: string; children: ReactNode }) => ReactNode | undefined;
  onOpenSource: (b: PageImagePart) => void;
  onOpenArtifact: (b: ArtifactPart) => void;
}) {
  if (part.kind === "reasoning") return <Reasoning text={part.text} streaming={streaming} />;
  if (part.kind === "tool") return <ToolRow part={part} />;
  if (part.kind === "text") return <StreamingMarkdown content={linkify(part.text)} isStreaming={streaming} renderLink={renderLink} />;
  if (part.kind === "page_image") return (
    <button onClick={() => onOpenSource(part)}
      className="group flex w-44 flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:-translate-y-0.5 hover:border-border-heavy">
      <div className="aspect-[3/4] w-full overflow-hidden bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={part.url} alt={`page ${part.page}`} className="size-full object-cover object-top opacity-90 transition group-hover:opacity-100" />
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-muted-foreground">
        <ImageIcon className="size-3 shrink-0" /><span className="truncate">{part.manualTitle ?? "Manual"} · p.{part.page}</span>
      </div>
    </button>
  );
  if (part.kind === "artifact") return (
    <button onClick={() => onOpenArtifact(part)}
      className="flex w-fit items-center gap-2.5 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-accent/60">
      <Boxes className="size-4 text-accent" />
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-foreground">{part.title}</div>
        <div className="text-[11px] text-accent">Interactive · open in Canvas</div>
      </div>
    </button>
  );
  return null;
}

function Reasoning({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const wasStreaming = useRef(streaming);
  useEffect(() => {
    if (wasStreaming.current && !streaming) setOpen(false); // auto-collapse when the block finishes
    wasStreaming.current = streaming;
  }, [streaming]);
  const expanded = open || streaming; // expanded live; collapses to header when done
  return (
    <div className="rounded-lg border border-border bg-card/40">
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-muted-foreground transition hover:text-foreground">
        <Brain className={cn("size-3.5", streaming && "text-arc")} />
        <span className={cn("font-medium", streaming && "arc-shimmer")}>Reasoning</span>
        <ChevronRight className={cn("ml-auto size-3.5 transition", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="mx-2.5 mb-2 border-l-2 border-border pl-3 text-[12px] leading-[18px] text-muted-foreground whitespace-pre-wrap">
          {text || "…"}
        </div>
      )}
    </div>
  );
}

function ToolRow({ part }: { part: Extract<Part, { kind: "tool" }> }) {
  const meta = TOOL_META[part.tool] ?? { label: part.tool, icon: <Search className="size-3.5" /> };
  return (
    <div className="flex items-center gap-2 rounded-md bg-card/40 px-2.5 py-1.5 text-[12px] text-muted-foreground">
      <span className="text-faint">{meta.icon}</span>
      <span className="text-foreground/80">{meta.label}</span>
      {part.summary && <span className="truncate text-faint">· {part.summary}</span>}
      <span className="ml-auto flex items-center gap-1.5">
        {part.detail && part.status === "done" && <span className="text-faint">{part.detail}</span>}
        {part.status === "running" ? <Loader2 className="size-3.5 animate-spin text-arc" /> : <Check className="size-3.5 text-success" />}
      </span>
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
