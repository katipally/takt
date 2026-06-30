"use client";

import { ChevronLeft, ChevronRight, GitBranch } from "lucide-react";
import type { BranchInfo } from "@/lib/chatStore";

export function BranchNav({ info, onPrev, onNext }: { info: BranchInfo; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md text-[11px] text-muted-foreground" title="This message was edited — switch between versions">
      <GitBranch className="mr-0.5 size-3 text-faint" />
      <button onClick={onPrev} className="grid size-5 place-items-center rounded transition hover:bg-foreground/10 hover:text-foreground"><ChevronLeft className="size-3.5" /></button>
      <span className="tabular-nums">{info.index + 1}/{info.total}</span>
      <button onClick={onNext} className="grid size-5 place-items-center rounded transition hover:bg-foreground/10 hover:text-foreground"><ChevronRight className="size-3.5" /></button>
    </div>
  );
}
