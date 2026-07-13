"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Lock } from "lucide-react";
import { ModelsSettings } from "@/components/settings/ModelsSettings";
import { ProductsSettings } from "@/components/settings/ProductsSettings";
import { Wordmark } from "@/components/brand/Wordmark";
import { cn } from "@/lib/cn";

type AuthState = { required: boolean; authed: boolean };
type GraphStat = { slug: string; name: string; entities: number; edges: number; chunks: number; media: number; byType: Record<string, number> };

// The admin console: ingestion + provider keys + model config + knowledge-graph
// stats. Gated by TAKT_ADMIN_TOKEN (open in local dev when unset). Deliberately
// off the chat surface — end users never see or reach ingestion.
export default function AdminPage() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"products" | "models" | "graph">("products");

  const refreshAuth = () => fetch("/api/admin/auth").then((r) => r.json()).then(setAuth).catch(() => setAuth({ required: true, authed: false }));
  useEffect(() => { void refreshAuth(); }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/admin/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    if (res.ok) { setToken(""); await refreshAuth(); }
    else setErr("Invalid token.");
  }

  if (!auth) return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;

  if (auth.required && !auth.authed) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
          <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold"><Lock className="size-4" /> Admin access</div>
          <p className="mb-4 text-[12.5px] text-muted-foreground">Ingestion and API keys are restricted. Enter the admin token (<code>TAKT_ADMIN_TOKEN</code>).</p>
          <input autoFocus type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Admin token"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-border-heavy" />
          {err && <p className="mt-2 text-[12px] text-red-400">{err}</p>}
          <button type="submit" className="mt-4 w-full rounded-lg bg-foreground py-2 text-[13px] font-medium text-background transition hover:opacity-90">Unlock</button>
          <Link href="/" className="mt-3 block text-center text-[12px] text-muted-foreground hover:text-foreground">← Back to Takt</Link>
        </form>
      </div>
    );
  }

  const TABS = [{ id: "products", label: "Products & ingestion" }, { id: "models", label: "Models & API keys" }, { id: "graph", label: "Knowledge graph" }] as const;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wordmark />
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">Admin</span>
        </div>
        <Link href="/" className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-3.5" /> Back to Takt</Link>
      </header>

      <nav className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] transition",
              tab === t.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="min-h-0 flex-1">
        {tab === "products" ? <ProductsSettings /> : tab === "models" ? <ModelsSettings /> : <GraphStats />}
      </main>
    </div>
  );
}

function GraphStats() {
  const { data = [], isLoading } = useQuery<GraphStat[]>({ queryKey: ["admin-graph"], queryFn: () => fetch("/api/admin/graph").then((r) => r.json()) });
  if (isLoading) return <p className="text-muted-foreground">Loading graph stats…</p>;
  if (!data.length) return <p className="text-muted-foreground">No products ingested yet.</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-muted-foreground">What each product&apos;s ingestion built. A near-empty graph means the ingest needs re-running (or the caption model couldn&apos;t read the pages).</p>
      {data.map((p) => (
        <div key={p.slug} className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[14px] font-semibold">{p.name}</h3>
            <span className="text-[11.5px] text-faint">{p.slug}</span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-muted-foreground">
            <span><b className="text-foreground">{p.entities}</b> entities</span>
            <span><b className="text-foreground">{p.edges}</b> links</span>
            <span><b className="text-foreground">{p.chunks}</b> chunks</span>
            <span><b className="text-foreground">{p.media}</b> media</span>
          </div>
          {Object.keys(p.byType ?? {}).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(p.byType).sort((a, b) => b[1] - a[1]).map(([type, n]) => (
                <span key={type} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{type} <b className="text-foreground">{n}</b></span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
