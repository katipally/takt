"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2, AlertCircle } from "lucide-react";
import { BUILTIN_PROVIDERS } from "@takt/harness/registry";
import { modelVision } from "@takt/shared";
import { api, type AppSettings } from "@/lib/api";
import { cn } from "@/lib/cn";

const PROVIDERS = BUILTIN_PROVIDERS.map((p) => ({ id: p.id, name: p.name }));
const sel = "min-w-0 rounded-lg border border-border bg-surface px-2 py-1.5 text-[12px] text-foreground outline-none focus:border-border-heavy";

// Live settings ride takt's existing /api/settings surface (api.settings /
// api.updateSettings); the route whitelists liveProviderId/liveModel/liveEffort.
type LiveSettings = AppSettings & { liveProviderId?: string; liveModel?: string };

// Compact provider + model picker for the lobby, so you can switch fast without
// opening full Settings. Writes the same liveProviderId / liveModel settings.
export function ModelQuickPick({ onOpenSettings }: { onOpenSettings: () => void }) {
  const qc = useQueryClient();
  const { data: providers = [] } = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => api.settings() as Promise<LiveSettings> });

  const providerId = settings?.liveProviderId ?? providers.find((p) => p.isDefault)?.kind ?? providers[0]?.kind ?? PROVIDERS[0]!.id;
  const { data: models = [] } = useQuery({ queryKey: ["models", providerId], queryFn: () => api.models(providerId), enabled: !!providerId });
  const row = providers.find((p) => p.kind === providerId);
  const hasKey = row?.hasKey;

  const save = useMutation({
    mutationFn: (b: Record<string, string>) => api.updateSettings(b as Partial<AppSettings>),
    onSuccess: (s) => qc.setQueryData(["settings"], s),
  });

  const effort = settings?.effort ?? "auto";
  // Warn only on KNOWN-blind models (the curated live table / per-provider
  // heuristic in @takt/shared) — the camera is pointless with a blind model.
  const blind = !!settings?.liveModel && !modelVision(providerId, settings.liveModel);

  return (
    <div className="flex w-full max-w-xs flex-col gap-2 rounded-xl border border-border bg-surface/60 p-2.5">
      <div className="flex items-center gap-2">
        <select name="live-provider" aria-label="Live provider" className={cn(sel, "shrink-0")} value={providerId} onChange={(e) => save.mutate({ liveProviderId: e.target.value, liveModel: "" })}>
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="live-model" aria-label="Live model" className={cn(sel, "flex-1")} value={settings?.liveModel ?? ""} onChange={(e) => save.mutate({ liveModel: e.target.value })}>
          <option value="">{models.length ? "Recommended" : hasKey ? "Loading…" : "Add a key →"}</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
        <button onClick={onOpenSettings} title="Settings" aria-label="Open settings"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
          <Settings2 className="size-4" />
        </button>
      </div>
      <div className="flex items-center justify-between px-0.5 text-[11px] text-faint">
        <span>Effort: <span className="capitalize text-muted-foreground">{effort}</span></span>
        {!hasKey
          ? <span className="inline-flex items-center gap-1 text-arc"><AlertCircle className="size-3" /> no API key yet</span>
          : blind ? <span className="inline-flex items-center gap-1 text-arc"><AlertCircle className="size-3" /> can’t see — pick a vision model</span> : null}
      </div>
    </div>
  );
}
