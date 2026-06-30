"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronsUpDown, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { dropdown } from "@/lib/motion";
import { cn } from "@/lib/cn";

// Fluid product switcher. `panel` = the bordered card used in the sidebar;
// `bar` = the compact pill used in the chat header (Image #2, top-left).
export function ProductSwitcher({ currentSlug, variant = "panel" }: {
  currentSlug: string; variant?: "panel" | "bar";
}) {
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.products });
  const current = products.find((p) => p.slug === currentSlug);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const Thumb = ({ slug, name, size }: { slug?: string; name?: string; size: number }) => {
    const p = products.find((x) => x.slug === slug) ?? current;
    return (
      <span className="grid shrink-0 place-items-center overflow-hidden rounded-md bg-surface" style={{ width: size, height: size }}>
        {p?.heroPath
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={`/assets/${p.heroPath}`} alt="" className="size-full object-cover" />
          : <span className="text-[11px] font-semibold text-muted-foreground">{(name ?? p?.name ?? "?").charAt(0)}</span>}
      </span>
    );
  };

  return (
    <div ref={ref} className="relative">
      {variant === "panel" ? (
        <button onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition hover:border-border-heavy">
          <Thumb size={28} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-foreground">{current?.name ?? "Select product"}</div>
            {current?.manufacturer && <div className="truncate text-[11px] text-muted-foreground">{current.manufacturer}</div>}
          </div>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <button onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-foreground/[0.06]">
          <Thumb size={22} />
          <span className="max-w-[40vw] truncate text-[13px] font-medium text-foreground sm:max-w-xs">{current?.name ?? "Select product"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div variants={dropdown} initial="hidden" animate="show" exit="exit"
            className="absolute left-0 top-full z-40 mt-1.5 min-w-[240px] origin-top-left overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-[var(--shadow-card)]">
            {products.map((p) => (
              <Link key={p.id} href={`/${p.slug}`} onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-foreground/[0.06]">
                <Thumb slug={p.slug} name={p.name} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-foreground">{p.name}</div>
                  {p.manufacturer && <div className="truncate text-[11px] text-muted-foreground">{p.manufacturer}</div>}
                </div>
                {p.slug === current?.slug && <Check className="size-3.5 shrink-0 text-accent" />}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
