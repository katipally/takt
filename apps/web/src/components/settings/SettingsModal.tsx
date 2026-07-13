"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useUi } from "@/lib/uiStore";
import { ModelsSettings } from "./ModelsSettings";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

// User settings — a modal, not a page. Just the model choices + reasoning effort
// + theme. API keys, ingestion, and product control live in the admin console
// (/admin, typed URL only). Mounted once in the app shell.
export function SettingsModal() {
  const open = useUi((s) => s.settingsOpen);
  const close = useUi((s) => s.closeSettings);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-3">
            <h2 className="text-[15px] font-semibold">Settings</h2>
            <ThemeToggle />
          </div>
          <button onClick={close} aria-label="Close settings" className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 takt-scroll">
          <ModelsSettings admin={false} />
        </div>
      </div>
    </div>
  );
}
