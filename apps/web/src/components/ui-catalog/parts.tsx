"use client";

import type { ReactNode } from "react";

// A framed figure with an optional caption bar — the shared wrapper for media,
// charts, and diagrams so they all read as one on-brand system.
export function Figure({ caption, children, flush }: { caption?: string; children: ReactNode; flush?: boolean }) {
  return (
    <figure className="my-0 overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)]">
      <div className={flush ? "" : "p-3"}>{children}</div>
      {caption ? (
        <figcaption className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full bg-arc" />
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
