"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

// Renders arbitrary artifact code inside the sandboxed cross-origin-style iframe.
// Code is pushed via postMessage (never same-origin fetched), so model code runs
// with allow-scripts only and can't reach the app's cookies/DOM/storage. Used by
// both the saved-artifact canvas and the one-off render area in the Ask modal.
export function InlineArtifactFrame({
  code, kind, title, className,
}: { code: string; kind: "react" | "html"; title?: string; className?: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const readyRef = useRef(false);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  const push = useCallback(() => {
    if (!frameRef.current?.contentWindow) return;
    frameRef.current.contentWindow.postMessage({ __prox: true, type: "render", code, kind, theme }, "*");
  }, [code, kind, theme]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d?.__prox || e.source !== frameRef.current?.contentWindow) return;
      if (d.type === "height" && typeof d.height === "number") setHeight(Math.max(160, Math.min(d.height, 4000)));
      if (d.type === "ready") { readyRef.current = true; push(); }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [push]);

  // Re-push when the code changes (e.g. switching question/option renders).
  useEffect(() => { if (readyRef.current) push(); }, [push]);

  return (
    <iframe
      ref={frameRef}
      src={`/artifact-host?t=${theme}`}
      sandbox="allow-scripts"
      onLoad={() => { if (readyRef.current) push(); }}
      title={title ?? "artifact"}
      style={{ height }}
      className={cn("block w-full", className)}
    />
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
export function ArtifactFrame({ artifactId }: { artifactId: string }) {
  const { data: artifact, isLoading } = useQuery({
    queryKey: ["artifact", artifactId],
    queryFn: () => api.artifact(artifactId),
  });
  if (isLoading) return <div className="p-6 text-[12px] text-muted-foreground">Loading artifact…</div>;
  if (!artifact) return <div className="p-6 text-[12px] text-muted-foreground">Artifact not found.</div>;
  return <InlineArtifactFrame code={artifact.code} kind={artifact.kind} title={artifact.title} />;
}
