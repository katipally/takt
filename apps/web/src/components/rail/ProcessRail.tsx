"use client";

import { useState, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen, Brain, Search, FileText, ImageIcon, Boxes, Check, Loader2, ChevronRight, AudioLines } from "lucide-react";
import type { Node, Part, PageImagePart, ToolPart, ReasoningPart, TextPart } from "@/lib/chatStore";
import { cn } from "@/lib/cn";

const TOOL_META: Record<string, { label: string; active: string; icon: ReactNode }> = {
  list_profile: { label: "Mapped the product", active: "Listing knowledge…", icon: <FileText className="size-3.5" /> },
  grep_profile: { label: "Searched the docs", active: "Searching…", icon: <Search className="size-3.5" /> },
  read_profile: { label: "Read the docs", active: "Reading…", icon: <FileText className="size-3.5" /> },
  get_page_image: { label: "Opened a page", active: "Reading the page…", icon: <ImageIcon className="size-3.5" /> },
  crop_page_image: { label: "Cropped a page", active: "Cropping…", icon: <ImageIcon className="size-3.5" /> },
  emit_ui: { label: "Designed the answer", active: "Designing…", icon: <Boxes className="size-3.5" /> },
  list_products: { label: "Checked the catalog", active: "Checking…", icon: <FileText className="size-3.5" /> },
};

interface Turn { userId: string; userText: string; assistant?: Extract<Node, { role: "assistant" }>; live?: boolean; }

// The process/history rail: collapsed by default to a slim strip. Expanded, it
// shows each turn's prompt (click to bring that answer to the stage), the agent's
// thinking + tool calls, and the sources it pulled.
export function ProcessRail({
  open, onToggle, messages, selectedUserId, onSelectTurn, streaming, onOpenSource,
}: {
  open: boolean;
  onToggle: () => void;
  messages: Node[];
  selectedUserId: string | null;
  onSelectTurn: (userId: string) => void;
  streaming: boolean;
  onOpenSource: (s: { page: number; url: string; caption?: string }) => void;
}) {
  const turns: Turn[] = [];
  for (const n of messages) {
    if (n.role === "user") turns.push({ userId: n.id, userText: n.text, live: n.live });
    else if (turns.length) turns[turns.length - 1]!.assistant = n;
  }
  // Group consecutive live turns into one "Live session" card — a call is its own
  // entity in the rail, not a run of chat turns.
  type Row = { kind: "turn"; turn: Turn } | { kind: "live"; turns: Turn[] };
  const rows: Row[] = [];
  for (const t of turns) {
    const last = rows[rows.length - 1];
    if (t.live) { if (last?.kind === "live") last.turns.push(t); else rows.push({ kind: "live", turns: [t] }); }
    else rows.push({ kind: "turn", turn: t });
  }

  if (!open) {
    return (
      <button onClick={onToggle} title="Show activity" aria-label="Show activity"
        className="flex h-full w-11 shrink-0 flex-col items-center gap-3 rounded-2xl border border-border bg-card py-3 text-muted-foreground shadow-[var(--shadow-card)] transition hover:text-foreground">
        <PanelRightOpen className="size-4" />
        <span className="[writing-mode:vertical-rl] text-[11px] tracking-wide">Activity{streaming ? " ·" : ""}</span>
        {streaming ? <Loader2 className="size-3.5 animate-spin text-arc" /> : null}
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-[12px] font-medium text-muted-foreground">Activity &amp; history</span>
        <button onClick={onToggle} title="Hide" aria-label="Hide activity" className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"><PanelRightClose className="size-4" /></button>
      </div>
      <div className="takt-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {rows.map((r, i) => r.kind === "live"
          ? <LiveSessionCard key={r.turns[0]!.userId} turns={r.turns} live={streaming && i === rows.length - 1}
              selectedUserId={selectedUserId} onSelectTurn={onSelectTurn} />
          : <TurnCard key={r.turn.userId} turn={r.turn} selected={selectedUserId ? r.turn.userId === selectedUserId : i === rows.length - 1}
              live={streaming && i === rows.length - 1} onSelect={() => onSelectTurn(r.turn.userId)} onOpenSource={onOpenSource} />)}
        {rows.length === 0 && <p className="px-1 text-[12px] text-faint">No turns yet.</p>}
      </div>
    </div>
  );
}

// A live call rendered as one entity (not chat turns): collapsed shows a "Live"
// pill + turn count; expanded shows the transcript (you ↔ Takt) with any surfaces
// reachable by clicking a turn to bring it to the stage.
function LiveSessionCard({ turns, live, selectedUserId, onSelectTurn }: {
  turns: Turn[]; live: boolean; selectedUserId: string | null;
  onSelectTurn: (id: string) => void;
}) {
  const [open, setOpen] = useState(live);
  const expanded = open || live;
  const artifactCount = turns.reduce((n, t) => n + (t.assistant?.parts.filter((p) => p.kind === "ui").length ?? 0), 0);
  const anySelected = turns.some((t) => t.userId === selectedUserId);
  const agentText = (t: Turn) => (t.assistant?.parts.filter((p): p is TextPart => p.kind === "text").map((p) => p.text).join(" ") ?? "").trim();

  return (
    <div className={cn("overflow-hidden rounded-xl border transition", anySelected ? "border-accent/40 bg-accent-soft/40" : "border-accent/25 bg-accent-soft/20")}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", live ? "bg-accent/15 text-accent" : "bg-foreground/[0.06] text-muted-foreground")}>
          {live ? <Loader2 className="size-3.5 animate-spin" /> : <AudioLines className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-foreground">{live ? "Live session · active" : "Live session"}</span>
          <span className="block text-[11px] text-muted-foreground">{turns.length} turn{turns.length === 1 ? "" : "s"}{artifactCount ? ` · ${artifactCount} artifact${artifactCount === 1 ? "" : "s"}` : ""}</span>
        </span>
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border/60 px-3 py-2.5">
          {turns.map((t) => (
            <button key={t.userId} onClick={() => onSelectTurn(t.userId)}
              className={cn("block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-foreground/[0.04]", t.userId === selectedUserId && "bg-foreground/[0.05]")}>
              <span className="block text-[12px] font-medium text-foreground">{t.userText}</span>
              {agentText(t) && <span className="mt-0.5 line-clamp-2 block text-[11.5px] text-muted-foreground">{agentText(t)}</span>}
              {t.assistant?.parts.some((p) => p.kind === "ui") && <span className="mt-1 inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent"><Boxes className="size-2.5" /> artifact</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TurnCard({ turn, selected, live, onSelect, onOpenSource }: { turn: Turn; selected: boolean; live: boolean; onSelect: () => void; onOpenSource: (s: { page: number; url: string; caption?: string }) => void }) {
  const [open, setOpen] = useState(live);
  const parts = turn.assistant?.parts ?? [];
  const work = parts.filter((p): p is ReasoningPart | ToolPart => p.kind === "reasoning" || p.kind === "tool");
  const tools = work.filter((p): p is ToolPart => p.kind === "tool");
  const sources = parts.filter((p): p is PageImagePart => p.kind === "page_image");
  const running = tools.find((t) => t.status === "running");
  const expanded = open || live;

  return (
    <div className={cn("rounded-xl border transition", selected ? "border-arc/40 bg-arc-soft/40" : "border-border bg-card/40")}>
      <button onClick={onSelect} className="block w-full px-3 py-2 text-left">
        <span className="line-clamp-2 text-[12.5px] font-medium text-foreground">{turn.userText}</span>
      </button>
      {work.length > 0 && (
        <div className="px-2 pb-2">
          <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-[11.5px] text-muted-foreground transition hover:text-foreground">
            {live ? <Loader2 className="size-3.5 shrink-0 animate-spin text-arc" /> : <Brain className="size-3.5 shrink-0 text-faint" />}
            <span className={cn(live && "arc-shimmer font-medium")}>{live ? (running ? (TOOL_META[running.tool]?.active ?? "Working…") : "Thinking…") : `Worked it out · ${tools.length} step${tools.length === 1 ? "" : "s"}`}</span>
            <ChevronRight className={cn("ml-auto size-3.5 shrink-0 transition", expanded && "rotate-90")} />
          </button>
          {expanded && (
            <div className="mt-1 flex flex-col gap-1">
              {work.map((p) => p.kind === "reasoning"
                ? <div key={p.id} className="border-l-2 border-border pl-2.5 text-[11.5px] leading-[17px] text-muted-foreground whitespace-pre-wrap">{p.text || "…"}</div>
                : <ToolRow key={p.id} part={p} />)}
            </div>
          )}
        </div>
      )}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
          {sources.map((s) => (
            <button key={s.id} onClick={() => onOpenSource({ page: s.page, url: s.url, caption: s.caption ?? undefined })}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[10.5px] text-arc transition hover:border-border-heavy">
              <ImageIcon className="size-2.5" />p.{s.page}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolRow({ part }: { part: ToolPart }) {
  const meta = TOOL_META[part.tool] ?? { label: part.tool, active: part.tool, icon: <Search className="size-3.5" /> };
  const running = part.status === "running";
  return (
    <div className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[11.5px] text-muted-foreground">
      <span className={cn("text-faint", running && "text-arc")}>{meta.icon}</span>
      <span className={cn(running ? "arc-shimmer font-medium" : "text-foreground/80")}>{running ? meta.active : meta.label}</span>
      {part.summary && <span className="truncate text-faint">· {part.summary}</span>}
      <span className="ml-auto">{running ? <Loader2 className="size-3.5 animate-spin text-arc" /> : <Check className="size-3.5 text-success" />}</span>
    </div>
  );
}
