"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Upload, FileText, Loader2, X } from "lucide-react";
import { createSseDecoder } from "@prox/shared";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-faint focus:border-border-heavy";

export default function ProductsSettings() {
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

function AddProduct() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [hero, setHero] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  async function submit() {
    if (!name.trim() || !files.length) return;
    setBusy(true); setProgress("Uploading…");
    const fd = new FormData();
    fd.set("name", name.trim()); fd.set("slug", slug); fd.set("manufacturer", manufacturer.trim());
    files.forEach((f) => fd.append("pdfs", f));
    if (hero) fd.set("hero", hero);
    try {
      const res = await fetch("/api/products/ingest", { method: "POST", body: fd });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      const decode = createSseDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const e of decode(dec.decode(value, { stream: true }))) {
          if (e.type === "tool_start") setProgress(e.summary ?? "Working…");
          else if (e.type === "error") setProgress(`Error: ${e.message}`);
          else if (e.type === "done") setProgress("Done");
        }
      }
      qc.invalidateQueries({ queryKey: ["products"] });
      setName(""); setManufacturer(""); setFiles([]); setHero(null);
      setProgress("Indexed ✓");
    } catch (err) {
      setProgress(`Error: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="text-[15px] font-semibold">Add a product</h2>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Upload the product&apos;s manuals (PDF). Prox renders every page, reads diagrams and tables with the ingestion model, and builds the search index — then it shows up here, no redeploy.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputCls} placeholder="Manufacturer (optional)" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground">
          <Upload className="size-4" /> Choose PDFs
        </button>
        <input ref={fileRef} type="file" accept="application/pdf" multiple hidden
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
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
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="size-3 hover:text-foreground" /></button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button onClick={submit} disabled={busy || !name.trim() || !files.length}
          className="flex items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-[13px] font-medium text-background transition hover:opacity-90 disabled:opacity-30">
          {busy && <Loader2 className="size-4 animate-spin" />} {busy ? "Indexing…" : "Add product"}
        </button>
        {progress && <span className={cn("text-[12px]", progress.startsWith("Error") ? "text-destructive" : "text-muted-foreground")}>{progress}</span>}
      </div>
    </section>
  );
}
