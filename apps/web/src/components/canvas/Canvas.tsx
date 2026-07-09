"use client";

import { createElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { chatStore, type CanvasPart, type SourcePart } from "@/lib/chatStore";
import { api } from "@/lib/api";
import { useUi } from "@/lib/uiStore";
import { registerIslands, highlightBlock } from "@/lib/canvas/islands";
import { applyCanvasHtml } from "@/lib/canvas/stream";

// The canvas: the streamed HTML page rendered DIRECTLY into the app document
// (morphdom, no iframe). It shares the app's stylesheet + .dark toggle, so the
// design system and theme "just work". The island custom elements dispatch
// bubbling CustomEvents which we bridge here into the app: citations open the
// source modal, figures/3D open a lightbox, actions are acked (TODO), and block
// selection bubbles to the Workbench.

export function Canvas({ part, chatId, productSlug, streaming }: {
  part: CanvasPart;
  chatId: string;
  productSlug: string | null;
  streaming: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const [model, setModel] = useState<{ src: string; caption: string } | null>(null);
  const highlight = useUi((s) => s.canvasHighlight);

  useEffect(() => { registerIslands(); }, []);

  // Render / diff the HTML on every change; final (sanitized + scripts) once the
  // stream for this turn has stopped.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    applyCanvasHtml(el, part.html, { final: !streaming });
  }, [part.html, streaming]);

  // Agent-driven highlight (select_canvas → canvas_highlight): ring + scroll.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    highlightBlock(el, highlight.id);
  }, [highlight.id, highlight.nonce]);

  // Bridge island events. takt:select bubbles past us to document (the Workbench
  // listens there to scope the next message).
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onCite = (e: Event) => { const d = (e as CustomEvent).detail; openCite(chatId, productSlug, d.page, d.product); };
    const onLightbox = (e: Event) => setLightbox((e as CustomEvent).detail);
    const onModel = (e: Event) => setModel((e as CustomEvent).detail);
    const onAction = (e: Event) => { /* TODO: continue the turn with the action value */ void (e as CustomEvent).detail; };
    el.addEventListener("takt:cite", onCite);
    el.addEventListener("takt:lightbox", onLightbox);
    el.addEventListener("takt:model", onModel);
    el.addEventListener("takt:action", onAction);
    return () => {
      el.removeEventListener("takt:cite", onCite);
      el.removeEventListener("takt:lightbox", onLightbox);
      el.removeEventListener("takt:model", onModel);
      el.removeEventListener("takt:action", onAction);
    };
  }, [chatId, productSlug]);

  return (
    <>
      <div ref={ref} className="takt-page" />
      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
      {model && <ModelModal {...model} onClose={() => setModel(null)} />}
    </>
  );
}

// Open the manual page for a citation. Prefer a source part already streamed for
// this page; fall back to fetching it by product + page.
function openCite(chatId: string, productSlug: string | null, page: number, product: string | null) {
  const s = chatStore.getSession(chatId);
  let match: SourcePart | undefined;
  for (const n of s.messages) {
    if (n.role !== "assistant") continue;
    for (const p of n.parts) {
      if (p.kind === "source" && p.page === page && (!product || !p.productSlug || p.productSlug === product)) match = p;
    }
  }
  if (match) {
    chatStore.openSource(chatId, { url: match.url, page: match.page, manualKind: match.manualKind, manualTitle: match.manualTitle, caption: match.caption, productSlug: match.productSlug });
    return;
  }
  const slug = product ?? productSlug;
  if (!slug) return;
  api.page(slug, page).then((r) =>
    chatStore.openSource(chatId, { url: r.url, page: r.page, manualKind: r.manualKind, manualTitle: r.manualTitle, caption: r.caption, productSlug: slug }),
  ).catch(() => { /* page not found */ });
}

function Lightbox({ src, caption, onClose }: { src: string; caption: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-6" onClick={onClose}>
      <div className="relative max-h-[90vh] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={caption} className="max-h-[86vh] max-w-full rounded-lg object-contain" />
        {caption && <div className="mt-2 text-center text-[12px] text-white/80">{caption}</div>}
        <button onClick={onClose} aria-label="Close" className="absolute -right-3 -top-3 grid size-8 place-items-center rounded-full bg-card text-foreground shadow-lg"><X className="size-4" /></button>
      </div>
    </div>,
    document.body,
  );
}

// 3D part viewer — lazy-loads @google/model-viewer (already a dep) on open.
function ModelModal({ src, caption, onClose }: { src: string; caption: string; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    import("@google/model-viewer").then(() => { if (alive) setReady(true); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-6" onClick={onClose}>
      <div className="relative flex h-[70vh] w-[min(880px,92vw)] flex-col overflow-hidden rounded-2xl border border-border bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <span className="text-[13px] font-medium text-foreground">{caption}</span>
          <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="relative flex-1">
          {err ? (
            <div className="grid h-full place-items-center text-[12px] text-muted-foreground">Couldn’t load the 3D viewer.</div>
          ) : ready ? (
            createElement("model-viewer", {
              src, alt: caption, "camera-controls": true, "auto-rotate": true, "environment-image": "neutral",
              "shadow-intensity": "1.1", exposure: "1.15", "touch-action": "pan-y",
              style: { width: "100%", height: "100%", background: "radial-gradient(120% 100% at 50% 0%, var(--surface), var(--card))" },
            })
          ) : (
            <div className="grid h-full place-items-center text-[12px] text-muted-foreground">Loading 3D model…</div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
