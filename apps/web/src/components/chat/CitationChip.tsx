"use client";

import { FileText } from "lucide-react";

export function CitationChip({ page, onClick }: { page: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mx-0.5 inline-flex translate-y-[1px] items-center gap-1 rounded-md border border-accent/30 bg-accent-soft px-1.5 py-0.5 align-baseline text-[11px] font-medium text-accent transition hover:border-accent/60 hover:bg-accent/20"
      title={`Open manual page ${page}`}
    >
      <FileText className="size-3" />
      p.{page}
    </button>
  );
}
