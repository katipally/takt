"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, useDragControls } from "motion/react";
import { X, GripHorizontal } from "lucide-react";
import { useLiveStore, type LiveOverlay, type OverlayMark } from "@/lib/live/liveStore";

// The remote-expert surface: ONE visual the agent pins over the live call while
// talking. Two placements:
//   • floating card above the stage — video always; model/figure without an anchor
//   • ON the camera feed (FeedOverlay, rendered inside CameraPiP) — "marks"
//     (arrows/rings/boxes/paths/labels drawn over the video), "note" pins, and
//     model/figure WITH an anchor (a small tile pinned at that point)
// Screen-space annotation, same on desktop and phone — marks anchor to positions
// in the frame, not the physical object (the agent re-aims as frames refresh).
// Ephemeral by design: a new overlay replaces the last, `clear` (or ✕) takes it
// down, nothing persists into chat history.

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

const AR_MODES = "webxr scene-viewer quick-look";

// ── floating card (above the stage) ─────────────────────────────────────────
export function OverlayLayer() {
  const overlay = useLiveStore((s) => s.overlay);
  const set = useLiveStore((s) => s.set);
  const reduce = useReducedMotion();
  const mvReady = useModelViewer(overlay?.kind === "model");
  // Drag: a handle starts it (dragListener off) so the 3D viewer keeps its own
  // pointer-orbit; constrained to the viewport so the card can't be lost. The
  // card floats over the whole app, independent of the camera PiP.
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useDragControls();
  // In-feed placements render inside CameraPiP (FeedOverlay), not here.
  const card = overlay && (overlay.kind === "video" || ((overlay.kind === "model" || overlay.kind === "figure") && !overlay.anchor))
    ? overlay : null;

  return (
    <AnimatePresence>
      {card && (
        <div ref={wrapRef} className="pointer-events-none fixed inset-0 z-[60] flex justify-center">
        <motion.div
          key={card.overlayId}
          drag
          dragControls={drag}
          dragListener={false}
          dragConstraints={wrapRef}
          dragMomentum={false}
          dragElastic={0.06}
          initial={{ opacity: 0, scale: reduce ? 1 : 0.94, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 30 }}
          className="pointer-events-auto absolute top-[8%] w-[min(560px,86vw)] overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_18px_60px_-18px_rgba(0,0,0,0.55)]"
        >
          {/* drag handle — grab here to move the card (the 3D viewer below keeps its orbit) */}
          <div
            onPointerDown={(e) => drag.start(e)}
            className="flex cursor-grab items-center justify-center gap-1.5 border-b border-border/60 bg-black/20 py-1.5 text-white/50 active:cursor-grabbing"
            title="Drag to move"
          >
            <GripHorizontal size={14} />
          </div>
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
                ar-modes={AR_MODES}
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
        </div>
      )}
    </AnimatePresence>
  );
}

// ── on-feed AR layer (rendered INSIDE the camera tile) ──────────────────────
// Coordinates are in CAMERA-FRAME space (what the agent saw and what the
// tracker measures); the tile crops the video with object-cover, so every
// point maps through the cover transform before hitting the screen. Marks are
// motion elements — the ~10 fps tracker updates tween smoothly instead of
// popping. Drawn in pixels (ResizeObserver) so rings stay round and stroke
// widths stay uniform whatever shape the tile is.
const GLIDE = { type: "tween" as const, duration: 0.14, ease: "linear" as const };

export function FeedOverlay({ overlay, videoDim }: { overlay: LiveOverlay | null; videoDim?: { vw: number; vh: number } | null }) {
  const set = useLiveStore((s) => s.set);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDim({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDim({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const mvReady = useModelViewer(!!overlay && overlay.kind === "model" && !!overlay.anchor);

  // Let the user drag a pinned model/figure off the thing it's covering. Once
  // dragged it stops tracking the object and stays put (manual position, in tile
  // pixels); a new overlay resets it. Moving the pin does NOT move the PiP tile.
  const [manual, setManual] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => { setManual(null); }, [overlay?.overlayId]);
  const startPinDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const move = (ev: PointerEvent) => setManual({ x: ev.clientX - box.left, y: ev.clientY - box.top });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onFeed = overlay && (
    overlay.kind === "marks" || overlay.kind === "note" ||
    ((overlay.kind === "model" || overlay.kind === "figure") && !!overlay.anchor)
  ) ? overlay : null;

  // object-cover mapping: frame (0–1) → tile pixels. Without video dimensions
  // (placeholder tile) the frame is assumed to fill the box.
  const { w, h } = dim;
  const vw = videoDim?.vw || w || 1, vh = videoDim?.vh || h || 1;
  const scale = Math.max(w / vw, h / vh) || 1;
  const dw = vw * scale, dh = vh * scale;
  const ox = (w - dw) / 2, oy = (h - dh) / 2;
  const px = (p: { x: number; y: number }) => ({ x: ox + p.x * dw, y: oy + p.y * dh });
  const minDim = Math.min(dw, dh) || 1;

  return (
    <div ref={boxRef} className="pointer-events-none absolute inset-0 z-20">
      <AnimatePresence>
        {onFeed && (
          /* keyed by KIND, not overlayId — tracker position updates (same kind)
             glide in place instead of remounting/crossfading */
          <motion.div key={onFeed.kind} className="absolute inset-0"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>

            {/* drawn marks */}
            {onFeed.kind === "marks" && w > 0 && (
              <svg width={w} height={h} className="absolute inset-0">
                <defs>
                  <marker id="takt-arrowhead" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                    <path d="M1,1 L8,4.5 L1,8 Z" fill="var(--accent, #7c6cf0)" stroke="white" strokeWidth="0.6" />
                  </marker>
                  {/* white halo under every stroke so marks read on any video */}
                  <filter id="takt-mark-halo" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="0" stdDeviation="1.6" floodColor="white" floodOpacity="0.9" />
                    <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="black" floodOpacity="0.45" />
                  </filter>
                </defs>
                <AnimatePresence>
                  {(onFeed.marks ?? []).map((m, i) => <Mark key={`${m.shape}${i}`} m={m} px={px} minDim={minDim} />)}
                </AnimatePresence>
              </svg>
            )}
            {/* label marks are DOM (text wraps + stays crisp) */}
            {onFeed.kind === "marks" && (onFeed.marks ?? []).flatMap((m, i) =>
              m.shape === "label" && m.at ? [<Bubble key={`l${i}`} at={px(m.at)} text={m.text ?? ""} />] : [])}

            {/* note pin */}
            {onFeed.kind === "note" && (
              <Bubble at={px(onFeed.anchor ?? { x: 0.5, y: 0.5 })} text={onFeed.caption ?? ""} onDismiss={() => set({ overlay: null })} dot />
            )}

            {/* model / figure pinned in-feed — tracks its object until the user
                drags the handle, then stays where they put it */}
            {(onFeed.kind === "model" || onFeed.kind === "figure") && onFeed.anchor && (
              <motion.div className="pointer-events-auto absolute" style={{ transform: "translate(-50%, -104%)" }}
                animate={{ left: (manual ?? px(onFeed.anchor)).x, top: (manual ?? px(onFeed.anchor)).y }}
                transition={manual ? { duration: 0 } : GLIDE}>
                <div className="overflow-hidden rounded-xl border border-white/25 bg-black/55 shadow-xl backdrop-blur-sm">
                  {/* drag handle — move the pin off what it's covering */}
                  <div onPointerDown={startPinDrag} title="Drag to move"
                    className="flex cursor-grab items-center justify-center bg-black/30 py-1 text-white/45 active:cursor-grabbing"><GripHorizontal size={12} /></div>
                  {onFeed.kind === "figure" && onFeed.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={onFeed.url} alt={onFeed.caption ?? "figure"} className="max-h-40 max-w-[220px] object-contain" />
                  )}
                  {onFeed.kind === "model" && onFeed.url && (mvReady ? (
                    <model-viewer src={onFeed.url} camera-controls auto-rotate ar ar-modes={AR_MODES}
                      style={{ width: 190, height: 160, background: "transparent" }} />
                  ) : (
                    <div className="grid h-[160px] w-[190px] place-items-center text-[11px] text-white/70">Loading 3D…</div>
                  ))}
                  {onFeed.caption && <div className="max-w-[220px] px-2 py-1 text-[11px] leading-snug text-white/90">{onFeed.caption}</div>}
                  <button onClick={() => set({ overlay: null })} aria-label="Dismiss"
                    className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white/80 hover:text-white"><X size={10} /></button>
                </div>
                {!manual && <div className="mx-auto mt-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent shadow" />}
              </motion.div>
            )}

            {/* caption strip for marks, bottom of the tile */}
            {onFeed.kind === "marks" && onFeed.caption && (
              <div className="absolute inset-x-2 bottom-2 mx-auto w-fit max-w-[92%] rounded-lg bg-black/70 px-2.5 py-1 text-[11.5px] leading-snug text-white backdrop-blur">{onFeed.caption}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const STROKE = { stroke: "var(--accent, #7c6cf0)", strokeWidth: 3, fill: "none", filter: "url(#takt-mark-halo)" } as const;
const MARK_FADE = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } };

// Every geometric attribute is animated so tracker updates (~10 fps) tween
// smoothly between measurements instead of jumping.
function Mark({ m, px, minDim }: { m: OverlayMark; px: (p: { x: number; y: number }) => { x: number; y: number }; minDim: number }) {
  if (m.shape === "arrow" && m.from && m.to) {
    const a = px(m.from), b = px(m.to);
    return <motion.line {...MARK_FADE} animate={{ opacity: 1, x1: a.x, y1: a.y, x2: b.x, y2: b.y }} transition={GLIDE}
      {...STROKE} strokeLinecap="round" markerEnd="url(#takt-arrowhead)" />;
  }
  if (m.shape === "ring" && m.at) {
    const c = px(m.at);
    return <motion.circle {...MARK_FADE} animate={{ opacity: 1, cx: c.x, cy: c.y }} transition={GLIDE}
      r={(m.r ?? 0.06) * minDim} {...STROKE} className="motion-safe:animate-pulse" />;
  }
  if (m.shape === "box" && m.at) {
    const c = px(m.at);
    const bw = (m.w ?? 0.14) * minDim, bh = (m.h ?? 0.12) * minDim;
    return <motion.rect {...MARK_FADE} animate={{ opacity: 1, x: c.x - bw / 2, y: c.y - bh / 2 }} transition={GLIDE}
      width={bw} height={bh} rx={6} {...STROKE} />;
  }
  if (m.shape === "path" && m.points?.length) {
    // point lists don't tween — tracked translations land directly (10 fps is fine for a trace)
    return <motion.polyline {...MARK_FADE} points={m.points.map((p) => { const q = px(p); return `${q.x},${q.y}`; }).join(" ")}
      {...STROKE} strokeLinecap="round" strokeLinejoin="round" />;
  }
  return null; // labels render as DOM bubbles
}

function Bubble({ at, text, onDismiss, dot }: { at: { x: number; y: number }; text: string; onDismiss?: () => void; dot?: boolean }) {
  if (!text) return null;
  return (
    <motion.div className="absolute" style={{ transform: "translate(-50%, -100%)" }}
      animate={{ left: at.x, top: at.y }} transition={GLIDE}>
      <div className="pointer-events-auto flex max-w-[220px] items-start gap-1.5 rounded-lg bg-black/75 px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-lg backdrop-blur">
        <span>{text}</span>
        {onDismiss && <button onClick={onDismiss} aria-label="Dismiss note" className="mt-0.5 shrink-0 opacity-70 hover:opacity-100"><X size={11} /></button>}
      </div>
      {dot && <div className="mx-auto mt-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent shadow" />}
    </motion.div>
  );
}
