"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Check, Trash2, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { metaFor } from "@/lib/models";
import { cn } from "@/lib/cn";

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-faint focus:border-border-heavy";

export function ModelsSettings() {
  const qc = useQueryClient();
  const { data: providers = [] } = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const { data: models = [] } = useQuery({ queryKey: ["models"], queryFn: api.models });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const anthropic = providers.find((p) => p.kind === "anthropic");
  const meta = metaFor(settings?.chatModel);

  const [key, setKey] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["providers"] }); qc.invalidateQueries({ queryKey: ["models"] }); };
  const saveKey = useMutation({
    mutationFn: () => api.updateProviderKey(anthropic!.id, key.trim()),
    onSuccess: () => { setKey(""); refresh(); },
  });
  const removeKey = useMutation({
    mutationFn: () => api.removeProviderKey(anthropic!.id),
    onSuccess: refresh,
  });
  const saveSetting = useMutation({
    mutationFn: (b: Record<string, string>) => api.updateSettings(b),
    onSuccess: (s) => qc.setQueryData(["settings"], s),
  });

  // Changing the model: if the current effort isn't valid for it (e.g. Haiku
  // has no "max"), reset to a supported one so the selector never shows a
  // phantom selection and the agent never gets an unsupported effort.
  const changeModel = (id: string) => {
    const efforts = metaFor(id).efforts;
    const patch: Record<string, string> = { chatModel: id };
    if (settings?.effort && !efforts.includes(settings.effort)) {
      patch.effort = efforts.includes("medium") ? "medium" : efforts[efforts.length - 1]!;
    }
    saveSetting.mutate(patch);
  };

  return (
    <div className="flex flex-col gap-9">
      <section>
        <h2 className="text-[15px] font-semibold">Anthropic API key</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Prox runs on Claude. The key is encrypted at rest — only the last 4 digits are ever shown.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] text-muted-foreground">
            {anthropic?.hasKey
              ? <><Check className="size-3.5 text-[var(--prox-success,#16a34a)]" /> Key set · ••••{anthropic.keyLast4}</>
              : "No key set"}
          </div>
          <input value={key} onChange={(e) => setKey(e.target.value)} type="password" name="anthropic-api-key"
            placeholder="Paste key (sk-ant-…)" aria-label="Anthropic API key"
            onKeyDown={(e) => { if (e.key === "Enter" && key.trim()) saveKey.mutate(); }}
            className="w-56 rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] text-foreground outline-none focus:border-border-heavy" />
          <button onClick={() => saveKey.mutate()} disabled={!key.trim() || !anthropic || saveKey.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[13px] font-medium text-background transition hover:opacity-90 disabled:opacity-30">
            {saveKey.isSuccess ? <Check className="size-4" /> : <KeyRound className="size-4" />} Save
          </button>
          {anthropic?.hasKey && (
            <button onClick={() => removeKey.mutate()} disabled={removeKey.isPending} title="Remove the stored key"
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground">
              <Trash2 className="size-4" /> Remove
            </button>
          )}
        </div>
        {saveKey.isError && <p className="mt-2 text-[12px] text-destructive">{(saveKey.error as Error).message}</p>}

        {/* No login → this key is stored once for the whole Space and used by
            anyone who can open it. Make that explicit. */}
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[12px] text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--prox-arc,#e2701f)]" />
          <span>This key is shared by everyone who can open this Space (there&apos;s no login). Use a spend-limited key, remove it when you&apos;re done, or run a private copy — see the note below.</span>
        </div>
      </section>

      <section>
        <label htmlFor="chat-model" className="text-[15px] font-semibold">Chat model</label>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Fetched live from your Anthropic account. Used to answer questions.</p>
        <select id="chat-model" className={cn(inputCls, "mt-3 max-w-md")} value={settings?.chatModel ?? ""}
          onChange={(e) => changeModel(e.target.value)}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
          <span>Context <b className="text-foreground">{(meta.contextWindow / 1_000_000 >= 1 ? `${meta.contextWindow / 1_000_000}M` : `${meta.contextWindow / 1000}k`)}</b></span>
          <span>Max output <b className="text-foreground">{meta.maxOutput / 1000}k</b></span>
          <span>Input <b className="text-foreground">${meta.inputPrice}/M</b></span>
          <span>Output <b className="text-foreground">${meta.outputPrice}/M</b></span>
        </div>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold">Reasoning effort</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Higher effort lets Claude think longer before answering. You can watch the reasoning unfold in the chat. Levels adapt to the selected model.</p>
        <div className="mt-3 inline-flex rounded-lg border border-border bg-card p-1">
          {meta.efforts.map((e) => (
            <button key={e} onClick={() => saveSetting.mutate({ effort: e })}
              className={cn("rounded-md px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition",
                settings?.effort === e
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground")}>
              {e}
            </button>
          ))}
        </div>
      </section>

      <section>
        <label htmlFor="caption-model" className="text-[15px] font-semibold">Ingestion model</label>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          The vision model that reads each manual page when you add a product — transcribing tables and describing diagrams so they become searchable.
        </p>
        <select id="caption-model" className={cn(inputCls, "mt-3 max-w-md")} value={settings?.captionModel ?? ""}
          onChange={(e) => saveSetting.mutate({ captionModel: e.target.value })}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
      </section>
    </div>
  );
}
