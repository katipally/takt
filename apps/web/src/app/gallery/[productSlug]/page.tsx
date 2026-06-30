"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Boxes, X, PanelLeftOpen } from "lucide-react";
import { overlay, modal } from "@/lib/motion";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { api } from "@/lib/api";
import { ArtifactFrame } from "@/components/canvas/ArtifactFrame";
import { Sidebar } from "@/components/app/Sidebar";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { Wordmark } from "@/components/brand/Wordmark";
import { useUi } from "@/lib/uiStore";

export default function Gallery({ params }: { params: Promise<{ productSlug: string }> }) {
  const { productSlug } = use(params);
  const router = useRouter();
  const { data: artifacts = [] } = useQuery({ queryKey: ["artifacts", productSlug], queryFn: () => api.artifacts(productSlug) });
  const [open, setOpen] = useState<{ id: string; title: string } | null>(null);
  const { sidebarWidth, sidebarCollapsed, toggleSidebar } = useUi();
  const reduce = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, !!open, () => setOpen(null));

  return (
    <div className="flex h-dvh w-full gap-2 overflow-hidden bg-background p-2">
      <motion.div
        initial={false}
        animate={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 40 }}
        className="h-full shrink-0 overflow-hidden">
        <div style={{ width: sidebarWidth }} className="h-full">
          <Sidebar currentSlug={productSlug} activeChatId=""
            onNewChat={() => router.push(`/${productSlug}`)}
            onSelectChat={(id) => router.push(`/${productSlug}?chat=${id}`)} />
        </div>
      </motion.div>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          {sidebarCollapsed && (
            <>
              <button onClick={toggleSidebar} title="Open sidebar" className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
                <PanelLeftOpen className="size-4" />
              </button>
              <Link href="/" title="All products" className="transition hover:opacity-70"><Wordmark size="sm" /></Link>
              <span className="h-4 w-px bg-border" />
            </>
          )}
          <h1 className="text-[14px] font-semibold">Artifact gallery</h1>
        </header>

        <div className="prox-scroll min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-6 py-8">
            {artifacts.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <Boxes className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-[13px] font-medium text-foreground">No artifacts yet</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Ask the agent something that needs a calculator, configurator, or diagram — say
                  {" "}<Link href={`/${productSlug}?q=${encodeURIComponent("Build me a duty-cycle calculator for MIG on 240V")}`} className="text-accent underline-offset-2 hover:underline">&ldquo;build a duty-cycle calculator&rdquo;</Link>{" "}
                  — and it&apos;ll render here, live.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {artifacts.map((a) => (
                  <button key={a.id} onClick={() => setOpen({ id: a.id, title: a.title })}
                    className="flex aspect-[4/3] flex-col justify-between rounded-2xl border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-border-heavy hover:bg-foreground/[0.03]">
                    <Boxes className="size-5 text-accent" />
                    <div>
                      <div className="line-clamp-2 text-[13px] font-medium text-foreground">{a.title}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{a.kind} · {new Date(a.createdAt).toLocaleDateString()}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {open && (
          <motion.div variants={overlay} initial="hidden" animate="show" exit="exit"
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={() => setOpen(null)}>
            <motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label={open.title} tabIndex={-1}
              variants={modal} className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface outline-none" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="text-[13px] font-medium">{open.title}</div>
                <button onClick={() => setOpen(null)} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"><X className="size-4" /></button>
              </div>
              <div className="prox-scroll overflow-y-auto p-4"><ArtifactFrame artifactId={open.id} /></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsModal />
    </div>
  );
}
