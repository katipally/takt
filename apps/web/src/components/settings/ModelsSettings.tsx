"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Check, Trash2, ShieldAlert } from "lucide-react";
// Pure subpaths only — the barrel pulls in catalog/models (node:fs), which
// can't bundle into this client component.
import { BUILTIN_PROVIDERS } from "@takt/harness/registry";
import { allowedEfforts } from "@takt/harness/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-faint focus:border-border-heavy";
const fmtCtx = (n?: number) => (n ? (n >= 1_000_000 ? `${n / 1_000_000}M` : `${Math.round(n / 1000)}k`) : "—");

// Every provider the harness supports — the picker lists them all, no vendor is
// special-cased. `protocol` drives which reasoning efforts a model can take.
const PROVIDERS = BUILTIN_PROVIDERS.map((p) => ({ id: p.id, name: p.name, protocol: p.protocol, keyless: !!p.keyless }));

// API-key entry bound to one provider (by registry id). Upserts the DB row on save.
function ProviderKey({ kind }: { kind: string }) {
  const qc = useQueryClient();
  const { data: providers = [] } = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const row = providers.find((p) => p.kind === kind);
  const info = PROVIDERS.find((p) => p.id === kind);
  const [key, setKey] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["providers"] }); qc.invalidateQueries({ queryKey: ["models"] }); };
  const save = useMutation({ mutationFn: () => api.setProviderKey(kind, key.trim()), onSuccess: () => { setKey(""); refresh(); } });
  const remove = useMutation({ mutationFn: () => api.removeProviderKey(row!.id), onSuccess: refresh });

  if (info?.keyless) return <p className="mt-2 text-[12px] text-muted-foreground">No key needed — {info.name} is a local provider.</p>;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] text-muted-foreground">
        {row?.hasKey
          ? <><Check className="size-3.5 text-success" /> Key set · ••••{row.keyLast4}</>
          : "No key set"}
      </div>
      <input value={key} onChange={(e) => setKey(e.target.value)} type="password" name={`${kind}-api-key`}
        placeholder={`Paste ${info?.name ?? kind} key`} aria-label={`${info?.name ?? kind} API key`}
        onKeyDown={(e) => { if (e.key === "Enter" && key.trim()) save.mutate(); }}
        className="w-56 rounded-lg border border-border bg-card px-3 py-2 text-[12.5px] text-foreground outline-none focus:border-border-heavy" />
      <button onClick={() => save.mutate()} disabled={!key.trim() || save.isPending}
        className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[13px] font-medium text-background transition hover:opacity-90 disabled:opacity-30">
        {save.isSuccess ? <Check className="size-4" /> : <KeyRound className="size-4" />} Save
      </button>
      {row?.hasKey && (
        <button onClick={() => remove.mutate()} disabled={remove.isPending} title="Remove the stored key"
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground">
          <Trash2 className="size-4" /> Remove
        </button>
      )}
      {save.isError && <p className="w-full text-[12px] text-destructive">{(save.error as Error).message}</p>}
    </div>
  );
}

// `admin` renders the full console (API keys + the ingestion/vision model);
// the user settings modal passes admin={false} for just model choice + effort.
export function ModelsSettings({ admin = true }: { admin?: boolean } = {}) {
  const qc = useQueryClient();
  const { data: providers = [] } = useQuery({ queryKey: ["providers"], queryFn: api.providers });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });

  const chatProviderId = settings?.chatProviderId ?? providers.find((p) => p.isDefault)?.kind ?? providers[0]?.kind ?? PROVIDERS[0]!.id;
  const captionProviderId = settings?.captionProviderId ?? chatProviderId;
  const buildProviderId = settings?.buildProviderId ?? chatProviderId;

  const { data: chatModels = [] } = useQuery({ queryKey: ["models", chatProviderId], queryFn: () => api.models(chatProviderId), enabled: !!chatProviderId });
  const { data: captionModels = [] } = useQuery({ queryKey: ["models", captionProviderId], queryFn: () => api.models(captionProviderId), enabled: !!captionProviderId });
  const { data: buildModels = [] } = useQuery({ queryKey: ["models", buildProviderId], queryFn: () => api.models(buildProviderId), enabled: !!buildProviderId });

  const saveSetting = useMutation({
    mutationFn: (b: Record<string, string>) => api.updateSettings(b),
    onSuccess: (s) => qc.setQueryData(["settings"], s),
  });

  const chatProvider = PROVIDERS.find((p) => p.id === chatProviderId);
  const chatModel = chatModels.find((m) => m.id === settings?.chatModel);
  const efforts = ["none", ...allowedEfforts(chatProvider?.protocol, chatModel?.reasoning ?? true)];

  // Picking a model whose provider doesn't support the current effort (e.g. a
  // non-reasoning model, or OpenAI which caps at "high") resets to a valid one.
  const changeChatModel = (id: string) => {
    const m = chatModels.find((x) => x.id === id);
    const eff = ["none", ...allowedEfforts(chatProvider?.protocol, m?.reasoning ?? true)];
    const patch: Record<string, string> = { chatModel: id };
    if (settings?.effort && !eff.includes(settings.effort)) patch.effort = eff.includes("medium") ? "medium" : eff[eff.length - 1]!;
    saveSetting.mutate(patch);
  };

  const providerSelect = (value: string, onChange: (id: string) => void, id: string) => (
    <select id={id} className={cn(inputCls, "max-w-xs")} value={value} onChange={(e) => onChange(e.target.value)}>
      {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  );

  return (
    <div className="flex flex-col gap-9">
      <section>
        <h2 className="text-[15px] font-semibold">Chat provider &amp; model</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Pick any provider — the model list is fetched live from it. Keys are encrypted at rest; only the last 4 digits are shown.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="chat-provider" className="mb-1 block text-[11.5px] text-faint">Provider</label>
            {providerSelect(chatProviderId, (id) => saveSetting.mutate({ chatProviderId: id, chatModel: "" }), "chat-provider")}
          </div>
          <div className="flex-1">
            <label htmlFor="chat-model" className="mb-1 block text-[11.5px] text-faint">Model</label>
            <select id="chat-model" className={cn(inputCls, "max-w-md")} value={settings?.chatModel ?? ""} onChange={(e) => changeChatModel(e.target.value)}>
              <option value="" disabled>{chatModels.length ? "Select a model…" : "Add a key to load models…"}</option>
              {chatModels.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </div>
        </div>
        {chatModel && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
            <span>Context <b className="text-foreground">{fmtCtx(chatModel.contextWindow)}</b></span>
            {chatModel.maxOutput ? <span>Max output <b className="text-foreground">{Math.round(chatModel.maxOutput / 1000)}k</b></span> : null}
            {chatModel.cost ? <span>Input <b className="text-foreground">${chatModel.cost.input}/M</b></span> : null}
            {chatModel.cost ? <span>Output <b className="text-foreground">${chatModel.cost.output}/M</b></span> : null}
          </div>
        )}
        {admin && <ProviderKey kind={chatProviderId} />}

        {/* No login → the key is stored once for the whole instance and used by
            anyone who can open it. Make that explicit. */}
        {admin && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[12px] text-muted-foreground">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--takt-arc,#e2701f)]" />
            <span>This key is shared by everyone who can open this instance (there&apos;s no login). Use a spend-limited key, remove it when you&apos;re done, or run a private copy.</span>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold">Canvas (compose) model</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Takt&apos;s main job is building the designed page on the canvas. The <span className="font-medium text-foreground">chat model</span> (above) gathers the facts and crops the figures; this <span className="font-medium text-foreground">compose model</span> writes the page from that material and streams it. Leave it empty to use one model for both (cheapest to set up); pick a <span className="font-medium text-foreground">stronger model here</span> for a better-composed canvas while a cheap chat model does the gathering — so you only pay the strong model for the final compose.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="build-provider" className="mb-1 block text-[11.5px] text-faint">Provider</label>
            {providerSelect(buildProviderId, (id) => saveSetting.mutate({ buildProviderId: id, buildModel: "" }), "build-provider")}
          </div>
          <div className="flex-1">
            <label htmlFor="build-model" className="mb-1 block text-[11.5px] text-faint">Model</label>
            <select id="build-model" className={cn(inputCls, "max-w-md")} value={settings?.buildModel ?? ""} onChange={(e) => saveSetting.mutate({ buildModel: e.target.value })}>
              <option value="">{buildModels.length ? "Reuse chat model" : "Add a key to load models…"}</option>
              {buildModels.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
            </select>
          </div>
        </div>
        {admin && buildProviderId !== chatProviderId && <div className="mt-3"><ProviderKey kind={buildProviderId} /></div>}
      </section>

      <section>
        <h2 className="text-[15px] font-semibold">Reasoning effort</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Higher effort lets the model think longer before answering. You can watch the reasoning unfold in the chat. Levels adapt to the selected model.</p>
        <div className="mt-3 inline-flex rounded-lg border border-border bg-card p-1">
          {efforts.map((e) => (
            <button key={e} onClick={() => saveSetting.mutate({ effort: e })}
              className={cn("rounded-md px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition",
                (settings?.effort ?? "medium") === e
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground")}>
              {e}
            </button>
          ))}
        </div>
      </section>

      {admin && (
        <section>
          <h2 className="text-[15px] font-semibold">Ingestion provider &amp; model</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            The vision model that reads each manual page when you add a product — transcribing tables and describing diagrams so they become searchable. Pick a vision-capable model.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="caption-provider" className="mb-1 block text-[11.5px] text-faint">Provider</label>
              {providerSelect(captionProviderId, (id) => saveSetting.mutate({ captionProviderId: id, captionModel: "" }), "caption-provider")}
            </div>
            <div className="flex-1">
              <label htmlFor="caption-model" className="mb-1 block text-[11.5px] text-faint">Model</label>
              <select id="caption-model" className={cn(inputCls, "max-w-md")} value={settings?.captionModel ?? ""} onChange={(e) => saveSetting.mutate({ captionModel: e.target.value })}>
                <option value="" disabled>{captionModels.length ? "Select a model…" : "Add a key to load models…"}</option>
                {captionModels.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
              </select>
            </div>
          </div>
          {captionProviderId !== chatProviderId && <div className="mt-3"><ProviderKey kind={captionProviderId} /></div>}
        </section>
      )}
    </div>
  );
}
