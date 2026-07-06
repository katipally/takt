"use client";

import { useEffect, useState } from "react";
import { Figure } from "./parts";

// Lazy <model-viewer> web component for ingested /assets/*.glb models. The custom
// element is registered on first mount only.
let registered = false;
export function Model3D({ props }: { props: { src: string; alt?: string; caption?: string } }) {
  const { src, alt, caption } = props;
  const [ready, setReady] = useState(registered);
  useEffect(() => {
    if (registered) return;
    let alive = true;
    import("@google/model-viewer").then(() => { registered = true; if (alive) setReady(true); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return (
    <Figure caption={caption} flush>
      {ready
        // @ts-expect-error — model-viewer is a custom element registered at runtime
        ? <model-viewer src={src} alt={alt || "3D model"} camera-controls auto-rotate ar style={{ width: "100%", height: "360px", background: "var(--surface)" }} />
        : <div className="grid h-[360px] place-items-center bg-surface text-[12px] text-muted-foreground">Loading 3D model…</div>}
    </Figure>
  );
}
