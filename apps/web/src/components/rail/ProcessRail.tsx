"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanelRightClose, MessageSquare, Brain, Search, FileText, ImageIcon, Boxes, Check, Loader2, ChevronRight, AudioLines, Copy, RefreshCw, SquarePen } from "lucide-react";
import { parseSelection, selectionLabel } from "@/lib/selection";
import type { Node, Part, PageImagePart, ToolPart, ReasoningPart, TextPart } from "@/lib/chatStore";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { cn } from "@/lib/cn";

// [p.NN] → clickable citation chip wired to the source modal.
const linkifyCites = (t: string) => t.replace(/\[p\.\s*(\d+)\]/g, (_m, n) => `[p.${n}](takt:cite:${n})`);

// `active` shows while the tool runs (gerund + shimmer), `label` once it's done —
// together they read as staged progress: searching → reading → building.
const TOOL_META: Record<string, { label: string; active: string; icon: ReactNode }> = {
  find_entity: { label: "Found it in the graph", active: "Looking it up…", icon: <Search className="size-3.5" /> },
  search_product: { label: "Searched the product", active: "Searching…", icon: <Search className="size-3.5" /> },
  query_product: { label: "Pulled the facts", active: "Gathering facts…", icon: <FileText className="size-3.5" /> },
  walk_graph: { label: "Explored connections", active: "Exploring…", icon: <Boxes className="size-3.5" /> },
  get_anchors: { label: "Gathered the media", active: "Gathering figures…", icon: <ImageIcon className="size-3.5" /> },
  product_map: { label: "Mapped the product", active: "Mapping…", icon: <Boxes className="size-3.5" /> },
  list_profile: { label: "Mapped the product", active: "Listing knowledge…", icon: <FileText className="size-3.5" /> },
  grep_profile: { label: "Searched the docs", active: "Searching…", icon: <Search className="size-3.5" /> },
  read_profile: { label: "Read the docs", active: "Reading…", icon: <FileText className="size-3.5" /> },
  get_page_image: { label: "Opened a page", active: "Reading the page…", icon: <ImageIcon className="size-3.5" /> },
  crop_page_image: { label: "Cropped a page", active: "Cropping…", icon: <ImageIcon className="size-3.5" /> },
  emit_ui: { label: "Designed the answer", active: "Designing…", icon: <Boxes className="size-3.5" /> },
  build_canvas: { label: "Built the artifact", active: "Building the artifact…", icon: <Boxes className="size-3.5" /> },
  edit_canvas: { label: "Edited the canvas", active: "Editing the canvas…", icon: <Boxes className="size-3.5" /> },
  delegate_build: { label: "Built a visual", active: "Building the visual…", icon: <Boxes className="size-3.5" /> },
  update_todos: { label: "Planned the steps", active: "Planning…", icon: <FileText className="size-3.5" /> },
  list_products: { label: "Checked the catalog", active: "Checking…", icon: <FileText className="size-3.5" /> },
};

interface Turn { userId: string; userText: string; assistant?: Extract<Node, { role: "assistant" }>; live?: boolean; }

// The process/history rail. Expanded, it shows each turn's prompt (pinned to the
// top while its answer scrolls beneath — Cursor style), the agent's interleaved
// thinking + tool calls in the order they happened, and the sources it pulled.
export function ProcessRail({
  open, onToggle, messages, selectedUserId, onSelectTurn, streaming, onOpenSource, onRegenerate, onCitation,
}: {
  open: boolean;
  onToggle: () => void;
  messages: Node[];
  selectedUserId: string | null;
  onSelectTurn: (userId: string) => void;
  streaming: boolean;
  onOpenSource: (s: { page: number; url: string; caption?: string }) => void;
  onRegenerate?: () => void;
  onCitation?: (page: number) => void;
}) {
  const turns: Turn[] = [];
  for (const n of messages) {
    if (n.role === "user") turns.push({ userId: n.id, userText: n.text, live: n.live });
    else if (turns.length) turns[turns.length - 1]!.assistant = n;
  }
  // Group consecutive live turns into one "Live session" card — a voice call is
  // its own entity (expandable transcript, agent working inside), not a run of
  // pinned chat turns.
  type Row = { kind: "turn"; turn: Turn; index: number } | { kind: "live"; turns: Turn[]; index: number };
  const rows: Row[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    const last = rows[rows.length - 1];
    if (t.live) { if (last?.kind === "live") last.turns.push(t); else rows.push({ kind: "live", turns: [t], index: i }); }
    else rows.push({ kind: "turn", turn: t, index: i });
  }

  // ── Auto-scroll that respects the user ────────────────────────────────────
  // Follow new content ONLY while the user is parked near the bottom; if they
  // scroll up to read, we don't yank them down. A brand-new turn (they just sent)
  // or switching conversations always snaps to the latest interaction.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const prevCount = useRef(turns.length);
  const prevKey = useRef<string>("");
  const convoKey = turns[0]?.userId ?? "empty";

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useEffect(() => {
    const grew = turns.length > prevCount.current;      // a new interaction started
    const switched = convoKey !== prevKey.current;      // revisiting another chat
    if (grew || switched) pinned.current = true;
    prevCount.current = turns.length;
    prevKey.current = convoKey;
    // Instant stick-to-bottom (no smooth) so streaming tokens don't cause jank.
    const el = scrollRef.current;
    if (pinned.current && el) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, streaming, convoKey]);

  if (!open) {
    // Collapsed = a slim strip ON the background (no card/bar). Click anywhere to
    // open; hover highlights. Label centered vertically.
    return (
      <button onClick={onToggle} title="Show chat" aria-label="Show chat"
        className="group flex h-full w-9 shrink-0 flex-col items-center justify-center gap-3 rounded-2xl text-muted-foreground transition hover:bg-foreground/[0.05] hover:text-foreground">
        <MessageSquare className="size-4 opacity-70 transition group-hover:opacity-100" />
        <span className="[writing-mode:vertical-rl] text-[11px] tracking-wide">Chat{streaming ? " ·" : ""}</span>
        {streaming ? <Loader2 className="size-3.5 animate-spin text-arc" /> : null}
      </button>
    );
  }

  return (
    // Transparent, like the left history sidebar — pairs sit ON the app background;
    // only the SELECTED pair lifts into an elevated card.
    <div className="flex h-full flex-col bg-transparent">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/50 px-3">
        <span className="text-[12px] font-medium text-muted-foreground">Chat</span>
        <button onClick={onToggle} title="Hide" aria-label="Hide chat" className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"><PanelRightClose className="size-4" /></button>
      </div>
      {/* Cursor-style transcript: one wrapper per turn so each user prompt pins
          (sticky) while its response scrolls beneath, then the next takes over. */}
      <div ref={scrollRef} onScroll={onScroll} className="takt-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-1.5">
        {rows.map((r) => r.kind === "live"
          ? <LiveSessionCard key={r.turns[0]!.userId} turns={r.turns} live={streaming && r.index + r.turns.length === turns.length}
              selectedUserId={selectedUserId} onSelectTurn={onSelectTurn} onOpenSource={onOpenSource} />
          : <TurnCard key={r.turn.userId} turn={r.turn}
              selected={selectedUserId ? r.turn.userId === selectedUserId : r.index === turns.length - 1}
              streaming={streaming && r.index === turns.length - 1} isLatest={r.index === turns.length - 1}
              onSelect={() => onSelectTurn(r.turn.userId)} onOpenSource={onOpenSource}
              onRegenerate={onRegenerate} onCitation={onCitation} />)}
        {turns.length === 0 && <p className="px-2 pt-3 text-[12px] text-faint">No turns yet.</p>}
        <div className="h-2" />
      </div>
    </div>
  );
}

// One turn: a pinned user prompt + the assistant's answer, rendered as
// chronological SEGMENTS — consecutive reasoning+tool runs collapse into one
// "work" block, prose renders as its own block, in the exact order they streamed.
function TurnCard({ turn, selected, streaming, isLatest, onSelect, onOpenSource, onRegenerate, onCitation }: {
  turn: Turn; selected: boolean; streaming: boolean; isLatest: boolean;
  onSelect: () => void; onOpenSource: (s: { page: number; url: string; caption?: string }) => void; onRegenerate?: () => void; onCitation?: (page: number) => void;
}) {
  const [copied, setCopied] = useState(false);
  const parts = turn.assistant?.parts ?? [];
  const sources = parts.filter((p): p is PageImagePart => p.kind === "page_image");
  const replyText = parts.filter((p): p is TextPart => p.kind === "text").map((p) => p.text).join("");
  const hasArtifact = parts.some((p) => p.kind === "ui");
  const showThinking = streaming && parts.every((p) => p.kind !== "text" && p.kind !== "reasoning" && p.kind !== "tool");

  // Build the ordered segments (work | text). page_image/ui/ask don't segment —
  // sources render as chips below; ui is the canvas; ask is a modal.
  type Segment = { kind: "work"; parts: Part[] } | { kind: "text"; part: TextPart };
  const segments: Segment[] = [];
  for (const part of parts) {
    if (part.kind === "reasoning" || part.kind === "tool") {
      const last = segments[segments.length - 1];
      if (last?.kind === "work") last.parts.push(part);
      else segments.push({ kind: "work", parts: [part] });
    } else if (part.kind === "text") {
      segments.push({ kind: "text", part });
    }
  }

  const renderLink = ({ href, children }: { href: string; children: ReactNode }) => {
    if (href.startsWith("takt:cite:")) { const page = Number(href.slice(10)); return (
      <button onClick={() => onCitation?.(page)} className="mx-0.5 inline-flex items-center gap-0.5 rounded border border-border bg-card px-1 py-px align-baseline font-mono text-[10px] text-arc transition hover:border-border-heavy"><ImageIcon className="size-2.5" />{children}</button>
    ); }
    return undefined;
  };

  // Click ANYWHERE on the pair selects it → it lifts and the canvas switches to
  // this turn's artifact. Inner buttons (cite/copy/source) still fire; their
  // click also bubbles to select, which is harmless (it's this pair anyway).
  // No overflow-hidden on the card — it would trap the sticky prompt inside it.
  return (
    <div onClick={onSelect}
      className={cn(
        "group relative cursor-pointer rounded-xl transition-[background-color,box-shadow]",
        // Selected → solid ELEVATED card (as before). Unselected → transparent; the
        // response gets its own dotted 'jar' below.
        selected && "bg-card shadow-[0_6px_28px_-10px_rgba(0,0,0,0.38)] ring-1 ring-border",
      )}>
      {/* CAP — the Cursor-style pinned prompt bubble. Sticky, opaque bg so the
          response scrolls UNDER it; it reads as the jar's lid. */}
      <div className={cn("sticky top-0 z-10 px-1.5 pt-2 pb-1.5 transition-colors", selected ? "rounded-t-xl bg-card" : "bg-background")}>
        <div className={cn(
          "flex items-start gap-2 rounded-lg border px-3 py-2 transition-colors",
          selected
            ? "border-arc/40 bg-arc-soft/50"
            // Resting: clearly visible border. Hover: accent-tinted (a preview of selection).
            : "border-border bg-foreground/[0.04] group-hover:border-arc/45 group-hover:bg-arc-soft/25",
        )}>
          {turn.live && <AudioLines className="mt-[3px] size-3 shrink-0 text-accent" aria-label="voice" />}
          {(() => {
            const { selection: sel, body } = parseSelection(turn.userText);
            return (
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                {sel && (
                  <span className="flex w-fit max-w-full items-center gap-1 rounded-full border border-accent/35 bg-accent-soft/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                    <SquarePen className="size-3 shrink-0 text-accent" />
                    <span className="truncate">Editing “{selectionLabel(sel)}”</span>
                  </span>
                )}
                <span className="line-clamp-4 whitespace-pre-wrap text-[12.5px] font-medium leading-snug text-foreground">{body}</span>
              </span>
            );
          })()}
        </div>
      </div>

      {/* JAR BODY — the answer, wrapped in a dotted border that opens at the top so
          it tucks under the cap and 'attaches back' around the whole response.
          Selected uses the solid card instead, so no dotted border there. */}
      <div className={cn(
        "flex flex-col gap-2 pb-4 pt-2.5 transition-colors",
        selected
          ? "px-3.5"
          // Dotted jar: clearly visible at rest, border turns accent on hover to match the cap.
          : "mx-1.5 -mt-1 rounded-b-lg border-x border-b border-dashed border-border px-3 group-hover:border-arc/45",
      )}>
        {showThinking && <div className="text-[12px]"><span className="arc-shimmer font-medium">Thinking…</span></div>}
        {segments.map((seg, i) => seg.kind === "work"
          ? <WorkBlock key={`work-${i}`} parts={seg.parts} active={streaming && i === segments.length - 1} />
          : <MarkdownBody key={seg.part.id} content={linkifyCites(seg.part.text)} renderLink={renderLink} className="text-[12.5px] leading-[1.55] [&_p]:mb-2 [&_*:last-child]:mb-0" />)}

        {hasArtifact && (
          <span className="inline-flex w-fit items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] text-accent">
            <Boxes className="size-2.5" /> On the canvas
          </span>
        )}
        {sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s) => (
              <button key={s.id} onClick={(e) => { e.stopPropagation(); onOpenSource({ page: s.page, url: s.url, caption: s.caption ?? undefined }); }}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[10.5px] text-arc transition hover:border-border-heavy">
                <ImageIcon className="size-2.5" />p.{s.page}
              </button>
            ))}
          </div>
        )}
        {replyText && !streaming && (
          // Actions reveal on hover (or when the pair is selected).
          <div className={cn("flex items-center gap-0.5 transition-opacity", selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
            <button title="Copy reply" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(replyText); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
              className="grid size-6 place-items-center rounded text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">{copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}</button>
            {isLatest && onRegenerate && (
              <button title="Regenerate" onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
                className="grid size-6 place-items-center rounded text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"><RefreshCw className="size-3" /></button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// One collapsible block for a run of reasoning + tool calls — the turn's "work".
// Expanded live while active, auto-collapses to a one-line summary once the answer
// moves on ("Worked it out · 3 steps"), like the main-branch transcript.
function WorkBlock({ parts, active }: { parts: Part[]; active: boolean }) {
  const [open, setOpen] = useState(false);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) setOpen(false);
    wasActive.current = active;
  }, [active]);
  const expanded = open || active;

  const tools = parts.filter((p): p is ToolPart => p.kind === "tool");
  const hasReasoning = parts.some((p) => p.kind === "reasoning");
  const running = tools.find((t) => t.status === "running");

  return (
    <div className="rounded-lg border border-border bg-card/40">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11.5px] text-muted-foreground transition hover:text-foreground">
        {active ? <Loader2 className="size-3.5 shrink-0 animate-spin text-arc" /> : <Brain className="size-3.5 shrink-0 text-faint" />}
        {active ? (
          <span className="arc-shimmer font-medium">{running ? (TOOL_META[running.tool]?.active ?? "Working…") : "Thinking…"}</span>
        ) : (
          <>
            <span className="font-medium text-foreground/80">Worked it out</span>
            {tools.length > 0 && <span className="text-faint">· {tools.length} step{tools.length === 1 ? "" : "s"}{hasReasoning ? " · reasoned" : ""}</span>}
            {tools.length === 0 && hasReasoning && <span className="text-faint">· reasoned</span>}
          </>
        )}
        <ChevronRight className={cn("ml-auto size-3.5 shrink-0 transition", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
          {parts.map((p) => p.kind === "reasoning"
            ? <div key={p.id} className="border-l-2 border-border pl-2.5 text-[11.5px] leading-[17px] text-muted-foreground whitespace-pre-wrap">{(p as ReasoningPart).text || "…"}</div>
            : p.kind === "tool" ? <ToolRow key={p.id} part={p as ToolPart} /> : null)}
        </div>
      )}
    </div>
  );
}

// A live voice call as ONE card (along with the chat): collapsed shows a "Live"
// pill + turn count; expanded shows the you↔Takt transcript, with the agent's
// working state inside. Clicking a turn brings its canvas artifact to the stage.
function LiveSessionCard({ turns, live, selectedUserId, onSelectTurn, onOpenSource }: {
  turns: Turn[]; live: boolean; selectedUserId: string | null;
  onSelectTurn: (id: string) => void; onOpenSource: (s: { page: number; url: string; caption?: string }) => void;
}) {
  const [open, setOpen] = useState(live);
  const expanded = open || live;
  const artifactCount = turns.reduce((n, t) => n + (t.assistant?.parts.filter((p) => p.kind === "ui").length ?? 0), 0);
  const anySelected = turns.some((t) => t.userId === selectedUserId);
  const agentText = (t: Turn) => (t.assistant?.parts.filter((p): p is TextPart => p.kind === "text").map((p) => p.text).join(" ") ?? "").trim();
  const isWorking = (t: Turn) => !!t.assistant?.streaming || (t.assistant?.parts.some((p) => p.kind === "tool" && p.status === "running") ?? false);

  return (
    <div className={cn("my-1 overflow-hidden rounded-xl border transition", anySelected ? "border-accent/40 bg-accent-soft/40 shadow-[0_6px_28px_-10px_rgba(0,0,0,0.38)]" : "border-accent/20 bg-accent-soft/10")}>
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
            <div key={t.userId}>
              <button onClick={() => onSelectTurn(t.userId)}
                className={cn("block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-foreground/[0.04]", t.userId === selectedUserId && "bg-foreground/[0.05]")}>
                <span className="block text-[12px] font-medium text-foreground">{parseSelection(t.userText).body}</span>
                {agentText(t)
                  ? <span className="mt-0.5 line-clamp-3 block text-[11.5px] text-muted-foreground">{agentText(t)}</span>
                  : isWorking(t) ? <span className="mt-0.5 block text-[11.5px]"><span className="arc-shimmer font-medium">Takt is working…</span></span> : null}
                {t.assistant?.parts.some((p) => p.kind === "ui") && <span className="mt-1 inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent"><Boxes className="size-2.5" /> canvas</span>}
              </button>
              {/* sources pulled during this live turn */}
              {(() => {
                const src = t.assistant?.parts.filter((p): p is PageImagePart => p.kind === "page_image") ?? [];
                if (!src.length) return null;
                return (
                  <div className="mt-1 flex flex-wrap gap-1.5 px-2">
                    {src.map((s) => (
                      <button key={s.id} onClick={() => onOpenSource({ page: s.page, url: s.url, caption: s.caption ?? undefined })}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-arc transition hover:border-border-heavy">
                        <ImageIcon className="size-2.5" />p.{s.page}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
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
      <span className="ml-auto flex items-center gap-1.5">
        {part.detail && !running && <span className="text-faint">{part.detail}</span>}
        {running ? <Loader2 className="size-3.5 animate-spin text-arc" /> : <Check className="size-3.5 text-success" />}
      </span>
    </div>
  );
}
