"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ExternalLink, X } from "lucide-react";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { cn } from "@/lib/cn";
import { Figure } from "./parts";
import type { NodeProps } from "./ctx";

// Click-to-zoom lightbox for images (crops, galleries). Esc or click closes.
function Lightbox({ src, alt, caption, onClose }: { src: string; alt?: string; caption?: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 p-6 backdrop-blur-sm" onClick={onClose}>
      <button className="absolute right-4 top-4 grid size-9 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white" aria-label="Close"><X className="size-5" /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt || ""} className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      {caption ? <div className="mt-3 max-w-2xl text-center text-[12.5px] text-white/70">{caption}</div> : null}
    </div>,
    document.body,
  );
}

// ── layout / containers ──────────────────────────────────────────────────────
export function Section({ props, children }: NodeProps<{ title?: string }>) {
  return (
    <section className="space-y-3">
      {props.title ? <h2 className="text-[16px] font-semibold tracking-tight">{props.title}</h2> : null}
      {children}
    </section>
  );
}

export function Columns({ props, children }: NodeProps<{ count?: number }>) {
  const cols = props.count === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : props.count === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";
  return <div className={cn("grid grid-cols-1 gap-3", cols)}>{children}</div>;
}

export function Card({ props, children }: NodeProps<{ title?: string; tone?: string }>) {
  const tone = props.tone === "accent" ? "border-accent/30 bg-accent-soft" : props.tone === "muted" ? "bg-surface" : "bg-card";
  return (
    <div className={cn("rounded-xl border border-border p-4 shadow-[var(--shadow-card)]", tone)}>
      {props.title ? <h3 className="mb-2 text-[14px] font-semibold">{props.title}</h3> : null}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function Divider() { return <hr className="border-border" />; }

export function Tabs({ props }: NodeProps<{ items: { label: string; content: string }[] }>) {
  const [i, setI] = useState(0);
  const items = props.items ?? [];
  return (
    <div className="rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="flex gap-1 overflow-x-auto border-b border-border p-1.5 takt-scroll">
        {items.map((t, n) => (
          <button key={n} onClick={() => setI(n)}
            className={cn("shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition",
              i === n ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4"><MarkdownBody content={items[i]?.content ?? ""} /></div>
    </div>
  );
}

export function Accordion({ props }: NodeProps<{ items: { title: string; content: string }[] }>) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {(props.items ?? []).map((it, n) => (
        <div key={n}>
          <button onClick={() => setOpen(open === n ? null : n)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-[13px] font-medium">
            {it.title}
            <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", open === n && "rotate-180")} />
          </button>
          {open === n ? <div className="px-4 pb-3"><MarkdownBody content={it.content} /></div> : null}
        </div>
      ))}
    </div>
  );
}

// ── text / info ──────────────────────────────────────────────────────────────
export function Heading({ props }: NodeProps<{ text: string; level?: number }>) {
  const size = props.level === 3 ? "text-[14px]" : props.level === 2 ? "text-[16px]" : "text-[21px]";
  return <h2 className={cn("font-semibold tracking-tight", size)}>{props.text}</h2>;
}

export function Prose({ props, ctx }: NodeProps<{ markdown: string }>) {
  return <MarkdownBody content={props.markdown} renderLink={citationLink(ctx)} />;
}

const TONE: Record<string, string> = {
  tip: "bg-accent-soft [&::before]:bg-accent", ok: "bg-[var(--success)]/10 [&::before]:bg-[var(--success)]",
  warn: "bg-[var(--destructive)]/10 [&::before]:bg-[var(--destructive)]", note: "bg-surface [&::before]:bg-arc", default: "bg-surface [&::before]:bg-arc",
};
export function Callout({ props, ctx }: NodeProps<{ tone?: string; title?: string; markdown: string }>) {
  return (
    <div className={cn("relative rounded-lg border border-border py-3 pl-8 pr-4 before:absolute before:left-3.5 before:top-[18px] before:size-[7px] before:rounded-full", TONE[props.tone ?? "default"] ?? TONE.default)}>
      {props.title ? <div className="mb-0.5 text-[13px] font-semibold">{props.title}</div> : null}
      <div className="text-chat [&_p:last-child]:mb-0"><MarkdownBody content={props.markdown} renderLink={citationLink(ctx)} /></div>
    </div>
  );
}

export function Stat({ props, ctx, bind }: NodeProps<{ value: string; label: string; hint?: string }>) {
  // If bound, reflect the live data value (a Stat that mirrors an Input/Slider).
  const bound = bind && ctx.data ? ctx.data.get(bind) : undefined;
  const value = bound === undefined || bound === null ? props.value
    : typeof bound === "boolean" ? (bound ? "Yes" : "No") : String(bound);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[26px] font-bold leading-none tracking-tight">{value}</div>
      <div className="mt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">{props.label}</div>
      {props.hint ? <div className="mt-1 text-[12px] text-muted-foreground">{props.hint}</div> : null}
    </div>
  );
}

export function KeyValue({ props }: NodeProps<{ rows: { key: string; value: string }[] }>) {
  return (
    <dl className="overflow-hidden rounded-lg border border-border">
      {(props.rows ?? []).map((r, i) => (
        <div key={i} className="flex gap-4 border-b border-border px-3.5 py-2 last:border-0 odd:bg-foreground/[0.02]">
          <dt className="w-2/5 shrink-0 text-[12px] font-medium text-muted-foreground">{r.key}</dt>
          <dd className="text-[13px]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Quote({ props }: NodeProps<{ text: string; cite?: string }>) {
  return (
    <blockquote className="border-l-2 border-arc pl-4">
      <p className="text-[15px] italic leading-relaxed">{props.text}</p>
      {props.cite ? <footer className="mt-1.5 text-[12px] text-muted-foreground">— {props.cite}</footer> : null}
    </blockquote>
  );
}

// ── media ─────────────────────────────────────────────────────────────────────
export function Image({ props }: NodeProps<{ src: string; alt?: string; caption?: string }>) {
  const [open, setOpen] = useState(false);
  return (
    <Figure caption={props.caption} flush>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={props.src} alt={props.alt || ""} onClick={() => setOpen(true)}
        className="block max-h-[460px] w-full cursor-zoom-in bg-white object-contain transition hover:opacity-95" />
      {open && <Lightbox src={props.src} alt={props.alt} caption={props.caption} onClose={() => setOpen(false)} />}
    </Figure>
  );
}

export function Gallery({ props }: NodeProps<{ images: { src: string; alt?: string; caption?: string }[] }>) {
  const [open, setOpen] = useState<number | null>(null);
  const images = props.images ?? [];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {images.map((im, i) => (
        <figure key={i} className="overflow-hidden rounded-lg border border-border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={im.src} alt={im.alt || ""} onClick={() => setOpen(i)}
            className="aspect-square w-full cursor-zoom-in bg-white object-cover transition hover:opacity-90" />
          {im.caption ? <figcaption className="px-2.5 py-1.5 text-[11px] text-muted-foreground">{im.caption}</figcaption> : null}
        </figure>
      ))}
      {open !== null && images[open] && <Lightbox src={images[open]!.src} alt={images[open]!.alt} caption={images[open]!.caption} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function Video({ props }: NodeProps<{ src: string; poster?: string; caption?: string }>) {
  // Play just the relevant SNIPPET: parse a `#t=start,end` fragment (from a
  // video_clip anchor) and seek to `start` on load + stop at `end`. Browsers
  // don't reliably honor the media fragment on <video>, so we drive it ourselves.
  const ref = useRef<HTMLVideoElement>(null);
  const m = /#t=(\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?/.exec(props.src || "");
  const start = m ? parseFloat(m[1]!) : 0;
  const end = m && m[2] ? parseFloat(m[2]) : undefined;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  useEffect(() => {
    const v = ref.current; if (!v || !start) return;
    const seek = () => { try { if (Math.abs(v.currentTime - start) > 0.3) v.currentTime = start; } catch { /* */ } };
    v.addEventListener("loadedmetadata", seek);
    if (v.readyState >= 1) seek();
    return () => v.removeEventListener("loadedmetadata", seek);
  }, [start]);
  useEffect(() => {
    const v = ref.current; if (!v || end === undefined) return;
    const onTime = () => { if (v.currentTime >= end && !v.paused) v.pause(); };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [end]);
  return (
    <Figure caption={props.caption} flush>
      <div className="relative">
        <video ref={ref} src={props.src} poster={props.poster} controls preload="metadata" playsInline className="max-h-[460px] w-full bg-black" />
        {(start || end !== undefined) && (
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white/90">clip {fmt(start)}{end !== undefined ? `–${fmt(end)}` : ""}</span>
        )}
      </div>
    </Figure>
  );
}

export function Audio({ props }: NodeProps<{ src: string; caption?: string }>) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <audio src={props.src} controls className="w-full" />
      {props.caption ? <div className="mt-1.5 text-[11px] text-muted-foreground">{props.caption}</div> : null}
    </div>
  );
}

// ── data ────────────────────────────────────────────────────────────────────
export function Table({ props }: NodeProps<{ columns: string[]; rows: string[][]; caption?: string }>) {
  return (
    <figure className="my-0 overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto takt-scroll">
        <table className="w-max min-w-full border-collapse text-[13px]">
          <thead><tr>{(props.columns ?? []).map((c, i) => <th key={i} className="border-b border-border bg-foreground/5 px-3 py-2 text-left font-semibold text-muted-foreground">{c}</th>)}</tr></thead>
          <tbody>{(props.rows ?? []).map((r, i) => <tr key={i} className="even:bg-foreground/[0.02]">{r.map((c, j) => <td key={j} className="border-b border-border px-3 py-2 align-top">{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {props.caption ? <figcaption className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">{props.caption}</figcaption> : null}
    </figure>
  );
}

export function Timeline({ props }: NodeProps<{ events: { date?: string; title: string; body?: string }[] }>) {
  return (
    <ol className="relative ml-2 space-y-4 border-l border-border pl-5">
      {(props.events ?? []).map((e, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[26px] top-1 size-3 rounded-full border-2 border-background bg-arc" />
          {e.date ? <div className="text-[11px] font-medium uppercase tracking-wide text-arc">{e.date}</div> : null}
          <div className="text-[13px] font-semibold">{e.title}</div>
          {e.body ? <div className="mt-0.5 text-[13px] text-muted-foreground">{e.body}</div> : null}
        </li>
      ))}
    </ol>
  );
}

export function Steps({ props }: NodeProps<{ steps: { title: string; body?: string }[] }>) {
  return (
    <ol className="space-y-0">
      {(props.steps ?? []).map((s, i, arr) => (
        <li key={i} className="relative pb-4 pl-10 last:pb-0">
          {i < arr.length - 1 ? <span className="absolute left-[13px] top-6 h-full w-px bg-border" /> : null}
          <span className="absolute left-0 top-0 grid size-7 place-items-center rounded-full bg-arc-soft text-[12px] font-semibold text-arc">{i + 1}</span>
          <div className="pt-0.5 text-[13px] font-semibold">{s.title}</div>
          {s.body ? <div className="mt-0.5 text-[13px] text-muted-foreground">{s.body}</div> : null}
        </li>
      ))}
    </ol>
  );
}

// ── reference ─────────────────────────────────────────────────────────────────
export function Citation({ props, ctx }: NodeProps<{ page: number; label?: string; productSlug?: string }>) {
  return (
    <button onClick={() => ctx.onCitation?.(props.page, props.productSlug)}
      className="inline-flex items-center gap-1 rounded-md bg-arc-soft px-1.5 py-0.5 align-baseline font-mono text-[11px] font-semibold text-arc transition hover:brightness-95">
      {props.label ?? `p.${props.page}`}
    </button>
  );
}

export function SourceCard({ props, ctx }: NodeProps<{ title: string; page?: number; url?: string; caption?: string }>) {
  return (
    <button onClick={() => ctx.onSource?.({ page: props.page, url: props.url, title: props.title, caption: props.caption })}
      className="flex w-full items-start gap-3 rounded-lg border border-border bg-card p-3 text-left transition hover:border-border-heavy">
      <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span>
        <span className="block text-[13px] font-medium">{props.title}</span>
        {props.caption ? <span className="mt-0.5 block text-[12px] text-muted-foreground">{props.caption}</span> : null}
        {props.page ? <span className="mt-0.5 block font-mono text-[11px] text-arc">p.{props.page}</span> : null}
      </span>
    </button>
  );
}

// ── interactive ────────────────────────────────────────────────────────────────
export function Button({ props, ctx }: NodeProps<{ label: string; actionId: string; value?: string; variant?: string }>) {
  const [busy, setBusy] = useState(false);
  const primary = props.variant !== "secondary";
  const run = async () => { setBusy(true); try { await ctx.onAction?.(props.actionId, props.value ?? props.label); } finally { setBusy(false); } };
  return (
    <button disabled={ctx.readOnly || busy} onClick={run}
      className={cn("rounded-lg px-4 py-2 text-[13px] font-medium transition disabled:opacity-50",
        primary ? "bg-accent text-white hover:brightness-110" : "border border-border bg-card hover:bg-foreground/[0.04]")}>
      {props.label}
    </button>
  );
}

export function Select({ props, ctx, bind }: NodeProps<{ actionId?: string; label?: string; options: string[]; placeholder?: string }>) {
  const [local, setLocal] = useState("");
  const bound = bind && ctx.data;
  const v = bound ? String(ctx.data!.get(bind) ?? "") : local;
  const onChange = (val: string) => {
    if (bound) ctx.data!.set(bind, val); else setLocal(val);
    if (props.actionId) ctx.onAction?.(props.actionId, val); // also feed the agent if wired
  };
  return (
    <label className="block">
      {props.label ? <span className="mb-1 block text-[12px] font-medium text-muted-foreground">{props.label}</span> : null}
      <select value={v} disabled={ctx.readOnly}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-accent disabled:opacity-50">
        <option value="" disabled>{props.placeholder ?? "Select…"}</option>
        {(props.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

// ── bound inputs (two-way binding to the surface `data` via the node's `bind`) ─
const boundInput = "w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-accent disabled:opacity-50";

export function Input({ props, ctx, bind }: NodeProps<{ label?: string; placeholder?: string; kind?: string }>) {
  const val = bind && ctx.data ? ctx.data.get(bind) : undefined;
  return (
    <label className="block">
      {props.label ? <span className="mb-1 block text-[12px] font-medium text-muted-foreground">{props.label}</span> : null}
      <input type={props.kind === "number" ? "number" : "text"} disabled={ctx.readOnly || !ctx.data} placeholder={props.placeholder}
        value={val == null ? "" : String(val)} className={boundInput}
        onChange={(e) => bind && ctx.data?.set(bind, props.kind === "number" ? Number(e.target.value) : e.target.value)} />
    </label>
  );
}

export function Slider({ props, ctx, bind }: NodeProps<{ label?: string; min?: number; max?: number; step?: number }>) {
  const min = props.min ?? 0, max = props.max ?? 100, step = props.step ?? 1;
  const val = Number((bind && ctx.data ? ctx.data.get(bind) : undefined) ?? min);
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[12px] font-medium text-muted-foreground">
        <span>{props.label}</span><span className="tabular-nums text-foreground">{val}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={val} disabled={ctx.readOnly || !ctx.data}
        onChange={(e) => bind && ctx.data?.set(bind, Number(e.target.value))} className="w-full accent-[var(--accent)]" />
    </label>
  );
}

export function Toggle({ props, ctx, bind }: NodeProps<{ label?: string }>) {
  const on = Boolean(bind && ctx.data ? ctx.data.get(bind) : false);
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input type="checkbox" checked={on} disabled={ctx.readOnly || !ctx.data}
        onChange={(e) => bind && ctx.data?.set(bind, e.target.checked)} className="size-4 accent-[var(--accent)]" />
      {props.label}
    </label>
  );
}

type Field = { name: string; label: string; type?: string; options?: string[]; placeholder?: string; required?: boolean };
export function Form({ props, ctx }: NodeProps<{ actionId: string; fields: Field[]; submitLabel?: string }>) {
  const [vals, setVals] = useState<Record<string, string | boolean>>({});
  const [done, setDone] = useState(false);
  const set = (n: string, v: string | boolean) => setVals((s) => ({ ...s, [n]: v }));
  const submit = async (e: React.FormEvent) => { e.preventDefault(); await ctx.onAction?.(props.actionId, vals); setDone(true); };
  const disabled = ctx.readOnly || done;
  const inputCls = "w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-accent disabled:opacity-60";
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      {(props.fields ?? []).map((f) => (
        <label key={f.name} className="block">
          <span className="mb-1 block text-[12px] font-medium text-muted-foreground">{f.label}{f.required ? " *" : ""}</span>
          {f.type === "textarea" ? (
            <textarea disabled={disabled} required={f.required} placeholder={f.placeholder} rows={3} className={inputCls} value={String(vals[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />
          ) : f.type === "select" ? (
            <select disabled={disabled} required={f.required} className={inputCls} value={String(vals[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)}>
              <option value="" disabled>{f.placeholder ?? "Select…"}</option>
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.type === "checkbox" ? (
            <input type="checkbox" disabled={disabled} checked={Boolean(vals[f.name])} onChange={(e) => set(f.name, e.target.checked)} className="size-4 accent-[var(--accent)]" />
          ) : (
            <input type={f.type === "number" ? "number" : "text"} disabled={disabled} required={f.required} placeholder={f.placeholder} className={inputCls} value={String(vals[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)} />
          )}
        </label>
      ))}
      <button type="submit" disabled={disabled} className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white transition hover:brightness-110 disabled:opacity-50">
        {done ? "Submitted" : props.submitLabel ?? "Submit"}
      </button>
    </form>
  );
}

// Turn `[p.18]` links (takt:cite scheme, emitted by the markdown pipeline) into
// clickable citation chips wired to the host.
function citationLink(ctx: NodeProps["ctx"]) {
  return ({ href, children }: { href: string; children: ReactNode }) => {
    if (!href?.startsWith("takt:cite:")) return undefined;
    const [, , page, slug] = href.split(":");
    return (
      <button onClick={() => ctx.onCitation?.(Number(page), slug || undefined)}
        className="inline-flex items-center rounded-md bg-arc-soft px-1.5 py-0.5 align-baseline font-mono text-[11px] font-semibold text-arc transition hover:brightness-95">
        {children}
      </button>
    );
  };
}
