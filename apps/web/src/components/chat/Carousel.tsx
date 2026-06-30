"use client";

import { useRef, useState, useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

// Horizontal scroller with snap + arrow controls that appear on overflow.
export function Carousel({ label, children }: { label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setOverflow(el.scrollWidth > el.clientWidth + 4);
    setAtStart(el.scrollLeft < 8);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 8);
  };
  useEffect(() => { measure(); }, []);

  const scrollBy = (dir: -1 | 1) => ref.current?.scrollBy({ left: dir * 280, behavior: "smooth" });

  return (
    <div className="group/car relative">
      {label && <div className="mb-1.5 px-0.5 text-[11px] uppercase tracking-wide text-faint">{label}</div>}
      <div ref={ref} onScroll={measure}
        className="prox-scroll flex snap-x gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {overflow && !atStart && (
        <Arrow side="left" onClick={() => scrollBy(-1)} />
      )}
      {overflow && !atEnd && (
        <Arrow side="right" onClick={() => scrollBy(1)} />
      )}
    </div>
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn(
        "absolute top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/90 text-muted-foreground opacity-0 shadow-lg backdrop-blur transition hover:text-foreground group-hover/car:opacity-100",
        side === "left" ? "left-1" : "right-1",
      )}>
      {side === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
    </button>
  );
}
