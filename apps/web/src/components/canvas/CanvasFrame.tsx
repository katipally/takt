"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { X } from "lucide-react";
import { Model3D } from "@/components/ui-catalog/Model3D";
import type { RenderCtx } from "@/components/ui-catalog/ctx";
import { useUi } from "@/lib/uiStore";

// Renders a freeform `Page` surface: the model's HTML/CSS runs in a sandboxed,
// auto-sizing iframe (/canvas-host) with the Takt design system loaded. Island
// custom elements inside the page postMessage back here so grounded media +
// citations stay first-class and safe:
//   cite   → open the exact manual page (ctx.onCitation)
//   action → submit a Button/Form value back to the agent (ctx.onAction)
//   model  → open the real interactive 3D part in a modal (reuses Model3D)
//   link   → open externally
// Mirrors the Sandbox iframe bridge; no allow-same-origin, strict CSP in the host.
export function CanvasFrame({ props, ctx }: { props: { html?: string; css?: string }; ctx: RenderCtx }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const { resolvedTheme } = useTheme();
  const [h, setH] = useState(360);
  const [ready, setReady] = useState(false);
  const [model, setModel] = useState<{ src: string; caption?: string } | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; caption?: string } | null>(null);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data;
      if (!d || !d.__takt || e.source !== ref.current?.contentWindow) return;
      if (d.type === "ready") setReady(true);
      else if (d.type === "height") setH(Math.min(12000, Math.max(120, d.height + 8)));
      else if (d.type === "cite") ctx.onCitation?.(Number(d.page) || 0, d.product ?? undefined);
      else if (d.type === "action") ctx.onAction?.(String(d.id ?? "action"), d.value);
      else if (d.type === "select" && typeof d.id === "string") ctx.onSelect?.({ id: d.id, text: String(d.text ?? "").slice(0, 240) });
      // The iframe is untrusted — only act on a same-origin /assets model and an
      // http(s) link; never open a javascript:/data: url or fetch an arbitrary src.
      else if (d.type === "model" && typeof d.src === "string" && d.src.startsWith("/assets/")) setModel({ src: d.src, caption: d.caption });
      else if (d.type === "lightbox" && typeof d.src === "string" && (d.src.startsWith("/assets/") || d.src.startsWith("data:image/"))) setLightbox({ src: d.src, caption: d.caption });
      else if (d.type === "link" && typeof d.url === "string" && /^https?:\/\//i.test(d.url)) window.open(d.url, "_blank", "noopener");
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [ctx]);

  // Post the full page when ready or when its html/css changes. While the surface is
  // a mid-stream PARTIAL, tell the host to strip <script> and skip running them (so a
  // half-written page streams in smoothly and scripts only fire once, on the final).
  useEffect(() => {
    if (!ready) return;
    ref.current?.contentWindow?.postMessage(
      { __takt: true, type: "render", html: props.html ?? "", css: props.css ?? "", theme: resolvedTheme, partial: !!ctx.partial },
      "*",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.html, props.css, ctx.partial]);

  // A theme flip is a cheap class toggle in the host — don't re-render the whole
  // page (that would rebuild every island and lose annotation-drag / input state).
  useEffect(() => {
    if (!ready) return;
    ref.current?.contentWindow?.postMessage({ __takt: true, type: "theme", theme: resolvedTheme }, "*");
  }, [ready, resolvedTheme]);

  // Agent-driven selection (select_canvas): ring + scroll a block into view. Nonce
  // makes re-highlighting the same block re-fire.
  const highlight = useUi((s) => s.canvasHighlight);
  useEffect(() => {
    if (!ready) return;
    ref.current?.contentWindow?.postMessage({ __takt: true, type: "highlight", id: highlight.id }, "*");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, highlight.nonce]);

  return (
    <>
      <iframe
        ref={ref}
        src="/canvas-host"
        sandbox="allow-scripts"
        title="Answer"
        className="w-full"
        // Fallback: if the host's 'ready' postMessage is ever missed, onLoad still
        // flips ready so the page renders (the inline host runtime is live by load).
        onLoad={() => setReady(true)}
        style={{ height: h, border: 0, background: "transparent", display: "block" }}
      />
      {model && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={() => setModel(null)}>
          <div className="relative w-full max-w-3xl rounded-2xl border border-border bg-card p-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setModel(null)} aria-label="Close"
              className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-surface text-muted-foreground transition hover:text-foreground">
              <X className="size-4" />
            </button>
            <Model3D props={{ src: model.src, caption: model.caption }} />
          </div>
        </div>
      )}
      {lightbox && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/85 p-5" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.src} alt={lightbox.caption ?? ""} className="max-h-[92vh] max-w-[96vw] rounded-lg object-contain" />
          {lightbox.caption && <div className="pointer-events-none absolute inset-x-0 bottom-5 mx-auto max-w-2xl px-6 text-center text-[13px] text-white/80">{lightbox.caption}</div>}
        </div>
      )}
    </>
  );
}
