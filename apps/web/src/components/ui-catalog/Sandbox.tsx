"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

// Escape hatch: arbitrary React, server-bundled by /api/sandbox into one IIFE
// (curated deps, no CDN/Babel), then evaluated inside a sandboxed iframe. The
// bundle is cached by content hash server-side, and by react-query client-side.
async function bundle(code: string): Promise<{ js?: string; error?: string }> {
  const r = await fetch("/api/sandbox", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
  return r.json();
}

export function Sandbox({ props, onAction }: { props: { code: string; height?: number }; onAction?: (v: unknown) => void }) {
  const { code, height } = props;
  const ref = useRef<HTMLIFrameElement>(null);
  const { resolvedTheme } = useTheme();
  const [h, setH] = useState(height ?? 320);
  const [frameReady, setFrameReady] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["sandbox", code],
    queryFn: () => bundle(code),
    staleTime: Infinity, retry: false,
  });
  const js = data?.js;

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data;
      if (!d || !d.__takt || e.source !== ref.current?.contentWindow) return;
      if (d.type === "ready") setFrameReady(true);
      if (d.type === "height" && !height) setH(Math.min(1400, Math.max(120, d.height)));
      if (d.type === "action") onAction?.(d.value);
      if (d.type === "link" && typeof d.url === "string") window.open(d.url, "_blank", "noopener");
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [height, onAction]);

  // Post the bundle once both the frame and the JS are ready; re-post on theme flip.
  useEffect(() => {
    if (frameReady && js) ref.current?.contentWindow?.postMessage({ __takt: true, type: "render", js, theme: resolvedTheme }, "*");
  }, [frameReady, js, resolvedTheme]);

  if (isError || data?.error)
    return <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-[12px] text-muted-foreground">Interactive block failed to build{data?.error ? `: ${data.error}` : ""}.</div>;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)]">
      {isLoading && <div className="absolute inset-0 z-10 grid place-items-center bg-card"><Loader2 className="size-5 animate-spin text-arc" /></div>}
      <iframe ref={ref} src="/sandbox-host" sandbox="allow-scripts" title="Interactive" className="w-full" style={{ height: h, border: 0 }} />
    </div>
  );
}
