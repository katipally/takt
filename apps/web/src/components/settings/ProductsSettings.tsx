"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Upload, FileText, Loader2, X, AlertTriangle } from "lucide-react";
import { createSseDecoder } from "@prox/shared";
import { api } from "@/lib/api";
import { estimateIngestCost, costFromTokens, formatCost } from "@/lib/models";
import { cn } from "@/lib/cn";

interface Estimate { perFile: { name: string; pages: number }[]; totalPages: number; model: string; hasKey: boolean }

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-faint focus:border-border-heavy";

export function ProductsSettings() {
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.products });
  return (
    <div className="flex flex-col gap-9">
      <section>
        <h2 className="text-[15px] font-semibold">Products</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">The knowledge base is product-agnostic. Each product is its own manual set, indexed independently.</p>
        <div className="mt-4 flex flex-col gap-2">
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface text-[14px] font-semibold text-muted-foreground">
                {p.heroPath
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={`/assets/${p.heroPath}`} alt="" className="size-full object-cover" />
                  : p.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">{p.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{p.manufacturer ?? "—"} · {p.slug}</div>
              </div>
              <Link href={`/${p.slug}`} className="flex items-center gap-1 text-[12px] text-muted-foreground transition hover:text-foreground">Open <ArrowUpRight className="size-3.5" /></Link>
            </div>
          ))}
          {products.length === 0 && <div className="rounded-xl border border-border bg-card p-4 text-[12.5px] text-muted-foreground">No products yet.</div>}
        </div>
      </section>
      <AddProduct />
    </div>
  );
}

type Phase = "idle" | "estimating" | "confirm" | "ingesting" | "done";

function AddProduct() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [hero, setHero] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [progress, setProgress] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const busy = phase === "estimating" || phase === "ingesting";

  function reset() {
    setName(""); setManufacturer(""); setFiles([]); setHero(null);
    setEstimate(null); setPhase("done");
  }

  // Phase 1 — count pages (no captioning yet) so the user sees the cost first.
  async function getEstimate() {
    if (!name.trim() || !files.length) return;
    setPhase("estimating"); setProgress("Counting pages…");
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("pdfs", f));
      const res = await fetch("/api/products/estimate", { method: "POST", body: fd });
      const data = (await res.json()) as Estimate | { error: string };
      if ("error" in data) throw new Error(data.error);
      setEstimate(data); setPhase("confirm"); setProgress("");
    } catch (err) {
      setPhase("idle"); setProgress(`Error: ${String(err instanceof Error ? err.message : err)}`);
    }
  }

  // Phase 2 — run the paid ingest after the user confirms.
  async function runIngest() {
    setPhase("ingesting"); setProgress("Uploading…");
    const fd = new FormData();
    fd.set("name", name.trim()); fd.set("slug", slug); fd.set("manufacturer", manufacturer.trim());
    files.forEach((f) => fd.append("pdfs", f));
    if (hero) fd.set("hero", hero);
    const model = estimate?.model;
    try {
      const res = await fetch("/api/products/ingest", { method: "POST", body: fd });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      const decode = createSseDecoder();
      let result = "Indexed ✓";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const e of decode(dec.decode(value, { stream: true }))) {
          if (e.type === "tool_start") setProgress(e.summary ?? "Working…");
          else if (e.type === "error") { setPhase("idle"); setProgress(`Error: ${e.message}`); return; }
          else if (e.type === "done") {
            const cost = costFromTokens(e.inputTokens ?? 0, e.outputTokens ?? 0, model);
            result = `Indexed ✓ · ${e.pages ?? 0} pages · ${formatCost(cost)}`;
          }
        }
      }
      qc.invalidateQueries({ queryKey: ["products"] });
      reset(); setProgress(result);
    } catch (err) {
      setPhase("idle"); setProgress(`Error: ${String(err)}`);
    }
  }

  return (
    <section>
      <h2 className="text-[15px] font-semibold">Add a product</h2>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Upload the product&apos;s manuals (PDF). Prox renders every page, reads diagrams and tables with the ingestion model, and builds the search index — then it shows up here, no redeploy.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <input className={inputCls} name="product-name" placeholder="Product name" aria-label="Product name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputCls} name="manufacturer" placeholder="Manufacturer (optional)" aria-label="Manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground">
          <Upload className="size-4" /> Choose PDFs
        </button>
        <input ref={fileRef} type="file" accept="application/pdf" multiple hidden
          onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setEstimate(null); setPhase("idle"); }} />
        <label className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground cursor-pointer">
          <Upload className="size-4" /> {hero ? "Hero ✓" : "Hero image"}
          <input type="file" accept="image/*" hidden onChange={(e) => setHero(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={i} className="flex items-center gap-1.5 rounded-md bg-card px-2 py-1 text-[11px] text-muted-foreground">
              <FileText className="size-3" />{f.name}
              <button onClick={() => { setFiles(files.filter((_, j) => j !== i)); setEstimate(null); setPhase("idle"); }}><X className="size-3 hover:text-foreground" /></button>
            </span>
          ))}
        </div>
      )}

      {/* Estimate / confirm panel — shown before any paid call runs. */}
      {phase === "confirm" && estimate && (
        <div className="mt-3 rounded-xl border border-border bg-surface p-4">
          <div className="text-[13px] font-medium text-foreground">Ready to index — confirm the cost</div>
          <ul className="mt-2 flex flex-col gap-1 text-[12px] text-muted-foreground">
            {estimate.perFile.map((f) => (
              <li key={f.name} className="flex justify-between gap-3"><span className="truncate">{f.name}</span><span className="shrink-0 tabular-nums">{f.pages} pages</span></li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
            <div><div className="text-faint">Pages</div><div className="font-medium text-foreground tabular-nums">{estimate.totalPages}</div></div>
            <div><div className="text-faint">Model</div><div className="font-medium text-foreground truncate">{estimate.model}</div></div>
            <div><div className="text-faint">Est. cost</div><div className="font-medium text-foreground tabular-nums">~{formatCost(estimateIngestCost(estimate.totalPages, estimate.model))}</div></div>
          </div>
          {!estimate.hasKey && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>No Anthropic API key set. Add your key in the Models tab before indexing.</span>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button onClick={runIngest} disabled={!estimate.hasKey}
              className="rounded-lg bg-foreground px-3.5 py-2 text-[13px] font-medium text-background transition hover:opacity-90 disabled:opacity-30">
              Proceed · ~{formatCost(estimateIngestCost(estimate.totalPages, estimate.model))}
            </button>
            <button onClick={() => { setEstimate(null); setPhase("idle"); }}
              className="rounded-lg border border-border px-3.5 py-2 text-[13px] text-muted-foreground transition hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      {phase !== "confirm" && (
        <div className="mt-3 flex items-center gap-3">
          <button onClick={getEstimate} disabled={busy || !name.trim() || !files.length}
            className="flex items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-[13px] font-medium text-background transition hover:opacity-90 disabled:opacity-30">
            {busy && <Loader2 className="size-4 animate-spin" />} {phase === "estimating" ? "Estimating…" : phase === "ingesting" ? "Indexing…" : "Add product"}
          </button>
          {progress && <span className={cn("text-[12px]", progress.startsWith("Error") ? "text-destructive" : "text-muted-foreground")}>{progress}</span>}
        </div>
      )}
    </section>
  );
}
