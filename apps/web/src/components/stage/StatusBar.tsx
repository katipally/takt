"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, ChevronUp, Brain, Search, FileText, ImageIcon, Boxes, Check, Hammer } from "lucide-react";
import type { Node, Part, ToolPart, TodoItem } from "@/lib/chatStore";
import { cn } from "@/lib/cn";

const TOOL_META: Record<string, { active: string; done: string; icon: ReactNode }> = {
  list_profile: { active: "Listing knowledge…", done: "Mapped the product", icon: <FileText className="size-3.5" /> },
  grep_profile: { active: "Searching the docs…", done: "Searched the docs", icon: <Search className="size-3.5" /> },
  read_profile: { active: "Reading the docs…", done: "Read the docs", icon: <FileText className="size-3.5" /> },
  get_page_image: { active: "Opening a page…", done: "Opened a page", icon: <ImageIcon className="size-3.5" /> },
  crop_page_image: { active: "Cropping a page…", done: "Cropped a page", icon: <ImageIcon className="size-3.5" /> },
  emit_ui: { active: "Designing…", done: "Designed the answer", icon: <Boxes className="size-3.5" /> },
  delegate_build: { active: "Handing off a visual…", done: "Delegated the visual", icon: <Hammer className="size-3.5" /> },
  update_todos: { active: "Planning…", done: "Updated the plan", icon: <Check className="size-3.5" /> },
};

// The floating "what's happening now" strip above the composer. Collapsed = one
// live line; click to expand a capped step log + the agent's todo checklist.
// Auto-shows while the latest turn streams (incl. background builds), hides idle.
export function StatusBar({ node, streaming, todos }: { node?: Extract<Node, { role: "assistant" }>; streaming: boolean; todos?: TodoItem[] }) {
  const [open, setOpen] = useState(false);
  const parts = node?.parts ?? [];
  const tools = parts.filter((p): p is ToolPart => p.kind === "tool");
  const running = tools.find((t) => t.status === "running");
  const building = running?.lane === "build" || tools.some((t) => t.tool === "delegate_build");
  const hasWork = parts.some((p) => p.kind === "reasoning" || p.kind === "tool");

  // Only show while the turn is active (or a build is still finishing).
  const visible = streaming && (hasWork || !!node?.status || !!todos?.length);
  useEffect(() => { if (!streaming) setOpen(false); }, [streaming]);
  if (!visible) return null;

  const line = node?.status
    ?? (running ? (TOOL_META[running.tool]?.active ?? "Working…") : building ? "Building a visual…" : "Thinking…");

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-3xl px-5">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
        className="overflow-hidden rounded-xl border border-border bg-card/95 shadow-[var(--shadow-card)] backdrop-blur">
        <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px]">
          <Loader2 className="size-3.5 shrink-0 animate-spin text-arc" />
          <span className="arc-shimmer min-w-0 flex-1 truncate font-medium">{line}</span>
          {tools.length > 0 && <span className="shrink-0 text-faint">{tools.filter((t) => t.status === "done").length}/{tools.length}</span>}
          <ChevronUp className={cn("size-3.5 shrink-0 text-muted-foreground transition", !open && "rotate-180")} />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="takt-scroll max-h-[38vh] overflow-y-auto border-t border-border px-3 py-2">
                {todos?.length ? (
                  <ul className="mb-2 space-y-1">
                    {todos.map((t, i) => (
                      <li key={i} className="flex items-center gap-2 text-[12.5px]">
                        <span className={cn("grid size-4 shrink-0 place-items-center rounded-[5px] border", t.done ? "border-success bg-success/15 text-success" : "border-border-heavy")}>
                          {t.done && <Check className="size-3" />}
                        </span>
                        <span className={cn(t.done ? "text-muted-foreground line-through" : "text-foreground")}>{t.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="space-y-1">
                  {parts.map((p) => p.kind === "reasoning"
                    ? <div key={p.id} className="border-l-2 border-border pl-2.5 text-[11.5px] leading-[17px] text-muted-foreground whitespace-pre-wrap">{p.text || "…"}</div>
                    : p.kind === "tool" ? <ToolRow key={p.id} part={p} /> : null)}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function ToolRow({ part }: { part: ToolPart }) {
  const meta = TOOL_META[part.tool] ?? { active: part.tool, done: part.tool, icon: <Search className="size-3.5" /> };
  const running = part.status === "running";
  return (
    <div className="flex items-center gap-2 rounded-md px-1 py-0.5 text-[11.5px] text-muted-foreground">
      {part.lane === "build" ? <Hammer className={cn("size-3.5", running ? "text-arc" : "text-faint")} /> : <span className={cn("text-faint", running && "text-arc")}>{meta.icon}</span>}
      <span className={cn(running ? "arc-shimmer font-medium" : "text-foreground/80")}>{running ? meta.active : meta.done}</span>
      {part.lane === "build" && <span className="rounded bg-arc-soft px-1 text-[10px] text-arc">build</span>}
      {part.summary && <span className="truncate text-faint">· {part.summary}</span>}
      <span className="ml-auto">{running ? <Loader2 className="size-3.5 animate-spin text-arc" /> : <Check className="size-3.5 text-success" />}</span>
    </div>
  );
}
