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

// `active` shows while the tool runs (gerund + shimmer), `label` once it's done —
// together they read as staged progress: searching → reading → designing.
const TOOL_META: Record<string, { label: string; active: string; icon: ReactNode }> = {
  search_manual: { label: "Searched the manual", active: "Searching the manual…", icon: <Search className="size-3.5" /> },
  get_page_image: { label: "Opened a manual page", active: "Reading the manual page…", icon: <ImageIcon className="size-3.5" /> },
  emit_artifact: { label: "Built the answer", active: "Designing your answer…", icon: <Boxes className="size-3.5" /> },
  list_products: { label: "Checked the catalog", active: "Checking the catalog…", icon: <FileText className="size-3.5" /> },
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

  // Collect media into carousels below; the rest (reasoning/tool/text) renders in
  // order, with consecutive reasoning+tool runs collapsed into one "work" block
  // so the message reads as work → answer instead of a cluttered stack of rows.
  const images = node.parts.filter((p): p is PageImagePart => p.kind === "page_image");
  const artifacts = node.parts.filter((p): p is ArtifactPart => p.kind === "artifact");

  type Segment = { kind: "work"; parts: Part[] } | { kind: "text"; part: Part };
  const segments: Segment[] = [];
  for (const part of node.parts) {
    if (part.kind === "reasoning" || part.kind === "tool") {
      const last = segments[segments.length - 1];
      if (last?.kind === "work") last.parts.push(part);
      else segments.push({ kind: "work", parts: [part] });
    } else if (part.kind === "text") {
      segments.push({ kind: "text", part });
    }
  }

  return (
    <div className="group/msg animate-fade-up">
      {showThinking && <div className="text-chat"><span className="arc-shimmer font-medium">Thinking…</span></div>}

      <div className="flex flex-col gap-2">
        {segments.map((seg, i) =>
          seg.kind === "work" ? (
            <WorkBlock key={`work-${i}`} parts={seg.parts} active={node.streaming && i === segments.length - 1} />
          ) : (
            <StreamingMarkdown key={seg.part.id} content={linkify((seg.part as { text: string }).text)} isStreaming={node.streaming} renderLink={renderLink} />
          ),
        )}
      </div>

      {node.streaming && node.status && (
        <div className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-1.5 text-[12px]">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-arc" />
          <span className="arc-shimmer font-medium">{node.status}</span>
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-3">
          <Carousel label={images.length > 1 ? `${images.length} sources` : "Source"}>
            {images.map((b) => (
              <button key={b.id} onClick={() => onOpenSource(b)}
                className="group flex w-28 shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:-translate-y-0.5 hover:border-border-heavy">
                <div className="aspect-[3/4] w-full overflow-hidden bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.url} alt={`page ${b.page}`} className="size-full object-cover object-top opacity-90 transition group-hover:opacity-100" />
                </div>
                <div className="flex items-center gap-1 px-1.5 py-1 text-[10px] text-muted-foreground">
                  <ImageIcon className="size-2.5 shrink-0" /><span className="truncate">p.{b.page}</span>
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

// One collapsible block for a run of reasoning + tool calls — the message's
// "work". Expanded live while active, auto-collapses to a one-line summary
// (e.g. "Worked it out · 3 steps") once the answer starts, like Claude.
function WorkBlock({ parts, active }: { parts: Part[]; active: boolean }) {
  const [open, setOpen] = useState(false);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) setOpen(false);
    wasActive.current = active;
  }, [active]);
  const expanded = open || active;

  const tools = parts.filter((p): p is Extract<Part, { kind: "tool" }> => p.kind === "tool");
  const hasReasoning = parts.some((p) => p.kind === "reasoning");
  const running = tools.find((t) => t.status === "running");
  const stepLabel = `${tools.length} step${tools.length === 1 ? "" : "s"}`;

  return (
    <div className="rounded-lg border border-border bg-card/40">
      <button onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[12px] text-muted-foreground transition hover:text-foreground">
        {active
          ? <Loader2 className="size-3.5 shrink-0 animate-spin text-arc" />
          : <Brain className="size-3.5 shrink-0 text-faint" />}
        {active ? (
          <span className="arc-shimmer font-medium">{running ? (TOOL_META[running.tool]?.active ?? "Working…") : "Thinking…"}</span>
        ) : (
          <>
            <span className="font-medium text-foreground/80">Worked it out</span>
            {tools.length > 0 && <span className="text-faint">· {stepLabel}{hasReasoning ? " · reasoned" : ""}</span>}
            {tools.length === 0 && hasReasoning && <span className="text-faint">· reasoned</span>}
          </>
        )}
        <ChevronRight className={cn("ml-auto size-3.5 shrink-0 transition", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
          {parts.map((p) =>
            p.kind === "reasoning"
              ? <ReasoningBody key={p.id} text={p.text} />
              : p.kind === "tool" ? <ToolRow key={p.id} part={p} /> : null,
          )}
        </div>
      )}
    </div>
  );
}

function ReasoningBody({ text }: { text: string }) {
  return (
    <div className="border-l-2 border-border pl-3 text-[12px] leading-[18px] text-muted-foreground whitespace-pre-wrap">
      {text || "…"}
    </div>
  );
}

function ToolRow({ part }: { part: Extract<Part, { kind: "tool" }> }) {
  const meta = TOOL_META[part.tool] ?? { label: part.tool, active: part.tool, icon: <Search className="size-3.5" /> };
  const running = part.status === "running";
  return (
    <div className="flex items-center gap-2 rounded-md bg-card/40 px-2.5 py-1.5 text-[12px] text-muted-foreground">
      <span className={cn("text-faint", running && "text-arc")}>{meta.icon}</span>
      <span className={cn(running ? "arc-shimmer font-medium" : "text-foreground/80")}>{running ? meta.active : meta.label}</span>
      {part.summary && <span className="truncate text-faint">· {part.summary}</span>}
      <span className="ml-auto flex items-center gap-1.5">
        {part.detail && part.status === "done" && <span className="text-faint">{part.detail}</span>}
        {running ? <Loader2 className="size-3.5 animate-spin text-arc" /> : <Check className="size-3.5 text-success" />}
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
