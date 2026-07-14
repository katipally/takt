"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { chatStore, type CanvasPart, type SourcePart } from "@/lib/chatStore";
import { api } from "@/lib/api";
import { useUi } from "@/lib/uiStore";
import { buildFrameSrcdoc, prepareCanvasHtml, FRAME_MSG } from "@/lib/canvas/frame";

// The canvas renders inside a SANDBOXED IFRAME (sandbox="allow-scripts allow-modals",
// no allow-same-origin → opaque origin, no cookies/storage/parent access). The frame
// owns its whole document, so the model's CSS/JS can never collide with the app, the
// container-query grid can't collapse, and islands can't be wiped — the failures of
// the old direct-DOM/morphdom renderer. We set srcdoc ONCE, when the turn's stream
// has stopped (the finished page), and never paint the partial stream. The in-frame
// runtime posts island clicks (cite/lightbox/action/select) + its content height back
// up here; we bridge them into the app and push theme down.

export function Canvas({ part, chatId, productSlug, streaming }: {
  part: CanvasPart;
  chatId: string;
  productSlug: string | null;
  streaming: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);
  const [height, setHeight] = useState(320);
  const highlight = useUi((s) => s.canvasHighlight);

  const ready = !streaming && !!part.html;

  // Build + inject the finished document once the stream stops. Re-inject on html
  // change (an edit/verify-fix pass produces a new final html for the same part).
  useEffect(() => {
    if (!frameRef.current || !ready) return;
    let cancelled = false;
    const dark = document.documentElement.classList.contains("dark");
    // Pre-render mermaid (async) in the parent, then inject the finished document.
    prepareCanvasHtml(part.html, { dark })
      .then((h) => buildFrameSrcdoc(h, { dark }))
      .then((doc) => {
        if (!cancelled && frameRef.current) frameRef.current.srcdoc = doc;
      });
    return () => { cancelled = true; };
  }, [ready, part.html]);

  // Bridge messages FROM the frame. Validate the source is our frame's window.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const f = frameRef.current;
      if (!f || e.source !== f.contentWindow) return;
      const d = e.data;
      if (!d || d.__takt !== 1) return;
      switch (d.type) {
        case FRAME_MSG.ready:
          postTheme();
          break;
        case FRAME_MSG.size:
          if (typeof d.h === "number") setHeight(Math.max(120, Math.ceil(d.h)));
          break;
        case FRAME_MSG.cite:
          openCite(chatId, productSlug, d.page, d.product);
          break;
        case FRAME_MSG.lightbox:
          setLightbox({ src: d.src, caption: d.caption || "" });
          break;
        case FRAME_MSG.action:
          // A <takt-action> button continues the conversation with its value.
          chatStore.send(chatId, productSlug, String(d.value ?? d.id ?? "").trim(), undefined);
          break;
        case FRAME_MSG.select:
          // Re-dispatch as the CustomEvent the Workbench already listens for.
          document.dispatchEvent(new CustomEvent("takt:select", { detail: { id: d.id, text: d.text } }));
          break;
        case FRAME_MSG.wheel: {
          // The frame forwards wheel deltas it can't consume (its document never
          // scrolls — auto-height). Scroll the nearest scrollable ancestor, else
          // scrolling dies whenever the pointer is over the canvas.
          let el: HTMLElement | null = frameRef.current;
          while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
          (el ?? (document.scrollingElement as HTMLElement | null))?.scrollBy({ top: d.dy || 0, left: d.dx || 0 });
          break;
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [chatId, productSlug]);

  // Push theme down whenever the app theme flips (next-themes toggles .dark).
  const postTheme = () => {
    const f = frameRef.current;
    f?.contentWindow?.postMessage({ type: FRAME_MSG.theme, dark: document.documentElement.classList.contains("dark") }, "*");
  };
  useEffect(() => {
    const obs = new MutationObserver(() => postTheme());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Agent-driven highlight (select_canvas → canvas_highlight): ring + scroll inside
  // the frame.
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ type: FRAME_MSG.highlight, id: highlight.id }, "*");
  }, [highlight.id, highlight.nonce]);

  return (
    <>
      {ready ? (
        <iframe
          ref={frameRef}
          title="Canvas"
          sandbox="allow-scripts allow-modals"
          className="block w-full border-0"
          style={{ height, background: "transparent" }}
        />
      ) : (
        // Build frontier — shimmer skeleton while the page composes (we never paint
        // the partial stream; the finished document swaps in once the stream stops).
        <div className="takt-building mx-auto w-full max-w-[68ch] px-[clamp(16px,4cqi,56px)] py-10" aria-hidden>
          <div className="sk sk-line" style={{ width: "38%" }} />
          <div className="sk sk-block" />
          <div className="sk sk-line" style={{ width: "86%" }} />
          <div className="sk sk-line" style={{ width: "64%" }} />
        </div>
      )}
      {lightbox && <Lightbox {...lightbox} onClose={() => setLightbox(null)} />}
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
