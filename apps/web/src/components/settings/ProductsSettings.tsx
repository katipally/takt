"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Upload, FileText, Loader2, X, AlertTriangle } from "lucide-react";
import { createSseDecoder } from "@takt/shared";
import { api } from "@/lib/api";
import { formatCost } from "@/lib/models";
import { cn } from "@/lib/cn";

interface Estimate {
  perFile: { name: string; pages: number }[];
  totalPages: number;
  model: string;
  provider?: string;
  cost?: { input: number; output: number } | null;
  hasKey: boolean;
}

// Rough pre-ingest estimate using the chosen model's live price: ~one vision
// call per page (~1.6k input + ~0.7k output tokens). Labelled "~"; the real
// spend is shown after ingest from the actual token counts.
function estCost(est: Estimate): number | null {
  if (!est.cost) return null;
  return (est.totalPages * 1600 * est.cost.input + est.totalPages * 700 * est.cost.output) / 1_000_000;
}

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
  const [urls, setUrls] = useState("");
  const [hero, setHero] = useState<File | null>(null);
  const [models, setModels] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [progress, setProgress] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const busy = phase === "estimating" || phase === "ingesting";
  const hasUrls = urls.split(/[\n,]+/).some((u) => /^https?:\/\//i.test(u.trim()));

  function reset() {
    setName(""); setManufacturer(""); setFiles([]); setUrls(""); setHero(null); setModels([]); setVideo(null);
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
    if (urls.trim()) fd.set("urls", urls.trim());
    if (hero) fd.set("hero", hero);
    models.forEach((f) => fd.append("models", f));
    if (video) fd.set("video", video);
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
            result = `Indexed ✓ · ${e.pages ?? 0} pages · ${formatCost(e.costUsd ?? 0)}`;
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
        Add the product&apos;s manuals as PDFs (Takt renders every page and reads its diagrams/tables), and/or paste source links — web pages and YouTube videos are ingested as searchable text. Add 3D part models (.stl) and a walkthrough video to enrich the knowledge graph with interactive parts and clips. Everything lands in one index, no redeploy.
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
        <button onClick={() => folderRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground">
          <Upload className="size-4" /> Choose folder
        </button>
        {/* Folder upload: keep only the PDFs from the selected directory tree. */}
        <input ref={folderRef} type="file" multiple hidden {...{ webkitdirectory: "", directory: "" }}
          onChange={(e) => { setFiles(Array.from(e.target.files ?? []).filter((f) => f.name.toLowerCase().endsWith(".pdf"))); setEstimate(null); setPhase("idle"); }} />
        <label className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground cursor-pointer">
          <Upload className="size-4" /> {hero ? "Hero ✓" : "Hero image"}
          <input type="file" accept="image/*" hidden onChange={(e) => setHero(e.target.files?.[0] ?? null)} />
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground cursor-pointer">
          <Upload className="size-4" /> {models.length ? `3D models · ${models.length}` : "3D models (.stl)"}
          <input type="file" accept=".stl" multiple hidden onChange={(e) => { setModels(Array.from(e.target.files ?? [])); }} />
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground cursor-pointer">
          <Upload className="size-4" /> {video ? "Video ✓" : "Walkthrough video"}
          <input type="file" accept="video/*" hidden onChange={(e) => setVideo(e.target.files?.[0] ?? null)} />
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

      <textarea className={cn(inputCls, "mt-2 min-h-[64px] resize-y font-mono text-[12px]")}
        placeholder={"Source links (optional) — one per line\nhttps://en.wikipedia.org/wiki/…\nhttps://youtube.com/watch?v=…"}
        aria-label="Source URLs" value={urls}
        onChange={(e) => { setUrls(e.target.value); setEstimate(null); if (phase !== "ingesting") setPhase("idle"); }} />
      {hasUrls && !files.length && <p className="mt-1 text-[11px] text-muted-foreground">Text-only sources index for free (no page rendering).</p>}

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
            <div><div className="text-faint">Model</div><div className="font-medium text-foreground truncate">{estimate.provider ? `${estimate.provider} · ` : ""}{estimate.model || "—"}</div></div>
            <div><div className="text-faint">Est. cost</div><div className="font-medium text-foreground tabular-nums">{estCost(estimate) == null ? "—" : `~${formatCost(estCost(estimate)!)}`}</div></div>
          </div>
          {!estimate.hasKey && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>No API key for {estimate.provider ?? "the selected provider"}. Add it in the Models tab before indexing.</span>
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button onClick={runIngest} disabled={!estimate.hasKey}
              className="rounded-lg bg-foreground px-3.5 py-2 text-[13px] font-medium text-background transition hover:opacity-90 disabled:opacity-30">
              Proceed{estCost(estimate) != null ? ` · ~${formatCost(estCost(estimate)!)}` : ""}
            </button>
            <button onClick={() => { setEstimate(null); setPhase("idle"); }}
              className="rounded-lg border border-border px-3.5 py-2 text-[13px] text-muted-foreground transition hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      {phase !== "confirm" && (
        <div className="mt-3 flex items-center gap-3">
          {/* PDFs go through the cost estimate first; URL-only sources are text-only
              (free) so they ingest directly. */}
          <button onClick={() => (files.length ? getEstimate() : runIngest())} disabled={busy || !name.trim() || (!files.length && !hasUrls)}
            className="flex items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-[13px] font-medium text-background transition hover:opacity-90 disabled:opacity-30">
            {busy && <Loader2 className="size-4 animate-spin" />} {phase === "estimating" ? "Estimating…" : phase === "ingesting" ? "Indexing…" : "Add product"}
          </button>
          {progress && <span className={cn("text-[12px]", progress.startsWith("Error") ? "text-destructive" : "text-muted-foreground")}>{progress}</span>}
        </div>
      )}
    </section>
  );
}
