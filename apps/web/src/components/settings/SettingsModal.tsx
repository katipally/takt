"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useUi } from "@/lib/uiStore";
import ModelsSettings from "@/app/settings/providers/page";
import ProductsSettings from "@/app/settings/products/page";
import { overlay, modal } from "@/lib/motion";
import { cn } from "@/lib/cn";

const TABS = [
  { id: "models", label: "Models & API" },
  { id: "products", label: "Products" },
] as const;

export function SettingsModal() {
  const open = useUi((s) => s.settingsOpen);
  const close = useUi((s) => s.closeSettings);
  const settingsTab = useUi((s) => s.settingsTab);
  const [tab, setTab] = useState<"models" | "products">("models");

  // Honor the tab requested by openSettings(tab) each time the modal opens.
  useEffect(() => { if (open) setTab(settingsTab); }, [open, settingsTab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div variants={overlay} initial="hidden" animate="show" exit="exit"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={close}>
          <motion.div variants={modal} className="flex h-[80vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-background shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-border bg-surface p-3">
          <div className="px-2 pb-2 text-[14px] font-semibold">Settings</div>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("rounded-lg px-3 py-2 text-left text-[13px] transition",
                tab === t.id ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </nav>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-12 shrink-0 items-center justify-end border-b border-border px-3">
                <button onClick={close} className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"><X className="size-4" /></button>
              </div>
              <div className="prox-scroll min-h-0 flex-1 overflow-y-auto p-6">
                {tab === "models" ? <ModelsSettings /> : <ProductsSettings />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
