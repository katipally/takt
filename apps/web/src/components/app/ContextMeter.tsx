"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Gauge, AlertCircle } from "lucide-react";
import type { Usage } from "@/lib/chatStore";
import { api } from "@/lib/api";
import { metaFor, formatTokens, formatCost } from "@/lib/models";
import { cn } from "@/lib/cn";

// Live context-window usage + running cost for the active chat, sized to the
// selected model's real context window and per-token pricing.
export function ContextMeter({ usage }: { usage: Usage }) {
  const { data: settings, isLoading } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const { data: models = [] } = useQuery({ queryKey: ["models", settings?.chatProviderId], queryFn: () => api.models(settings?.chatProviderId), enabled: !!settings });
  const meta = metaFor(settings?.chatModel);
  const modelName = models.find((m) => m.id === settings?.chatModel)?.display_name ?? settings?.chatModel;

  const pct = Math.min(100, (usage.contextTokens / meta.contextWindow) * 100);
  const high = pct > 80;

  // No model configured yet — say so plainly and route to the admin console.
  if (!isLoading && !settings?.chatModel) {
    return (
      <Link href="/admin" title="Choose a model in the admin console"
        className="flex items-center gap-1.5 rounded-full border border-arc/40 bg-arc-soft px-3 py-1.5 text-[12px] font-medium text-arc transition hover:border-arc/70">
        <AlertCircle className="size-3.5" /> No model selected
      </Link>
    );
  }

  // Always show the model + live context usage; click opens the admin console.
  return (
    <Link href="/admin"
      title={`${modelName ?? "Model"} · ${formatTokens(usage.contextTokens)} of ${formatTokens(meta.contextWindow)} context · ${formatCost(usage.costUsd)}`}
      className="flex items-center gap-2.5 rounded-full border border-border bg-card px-2.5 py-1.5 transition hover:border-border-heavy hover:bg-foreground/[0.04]">
      <Gauge className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="hidden flex-col gap-1 sm:flex">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="max-w-[140px] truncate font-medium text-foreground/80">{modelName ?? "Model"}</span>
          <span className="text-faint">·</span>
          <span className="tabular-nums">{formatTokens(usage.contextTokens)}/{formatTokens(meta.contextWindow)}</span>
          <span className="text-faint">·</span>
          <span className="tabular-nums">{formatCost(usage.costUsd)}</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
          <div className={cn("h-full rounded-full transition-all", high ? "bg-destructive" : "bg-accent")} style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
      </div>
      <span className="max-w-[120px] truncate text-[11px] text-muted-foreground sm:hidden">{modelName ?? "Model"}</span>
    </Link>
  );
}
