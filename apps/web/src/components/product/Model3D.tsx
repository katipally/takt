"use client";

import { useEffect, useRef, useState } from "react";
import { Expand } from "lucide-react";
import { Figure } from "./parts";

// Interactive 3D viewer for ingested /assets/*.glb parts. Uses <model-viewer>
// (a maintained three.js wrapper): orbit/zoom/pan via `camera-controls`, IBL via
// `environment-image="neutral"` so the default-material meshes actually shade,
// a ground shadow, and a fullscreen button. The custom element registers once.
let registered = false;

export function Model3D({ props }: { props: { src: string; alt?: string; caption?: string } }) {
  const { src, alt, caption } = props;
  const [ready, setReady] = useState(registered);
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (registered) { setReady(true); return; }
    let alive = true;
    import("@google/model-viewer").then(() => { registered = true; if (alive) setReady(true); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, []);

  const expand = () => { const el = ref.current?.querySelector("model-viewer") as HTMLElement | null; el?.requestFullscreen?.(); };

  return (
    <Figure caption={caption} flush>
      <div ref={ref} className="relative overflow-hidden rounded-lg">
        {err ? (
          <div className="grid h-[300px] place-items-center bg-surface text-[12px] text-muted-foreground">Couldn’t load the 3D viewer.</div>
        ) : ready ? (
          <>
            {/* model-viewer is a custom element registered at runtime; typed in OverlayLayer.tsx */}
            <model-viewer
              src={src}
              alt={alt || "3D model"}
              camera-controls
              auto-rotate
              auto-rotate-delay="800"
              rotation-per-second="16deg"
              interaction-prompt="none"
              environment-image="neutral"
              shadow-intensity="1.1"
              shadow-softness="0.9"
              exposure="1.15"
              touch-action="pan-y"
              onError={() => setErr(true)}
              style={{ width: "100%", height: "440px", background: "radial-gradient(120% 100% at 50% 0%, var(--surface), var(--card))" }}
            />
            <button onClick={expand} title="Fullscreen" aria-label="Fullscreen"
              className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg border border-border bg-card/80 text-muted-foreground backdrop-blur transition hover:text-foreground">
              <Expand className="size-4" />
            </button>
            <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/85">drag to rotate · scroll to zoom</div>
          </>
        ) : (
          <div className="grid h-[440px] place-items-center bg-surface text-[12px] text-muted-foreground">Loading 3D model…</div>
        )}
      </div>
    </Figure>
  );
}
