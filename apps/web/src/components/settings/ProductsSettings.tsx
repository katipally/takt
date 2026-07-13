"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Upload, FileText, Loader2, X, AlertTriangle, Trash2 } from "lucide-react";
import { createSseDecoder } from "@takt/shared";
import { api } from "@/lib/api";
import { formatCost } from "@/lib/models";
import { cn } from "@/lib/cn";

interface Estimate {
  perFile: { name: string; pages: number }[];
  totalPages: number;
  pdfPages?: number;
  images?: number;
  videos?: number;
  audios?: number;
  models?: number;
  model: string;
  provider?: string;
  cost?: { input: number; output: number } | null;
  hasKey: boolean;
}

// Rough pre-ingest estimate using the chosen model's live price: ~one vision
// call per unit (~1.6k input + ~0.7k output tokens). totalPages already folds in
// image + video vision units server-side. Labelled "~"; real spend shown after.
function estCost(est: Estimate): number | null {
  if (!est.cost) return null;
  return (est.totalPages * 1600 * est.cost.input + est.totalPages * 700 * est.cost.output) / 1_000_000;
}

const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-faint focus:border-border-heavy";

// One folder drop, every modality. Classify a picked file list by extension into
// the buckets the ingest accepts — this is the "just upload a folder" path.
const EXT = {
  pdf: [".pdf"],
  image: [".png", ".jpg", ".jpeg", ".webp", ".gif"],
  video: [".mp4", ".mov", ".webm", ".mkv"],
  audio: [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"],
  model: [".stl", ".glb", ".gltf", ".stp", ".step", ".3mf"], // 3D → converted/rendered
} as const;
// 3D formats we STILL don't render (need a converter) — flagged, not silently dropped.
const UNSUPPORTED_3D = [".obj", ".fbx", ".ply", ".dae", ".igs", ".iges"];
export interface Bucketed { pdfs: File[]; images: File[]; videos: File[]; audios: File[]; models: File[]; skipped: File[] }
export function classifyFiles(files: File[]): Bucketed {
  const b: Bucketed = { pdfs: [], images: [], videos: [], audios: [], models: [], skipped: [] };
  for (const f of files) {
    const n = f.name.toLowerCase();
    if (n.startsWith(".") || n.endsWith("/")) continue; // dotfiles / dir entries
    if (EXT.pdf.some((e) => n.endsWith(e))) b.pdfs.push(f);
    else if (EXT.image.some((e) => n.endsWith(e))) b.images.push(f);
    else if (EXT.video.some((e) => n.endsWith(e))) b.videos.push(f);
    else if (EXT.audio.some((e) => n.endsWith(e))) b.audios.push(f);
    else if (EXT.model.some((e) => n.endsWith(e))) b.models.push(f);
    else b.skipped.push(f);
  }
  return b;
}
const ext = (name: string) => (name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "");

type GraphStat = { slug: string; name: string; entities: number; edges: number; chunks: number; media: number; byType: Record<string, number> };

export function ProductsSettings() {
  const qc = useQueryClient();
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: api.products });
  // Each product's own knowledge — folded into its row (no separate graph tab).
  const { data: graphStats = [] } = useQuery<GraphStat[]>({ queryKey: ["admin-graph"], queryFn: () => fetch("/api/admin/graph").then((r) => r.json()) });
  const statBySlug = new Map(graphStats.map((g) => [g.slug, g]));
  const [deleting, setDeleting] = useState<string | null>(null);

  async function remove(slug: string, name: string) {
    if (!window.confirm(`Delete "${name}" and ALL its data (manuals, graph, media, chats)? This cannot be undone.`)) return;
    setDeleting(slug);
    try {
      const res = await fetch(`/api/products/${slug}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "delete failed");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["admin-graph"] });
    } catch (err) {
      window.alert(`Couldn't delete: ${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex flex-col gap-9">
      <section>
        <h2 className="text-[15px] font-semibold">Products</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Master control. Each product is its own manual set, indexed independently — its knowledge graph is shown per product below.</p>
        <div className="mt-4 flex flex-col gap-2">
          {products.map((p) => {
            const g = statBySlug.get(p.slug);
            return (
              <div key={p.id} className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex items-center gap-3">
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
                  <button onClick={() => remove(p.slug, p.name)} disabled={deleting === p.slug} aria-label={`Delete ${p.name}`}
                    className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition hover:text-destructive disabled:opacity-40">
                    {deleting === p.slug ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  </button>
                </div>
                {/* This product's knowledge graph — the old separate tab, now per product. */}
                {g && (
                  <div className="mt-3 border-t border-border pt-2.5">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                      <span><b className="text-foreground tabular-nums">{g.entities}</b> entities</span>
                      <span><b className="text-foreground tabular-nums">{g.edges}</b> links</span>
                      <span><b className="text-foreground tabular-nums">{g.chunks}</b> chunks</span>
                      <span><b className="text-foreground tabular-nums">{g.media}</b> media</span>
                      {g.entities === 0 && <span className="text-destructive">empty — re-run ingest</span>}
                    </div>
                    {Object.keys(g.byType ?? {}).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(g.byType).sort((a, b) => b[1] - a[1]).map(([type, n]) => (
                          <span key={type} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{type} <b className="text-foreground">{n}</b></span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
  const [bucket, setBucket] = useState<Bucketed>({ pdfs: [], images: [], videos: [], audios: [], models: [], skipped: [] });
  const [urls, setUrls] = useState("");
  const [hero, setHero] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [progress, setProgress] = useState<string>("");
  const folderRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const busy = phase === "estimating" || phase === "ingesting";
  const hasUrls = urls.split(/[\n,]+/).some((u) => /^https?:\/\//i.test(u.trim()));
  const total = bucket.pdfs.length + bucket.images.length + bucket.videos.length + bucket.audios.length + bucket.models.length;
  const hasFiles = total > 0;
  const paidWork = bucket.pdfs.length + bucket.images.length + bucket.videos.length > 0; // needs a vision estimate

  function ingest(files: File[]) { setBucket(classifyFiles(files)); setEstimate(null); setPhase("idle"); }
  function reset() {
    setName(""); setManufacturer(""); setBucket({ pdfs: [], images: [], videos: [], audios: [], models: [], skipped: [] });
    setUrls(""); setHero(null); setEstimate(null); setPhase("done");
  }

  function appendBuckets(fd: FormData) {
    bucket.pdfs.forEach((f) => fd.append("pdfs", f));
    bucket.images.forEach((f) => fd.append("images", f));
    bucket.videos.forEach((f) => fd.append("videos", f));
    bucket.audios.forEach((f) => fd.append("audios", f));
    // Send each model's FOLDER PATH (webkitRelativePath) as its filename so the
    // server can group parts by their subsystem folder (Nextruder, Frame, …).
    bucket.models.forEach((f) => fd.append("models", f, (f as unknown as { webkitRelativePath?: string }).webkitRelativePath || f.name));
  }

  // Phase 1 — cost the vision work (pages + images + videos) before any paid call.
  // Only PDFs are uploaded (pages must be counted); the rest go as counts so we
  // don't ship big media/STLs just to estimate.
  async function getEstimate() {
    if (!name.trim() || !paidWork) return;
    setPhase("estimating"); setProgress("Analyzing files…");
    try {
      const fd = new FormData();
      bucket.pdfs.forEach((f) => fd.append("pdfs", f));
      fd.set("imagesCount", String(bucket.images.length));
      fd.set("videosCount", String(bucket.videos.length));
      fd.set("audiosCount", String(bucket.audios.length));
      fd.set("modelsCount", String(bucket.models.length));
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
    appendBuckets(fd);
    if (urls.trim()) fd.set("urls", urls.trim());
    if (hero) fd.set("hero", hero);
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

  const counts = [
    ["PDF", bucket.pdfs.length], ["image", bucket.images.length], ["video", bucket.videos.length],
    ["audio", bucket.audios.length], ["3D", bucket.models.length],
  ].filter(([, n]) => (n as number) > 0) as [string, number][];

  // Split skipped files: CAD-source 3D (a nudge to export STL, but often redundant
  // with .stl already present) vs. other files (gcode/toolpaths — genuinely not
  // product knowledge, so a quiet note, not an alarm).
  const summarize = (fs: File[]) => Object.entries(fs.reduce((m, f) => { const e = ext(f.name) || "(no ext)"; m[e] = (m[e] ?? 0) + 1; return m; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).map(([e, n]) => `${n}×${e}`).join(", ");
  const skipped3d = bucket.skipped.filter((f) => UNSUPPORTED_3D.includes(ext(f.name)));
  const skippedOther = bucket.skipped.filter((f) => !UNSUPPORTED_3D.includes(ext(f.name)));

  return (
    <section>
      <h2 className="text-[15px] font-semibold">Add a product</h2>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Drop ONE folder. Takt sorts it — PDFs (every page read), images and videos (vision-captioned & chaptered), audio (transcribed), and 3D parts (.stl/.glb/.step/.3mf) — links it all into one knowledge graph, and shows the cost before anything paid runs. Paste source links for web pages / YouTube too.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <input className={inputCls} name="product-name" placeholder="Product name" aria-label="Product name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputCls} name="manufacturer" placeholder="Manufacturer (optional)" aria-label="Manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button onClick={() => folderRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground">
          <Upload className="size-4" /> Upload folder
        </button>
        <input ref={folderRef} type="file" multiple hidden {...{ webkitdirectory: "", directory: "" }}
          onChange={(e) => ingest(Array.from(e.target.files ?? []))} />
        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground">
          <Upload className="size-4" /> Choose files
        </button>
        <input ref={fileRef} type="file" multiple hidden
          accept=".pdf,image/*,video/*,audio/*,.stl,.glb,.gltf,.stp,.step,.3mf"
          onChange={(e) => ingest(Array.from(e.target.files ?? []))} />
        <label className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground transition hover:border-border-heavy hover:text-foreground cursor-pointer">
          <Upload className="size-4" /> {hero ? "Hero ✓" : "Hero image (optional)"}
          <input type="file" accept="image/*" hidden onChange={(e) => setHero(e.target.files?.[0] ?? null)} />
        </label>
      </div>

      {hasFiles && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {counts.map(([label, n]) => (
            <span key={label} className="flex items-center gap-1.5 rounded-md bg-card px-2 py-1 text-[11px] text-muted-foreground">
              <FileText className="size-3" />{n} {label}{n > 1 ? "s" : ""}
            </span>
          ))}
          <button onClick={() => ingest([])} className="text-[11px] text-muted-foreground transition hover:text-foreground"><X className="size-3" /></button>
        </div>
      )}

      {bucket.skipped.length > 0 && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[12px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--takt-arc,#e2701f)]" />
          <span>
            {skipped3d.length > 0 && (
              <>
                {skipped3d.length} CAD-source 3D file{skipped3d.length > 1 ? "s" : ""} ({summarize(skipped3d)}) not rendered
                {bucket.models.length > 0
                  ? <> — your <span className="font-medium text-foreground">{bucket.models.length} .stl part{bucket.models.length > 1 ? "s" : ""}</span> already cover the same geometry.</>
                  : <>. Export <span className="font-medium text-foreground">.stl / .glb / .gltf</span> from your slicer to include them.</>}
                {" "}
              </>
            )}
            {skippedOther.length > 0 && <>{skippedOther.length} other file{skippedOther.length > 1 ? "s" : ""} ({summarize(skippedOther)}) ignored — not product knowledge.</>}
          </span>
        </div>
      )}

      <textarea className={cn(inputCls, "mt-2 min-h-[64px] resize-y font-mono text-[12px]")}
        placeholder={"Source links (optional) — one per line\nhttps://en.wikipedia.org/wiki/…\nhttps://youtube.com/watch?v=…"}
        aria-label="Source URLs" value={urls}
        onChange={(e) => { setUrls(e.target.value); setEstimate(null); if (phase !== "ingesting") setPhase("idle"); }} />
      {hasUrls && !paidWork && <p className="mt-1 text-[11px] text-muted-foreground">Text-only sources index for free (no page rendering).</p>}

      {/* Estimate / confirm panel — shown before any paid call runs. */}
      {phase === "confirm" && estimate && (
        <div className="mt-3 rounded-xl border border-border bg-surface p-4">
          <div className="text-[13px] font-medium text-foreground">Ready to index — confirm the cost</div>
          <ul className="mt-2 flex flex-col gap-1 text-[12px] text-muted-foreground">
            {estimate.perFile.map((f) => (
              <li key={f.name} className="flex justify-between gap-3"><span className="truncate">{f.name}</span><span className="shrink-0 tabular-nums">{f.pages} pages</span></li>
            ))}
            {!!estimate.images && <li className="flex justify-between gap-3"><span>Images</span><span className="shrink-0 tabular-nums">{estimate.images}</span></li>}
            {!!estimate.videos && <li className="flex justify-between gap-3"><span>Videos</span><span className="shrink-0 tabular-nums">{estimate.videos}</span></li>}
            {!!estimate.models && <li className="flex justify-between gap-3"><span>3D parts (free)</span><span className="shrink-0 tabular-nums">{estimate.models}</span></li>}
            {!!estimate.audios && <li className="flex justify-between gap-3"><span>Audio (transcribed, free)</span><span className="shrink-0 tabular-nums">{estimate.audios}</span></li>}
          </ul>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
            <div><div className="text-faint">Vision units</div><div className="font-medium text-foreground tabular-nums">{estimate.totalPages}</div></div>
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
          {/* Vision work (pdf/image/video) goes through the cost estimate first;
              URL-only + audio-only sources ingest directly. */}
          <button onClick={() => (paidWork ? getEstimate() : runIngest())} disabled={busy || !name.trim() || (!hasFiles && !hasUrls)}
            className="flex items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-[13px] font-medium text-background transition hover:opacity-90 disabled:opacity-30">
            {busy && <Loader2 className="size-4 animate-spin" />} {phase === "estimating" ? "Analyzing…" : phase === "ingesting" ? "Indexing…" : "Add product"}
          </button>
          {progress && <span className={cn("text-[12px]", progress.startsWith("Error") ? "text-destructive" : "text-muted-foreground")}>{progress}</span>}
        </div>
      )}
    </section>
  );
}
