"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import type { CanvasSource } from "@/lib/chatStore";
import { overlay, modal } from "@/lib/motion";
import { cn } from "@/lib/cn";

const MANUAL_LABEL: Record<string, string> = {
  owner: "Owner's manual", quick_start: "Quick-start", selection_chart: "Selection chart", other: "Manual",
};

// Manual pages (sources) open here, not in the canvas. Click a source card or a
// citation chip to view the page; prev/next walks the manual.
export function SourceModal({ source, onClose, onNavigate }: {
  source: CanvasSource | undefined;
  onClose: () => void;
  onNavigate: (page: number) => void;
}) {
  const [zoom, setZoom] = useState(false);
  return (
    <AnimatePresence>
      {source && (
        <motion.div variants={overlay} initial="hidden" animate="show" exit="exit"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={onClose}>
          <motion.div variants={modal} onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
            <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-foreground">{MANUAL_LABEL[source.manualKind] ?? source.manualTitle ?? "Manual"}</div>
                <div className="text-[11px] text-muted-foreground">Page {source.page}</div>
              </div>
              <div className="flex items-center gap-1">
                <IconBtn onClick={() => onNavigate(Math.max(1, source.page - 1))}><ChevronLeft className="size-4" /></IconBtn>
                <IconBtn onClick={() => onNavigate(source.page + 1)}><ChevronRight className="size-4" /></IconBtn>
                <IconBtn onClick={() => setZoom((z) => !z)}>{zoom ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}</IconBtn>
                <IconBtn onClick={onClose} aria-label="Close"><X className="size-4" /></IconBtn>
              </div>
            </header>
            <div className={cn("prox-scroll min-h-0 flex-1 overflow-auto p-3")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source.url} alt={`Manual page ${source.page}`}
                className={cn("mx-auto rounded-lg border border-border bg-white", zoom ? "max-w-none" : "w-full")}
                style={zoom ? { width: "150%" } : undefined} />
            </div>
            {source.caption && (
              <details className="border-t border-border px-4 py-2.5">
                <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">What this page says</summary>
                <p className="mt-2 whitespace-pre-wrap text-[12px] leading-[18px] text-muted-foreground">{source.caption}</p>
              </details>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function IconBtn({ onClick, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button onClick={onClick} {...rest}
      className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
      {children}
    </button>
  );
}
