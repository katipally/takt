"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Loader2, RotateCw, WifiOff } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

// Centered on-brand spinner shown while an artifact loads or its iframe mounts.
function ArtifactSpinner({ label = "Rendering…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-[12px] text-muted-foreground">
      <Loader2 className="size-4 animate-spin text-arc" /> {label}
    </div>
  );
}

// Renders arbitrary artifact code inside the sandboxed cross-origin-style iframe.
// Code is pushed via postMessage (never same-origin fetched), so model code runs
// with allow-scripts only and can't reach the app's cookies/DOM/storage. Used by
// both the saved-artifact canvas and the one-off render area in the Ask modal.
export function InlineArtifactFrame({
  code, kind, title, className, fill,
}: { code: string; kind: "react" | "html"; title?: string; className?: string; fill?: boolean }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const renderedRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  const push = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ __prox: true, type: "render", code, kind, theme }, "*");
  }, [code, kind, theme]);

  const markRendered = () => { renderedRef.current = true; setRendered(true); setFailed(false); };

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d?.__prox || e.source !== frameRef.current?.contentWindow) return;
      // `rendered` (mount ack) clears the spinner in both modes; `height` also
      // sizes the iframe in auto mode (fill mode keeps it at 100%).
      if (d.type === "rendered") markRendered();
      if (d.type === "height" && typeof d.height === "number") { if (!fill) setHeight(Math.max(160, Math.min(d.height, 16000))); markRendered(); }
      if (d.type === "ready") push();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [push, fill]);

  // Push the code and keep retrying until the iframe acknowledges. The host's
  // `ready` ping can race a remount, so don't rely on it alone — this retry
  // (plus the host re-announcing `ready`) guarantees the code lands.
  useEffect(() => {
    renderedRef.current = false;
    setRendered(false);
    setFailed(false);
    let n = 0;
    push();
    const id = setInterval(() => {
      if (renderedRef.current) { clearInterval(id); return; }
      // ~20s of pushes covers a cold CDN load + the ready/ack race. If the host
      // still hasn't acked, its runtime deps (esm.sh/Babel/Tailwind) likely
      // failed to fetch — surface a retry instead of an infinite spinner.
      if (n++ > 100) { clearInterval(id); setFailed(true); return; }
      push();
    }, 200);
    return () => clearInterval(id);
  }, [push, reloadKey]);

  // Reload the iframe (new src) so it re-fetches the CDN runtime, then re-push.
  const retry = () => { setFailed(false); setReloadKey((k) => k + 1); };

  return (
    <div className={cn("relative w-full", fill && "h-full")}>
      <iframe
        ref={frameRef}
        src={`/artifact-host?t=${theme}${fill ? "&m=fill" : ""}&r=${reloadKey}`}
        sandbox="allow-scripts"
        onLoad={push}
        title={title ?? "artifact"}
        style={fill ? undefined : { height }}
        className={cn("block w-full", fill && "h-full", className)}
      />
      {!rendered && !failed && (
        <div className="absolute inset-0 grid place-items-center bg-background">
          <ArtifactSpinner label="Rendering artifact…" />
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center gap-3 bg-background p-6 text-center">
          <WifiOff className="size-5 text-muted-foreground" />
          <div className="text-[12px] text-muted-foreground">
            Couldn&apos;t load the artifact runtime.<br />Check your connection and retry.
          </div>
          <button
            onClick={retry}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium hover:bg-muted"
          >
            <RotateCw className="size-3.5" /> Retry
          </button>
        </div>
      )}
    </div>
  );
}

// A small, non-interactive live preview of an artifact, for the rail. Renders
// the real artifact at a virtual width and scales it down into a fixed box.
export function ArtifactThumb({ artifactId }: { artifactId: string }) {
  return (
    <div className="pointer-events-none h-[72px] w-full overflow-hidden rounded-md border border-border bg-card">
      <div style={{ width: "250%", transform: "scale(0.4)", transformOrigin: "top left" }}>
        <ArtifactFrame artifactId={artifactId} />
      </div>
    </div>
  );
}

// Thin wrapper that loads a saved artifact by id, then renders it inline.
// `fill` lets the panel render it as a full-height, internally-scrolling frame.
export function ArtifactFrame({ artifactId, fill }: { artifactId: string; fill?: boolean }) {
  const { data: artifact, isLoading } = useQuery({
    queryKey: ["artifact", artifactId],
    queryFn: () => api.artifact(artifactId),
  });
  if (isLoading) return <ArtifactSpinner label="Loading artifact…" />;
  if (!artifact) return <div className="p-6 text-[12px] text-muted-foreground">Artifact not found.</div>;
  return <InlineArtifactFrame code={artifact.code} kind={artifact.kind} title={artifact.title} fill={fill} />;
}
