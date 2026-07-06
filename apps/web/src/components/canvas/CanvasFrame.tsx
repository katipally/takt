"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { X } from "lucide-react";
import { Model3D } from "@/components/ui-catalog/Model3D";
import type { RenderCtx } from "@/components/ui-catalog/ctx";

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

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data;
      if (!d || !d.__takt || e.source !== ref.current?.contentWindow) return;
      if (d.type === "ready") setReady(true);
      else if (d.type === "height") setH(Math.min(6000, Math.max(120, d.height + 8)));
      else if (d.type === "cite") ctx.onCitation?.(Number(d.page) || 0, d.product ?? undefined);
      else if (d.type === "action") ctx.onAction?.(String(d.id ?? "action"), d.value);
      else if (d.type === "model" && typeof d.src === "string") setModel({ src: d.src, caption: d.caption });
      else if (d.type === "link" && typeof d.url === "string") window.open(d.url, "_blank", "noopener");
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [ctx]);

  // Post the page once the frame is ready; re-post on content/theme change.
  useEffect(() => {
    if (!ready) return;
    ref.current?.contentWindow?.postMessage(
      { __takt: true, type: "render", html: props.html ?? "", css: props.css ?? "", theme: resolvedTheme },
      "*",
    );
  }, [ready, props.html, props.css, resolvedTheme]);

  return (
    <>
      <iframe
        ref={ref}
        src="/canvas-host"
        sandbox="allow-scripts"
        title="Answer"
        className="w-full"
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
    </>
  );
}
