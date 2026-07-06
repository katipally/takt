"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

// Escape hatch: arbitrary server-bundled React runs in a sandboxed iframe (no
// same-origin). The agent posts pre-bundled JS (esbuild, curated deps) so there
// is no CDN/Babel at runtime. Host is /sandbox-host (built in the sandbox phase).
export function Sandbox({ props }: { props: { code: string; height?: number } }) {
  const { code, height } = props;
  const ref = useRef<HTMLIFrameElement>(null);
  const { resolvedTheme } = useTheme();
  const [h, setH] = useState(height ?? 320);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data;
      if (!d || !d.__takt || e.source !== ref.current?.contentWindow) return;
      if (d.type === "ready") { post(); setReady(true); }
      if (d.type === "height" && !height) setH(Math.min(1200, Math.max(120, d.height)));
    }
    function post() {
      ref.current?.contentWindow?.postMessage({ __takt: true, type: "render", code, theme: resolvedTheme }, "*");
    }
    window.addEventListener("message", onMsg);
    if (ready) post(); // re-post on theme change
    return () => window.removeEventListener("message", onMsg);
  }, [code, resolvedTheme, height, ready]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)]">
      <iframe ref={ref} src="/sandbox-host" sandbox="allow-scripts" title="Interactive"
        className="w-full" style={{ height: h, border: 0 }} />
    </div>
  );
}
