"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Settings, ArrowRight, Sparkles, ArrowUpRight, Plus } from "lucide-react";
import gsap from "gsap";
import type { Product } from "@prox/shared";
import { api } from "@/lib/api";
import { STARTERS } from "@/lib/starters";
import { spring, easeOut } from "@/lib/motion";
import { Wordmark } from "@/components/brand/Wordmark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { useUi } from "@/lib/uiStore";
import { cn } from "@/lib/cn";

export default function Home() {
  const { data: products = [], isLoading } = useQuery({ queryKey: ["products"], queryFn: api.products });
  const openSettings = useUi((s) => s.openSettings);
  const [active, setActive] = useState(0);
  // The "+ Add product" pill already signals more can be uploaded, so show each
  // product once (no duplicate pill for a single-product catalog).
  const display = products;
  const product = display[Math.min(active, display.length - 1)];

  return (
    <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-6">
      <header className="flex items-center justify-between py-5">
        <Link href="/" className="transition hover:opacity-70"><Wordmark size="md" /></Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button onClick={() => openSettings("models")} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground">
            <Settings className="size-4" /> Settings
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="mt-8 h-[420px] animate-pulse rounded-2xl border border-border bg-card" />
      ) : products.length === 0 ? (
        <EmptyState />
      ) : (
        <Showcase products={display} active={active} setActive={setActive} product={product!} />
      )}
      <SettingsModal />
    </main>
  );
}

function AddProductPill() {
  const openSettings = useUi((s) => s.openSettings);
  return (
    <button onClick={() => openSettings("products")} title="Add a product"
      className="flex items-center gap-1.5 rounded-full border border-dashed border-border-heavy px-3 py-2.5 text-[13px] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground">
      <Plus className="size-4" /> Add product
    </button>
  );
}

function Showcase({ products, active, setActive, product }: {
  products: Product[]; active: number; setActive: (i: number) => void; product: Product;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const scope = useRef<HTMLDivElement>(null);

  // One gentle entrance: header is outside, so reveal selector → card → questions.
  useLayoutEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(scope.current!.querySelectorAll("[data-reveal]"), {
        y: 14, opacity: 0, duration: 0.5, stagger: 0.08, ease: "power3.out",
      });
    });
    return () => mm.revert();
  }, []);

  const ask = (q: string) => router.push(`/${product.slug}?q=${encodeURIComponent(q)}`);
  const prompts = product.starters?.length ? product.starters : STARTERS;

  return (
    <div ref={scope} className="flex flex-1 flex-col pb-12">
      {/* Fluid product selector */}
      <div data-reveal className="flex flex-wrap items-center gap-2">
        {products.map((p, i) => (
          <button key={`${p.id}-${i}`} onClick={() => setActive(i)}
            className="relative flex items-center gap-2.5 rounded-full px-3 py-1.5 text-left transition">
            {i === active && (
              <motion.span layoutId="pill-highlight" transition={reduce ? { duration: 0 } : spring}
                className="absolute inset-0 rounded-full border border-border-heavy bg-card shadow-[var(--shadow-card)]" />
            )}
            <span className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-surface">
              {p.heroPath
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/assets/${p.heroPath}`} alt="" className="size-full object-cover" />
                : <span className="text-[11px] font-semibold text-muted-foreground">{p.name.charAt(0)}</span>}
            </span>
            <span className="relative min-w-0">
              {p.manufacturer && <span className="block text-[10px] uppercase tracking-wide text-faint leading-none">{p.manufacturer}</span>}
              <span className={cn("block truncate text-[13px] leading-tight transition-colors", i === active ? "font-medium text-foreground" : "text-muted-foreground")}>{p.name}</span>
            </span>
          </button>
        ))}
        <AddProductPill />
      </div>

      {/* Browser-chrome showcase card */}
      <div data-reveal className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="flex gap-1.5">
            <span className="size-3 rounded-full bg-foreground/15" />
            <span className="size-3 rounded-full bg-foreground/15" />
            <span className="size-3 rounded-full bg-foreground/15" />
          </span>
          <div className="mx-auto flex items-center rounded-md bg-surface px-3 py-1 text-[12px] text-muted-foreground">
            useprox.com/agent/{product.slug}
          </div>
          <Link href={`/${product.slug}`} title="Open the agent" className="grid size-7 place-items-center rounded-md text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
        <Link href={`/${product.slug}`} className="block">
          {/* Adaptive hero: a blurred fill of the same image sits behind a
              contained foreground, so ANY aspect ratio reads as intentional
              (no flat-gray letterbox bars). Square, wide, or tall all work. */}
          <div className="relative h-[340px] overflow-hidden bg-surface">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={active}
                initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
                transition={easeOut}
                className="absolute inset-0">
                {product.heroPath ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/assets/${product.heroPath}`} alt="" aria-hidden
                      className="absolute inset-0 size-full scale-125 object-cover opacity-35 blur-2xl" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/assets/${product.heroPath}`} alt={product.name}
                      className="relative z-10 mx-auto h-full w-full object-contain p-8" />
                  </>
                ) : (
                  <span className="grid size-full place-items-center text-[64px] font-semibold text-faint">{product.name.charAt(0)}</span>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </Link>
      </div>

      {/* Eyebrow + title */}
      <div data-reveal className="mt-4 flex items-baseline gap-3">
        {product.manufacturer && <span className="text-[11px] uppercase tracking-[0.14em] text-faint">{product.manufacturer}</span>}
        <h1 className="text-[22px] font-semibold tracking-tight">{product.name}</h1>
      </div>

      {/* Suggested questions */}
      <div data-reveal className="mt-7">
        <div className="mb-2.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-faint">
          <Sparkles className="size-3.5" /> Suggested questions
        </div>
        <div className="flex flex-col gap-2">
          {prompts.map((q) => (
            <button key={q} onClick={() => ask(q)}
              className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left text-[14px] text-foreground transition hover:-translate-y-0.5 hover:border-border-heavy hover:shadow-[var(--shadow-card)]">
              <span>{q}</span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </button>
          ))}
          <AskBar onAsk={ask} />
        </div>
      </div>
    </div>
  );
}

function AskBar({ onAsk }: { onAsk: (q: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) onAsk(value.trim()); }}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition focus-within:border-border-heavy hover:border-border-heavy">
      <input value={value} onChange={(e) => setValue(e.target.value)} name="question" aria-label="Ask your own question" placeholder="Or ask your own question…"
        className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-faint" />
      <button type="submit" aria-label="Ask" className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
        <ArrowRight className="size-4" />
      </button>
    </form>
  );
}

function EmptyState() {
  const openSettings = useUi((s) => s.openSettings);
  return (
    <div className="mt-10 max-w-xl">
      <h1 className="text-[24px] font-semibold tracking-tight">No products yet</h1>
      <p className="mt-2 text-[14px] text-muted-foreground">Add a product by uploading its manuals — Prox indexes them and it shows up here instantly.</p>
      <button onClick={() => openSettings("products")}
        className="mt-4 flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2.5 text-[13px] font-medium text-background transition hover:opacity-90">
        <Plus className="size-4" /> Add product
      </button>
      <p className="mt-6 text-[12.5px] text-muted-foreground">Or from the command line:</p>
      <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-surface p-4 font-mono text-[12px] text-foreground prox-scroll">pnpm ingest --product vulcan-omnipro-220 --name &quot;Vulcan OmniPro 220&quot; --manufacturer &quot;Vulcan&quot; --dir ../files</pre>
    </div>
  );
}
