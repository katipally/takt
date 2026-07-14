"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useLiveStore, type LiveOverlay } from "@/lib/live/liveStore";

// The remote-expert surface: ONE visual the agent pins over the live call while
// talking — a rotatable 3D part, a manual figure, or a repair clip. Rendered as
// a floating card above the orb; "note" overlays are anchored onto the camera
// tile by InCall (see NotePin), not here. Ephemeral by design: a new overlay
// replaces the last, `clear` (or the ✕) takes it down, nothing persists.

// <model-viewer> is a custom element — registered on demand, app-side (the
// canvas iframe has its own vendored copy; this is the live-call copy). The
// `ar` attributes let a phone place the part in the room (WebXR / Scene Viewer
// / Quick Look); on desktop it's a normal orbit/zoom viewer.
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      // Custom element — attributes are the element's own kebab-case strings,
      // so accept any extra key (Model3D uses more of them than we do here).
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        [attr: string]: unknown;
      };
    }
  }
}

let mvLoaded = false;
function useModelViewer(active: boolean) {
  const [ready, setReady] = useState(mvLoaded);
  useEffect(() => {
    if (!active || mvLoaded) return;
    void import("@google/model-viewer").then(() => { mvLoaded = true; setReady(true); }).catch(() => {});
  }, [active]);
  return ready;
}

export function OverlayLayer() {
  const overlay = useLiveStore((s) => s.overlay);
  const set = useLiveStore((s) => s.set);
  const reduce = useReducedMotion();
  const mvReady = useModelViewer(overlay?.kind === "model");
  // Notes pin onto the camera tile (InCall renders NotePin there); everything
  // else is the floating card.
  const card = overlay && overlay.kind !== "note" ? overlay : null;

  return (
    <AnimatePresence>
      {card && (
        <motion.div
          key={card.overlayId}
          initial={{ opacity: 0, scale: reduce ? 1 : 0.94, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 30 }}
          className="pointer-events-auto absolute left-1/2 top-[8%] z-30 w-[min(560px,86vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_18px_60px_-18px_rgba(0,0,0,0.55)]"
        >
          <button
            onClick={() => set({ overlay: null })}
            aria-label="Dismiss overlay"
            className="absolute right-2 top-2 z-10 rounded-full bg-black/40 p-1.5 text-white/90 backdrop-blur transition-colors hover:bg-black/60"
          >
            <X size={14} />
          </button>
          {card.kind === "model" && card.url && (
            mvReady ? (
              <model-viewer
                src={card.url}
                camera-controls
                auto-rotate
                ar
                ar-modes="webxr scene-viewer quick-look"
                shadow-intensity="0.6"
                style={{ width: "100%", height: "min(46vh, 380px)", background: "transparent" }}
              />
            ) : (
              <div className="flex h-[min(46vh,380px)] items-center justify-center text-sm text-muted">Loading 3D…</div>
            )
          )}
          {card.kind === "figure" && card.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.url} alt={card.caption ?? "figure"} className="max-h-[52vh] w-full bg-black/5 object-contain" />
          )}
          {card.kind === "video" && card.url && (
            <video src={card.url} autoPlay controls playsInline className="max-h-[52vh] w-full bg-black" />
          )}
          {card.caption && (
            <div className="border-t border-border px-4 py-2.5 text-[13px] leading-snug text-muted">{card.caption}</div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// A pointer label pinned on the camera tile at normalized 0–1 coords — the
// "that lever, right there" gesture. Rendered INSIDE the camera tile's
// relatively-positioned container so anchors track the video box.
export function NotePin({ overlay }: { overlay: LiveOverlay | null }) {
  const set = useLiveStore((s) => s.set);
  if (!overlay || overlay.kind !== "note") return null;
  const a = overlay.anchor ?? { x: 0.5, y: 0.5 };
  return (
    <div
      className="pointer-events-none absolute z-20"
      style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, transform: "translate(-50%, -100%)" }}
    >
      <div className="pointer-events-auto flex max-w-[220px] items-start gap-1.5 rounded-lg bg-black/75 px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-lg backdrop-blur">
        <span>{overlay.caption}</span>
        <button onClick={() => set({ overlay: null })} aria-label="Dismiss note" className="mt-0.5 shrink-0 opacity-70 hover:opacity-100"><X size={11} /></button>
      </div>
      {/* the pointer dot at the exact anchor */}
      <div className="mx-auto mt-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent shadow" />
    </div>
  );
}
