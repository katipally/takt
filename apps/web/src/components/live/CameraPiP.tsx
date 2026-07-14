"use client";

import { useEffect, useRef, useState } from "react";
import { Video, Move } from "lucide-react";
import { useLiveStore } from "@/lib/live/liveStore";
import { MarkTracker, trackables, applyTrack } from "@/lib/live/markTracker";
import { FeedOverlay } from "./OverlayLayer";

// A floating camera tile during a live video call. VIEWPORT-fixed and above
// every other surface (canvas, modals, rail) — the user's live view + the
// agent's AR marks must never be buried under app chrome. Draggable from
// anywhere on it, corner-resizable, clamped to the window.
export function CameraPiP({ stream }: { stream: MediaStream | null }) {
  const overlay = useLiveStore((s) => s.overlay);
  const vidRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -1, y: -1 }); // -1 = not yet placed
  const [size, setSize] = useState(420);            // spotlight: large by default
  const [videoDim, setVideoDim] = useState<{ vw: number; vh: number } | null>(null);

  useEffect(() => {
    if (vidRef.current) vidRef.current.srcObject = stream;
    if (!stream) setVideoDim(null);
  }, [stream]);

  // The camera is HANDHELD — marks the agent pins on an object must follow it.
  // A tiny template tracker (markTracker.ts) watches the anchor patch of every
  // on-feed element ~10×/s: movement translates the graphics with the object,
  // and if the object leaves the view its graphic is removed (all gone → the
  // overlay clears itself). Re-acquires templates whenever a NEW overlay lands
  // (same id = our own position updates → no re-acquire, no feedback loop).
  const trackerRef = useRef<MarkTracker | null>(null);
  const trackedId = useRef<string | null>(null);
  useEffect(() => {
    const video = vidRef.current;
    if (!video) return;
    if (!trackerRef.current) {
      trackerRef.current = new MarkTracker(video, (moved, lost) => {
        const cur = useLiveStore.getState().overlay;
        if (!cur || cur.overlayId !== trackedId.current) return;
        useLiveStore.getState().set({ overlay: applyTrack(cur, moved, lost) });
      });
    }
    const tracker = trackerRef.current;
    const pts = trackables(overlay);
    if (!overlay || !pts.length || !stream) { trackedId.current = null; tracker.stop(); return; }
    if (overlay.overlayId === trackedId.current) return; // our own tracked update
    trackedId.current = overlay.overlayId;
    tracker.setTargets(pts);
    tracker.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay?.overlayId, stream, videoDim]);
  useEffect(() => () => trackerRef.current?.stop(), []);

  // Spotlight on first mount (camera just turned on): center it in the window.
  // Still fully draggable/resizable afterward — this only sets where it lands,
  // bringing the feed into focus instead of tucking it in a corner.
  useEffect(() => {
    if (pos.x >= 0 || typeof window === "undefined") return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const sz = Math.min(size, Math.round(vw * 0.5)); // shrink to fit a narrow window
    if (sz !== size) setSize(sz);
    setPos({ x: Math.max(8, (vw - sz) / 2), y: Math.max(8, (vh - sz * 0.75) / 2 - 40) });
  }, [pos.x, size]);

  const clamp = (x: number, y: number, w: number, h: number) => {
    if (typeof window === "undefined") return { x, y };
    return { x: Math.max(8, Math.min(x, window.innerWidth - w - 8)), y: Math.max(8, Math.min(y, window.innerHeight - h - 8)) };
  };

  // Moving the tile happens ONLY from the dedicated move handle (top-left),
  // exactly like resize is only from its corner — so interacting with the feed,
  // the 3D part, or a pinned overlay can never move the camera by accident.
  const onDrag = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY, ox = pos.x, oy = pos.y;
    const h = size * 0.75;
    const move = (ev: PointerEvent) => setPos(clamp(ox + (ev.clientX - startX), oy + (ev.clientY - startY), size, h));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const onResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, ow = size;
    const move = (ev: PointerEvent) => setSize(Math.max(120, Math.min(640, ow + (ev.clientX - startX))));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  return (
    <div ref={boxRef}
      style={{ left: pos.x < 0 ? undefined : pos.x, top: pos.y < 0 ? undefined : pos.y, width: size, height: size * 0.75, right: pos.x < 0 ? 16 : undefined, bottom: pos.y < 0 ? 96 : undefined, opacity: pos.x < 0 ? 0 : 1 }}
      className="group fixed z-[60] touch-none overflow-hidden rounded-2xl border border-border/60 bg-black shadow-2xl shadow-black/40">
      {stream
        ? <video ref={vidRef} autoPlay muted playsInline className="h-full w-full object-cover"
            onLoadedMetadata={(e) => setVideoDim({ vw: e.currentTarget.videoWidth, vh: e.currentTarget.videoHeight })} />
        : <div className="grid h-full place-items-center text-muted-foreground"><Video className="size-6" /></div>}
      {/* the agent's AR layer on the live view — marks (arrows/rings/paths),
          note pins, and in-feed 3D/figure tiles, tracked to the object */}
      <FeedOverlay overlay={overlay} videoDim={videoDim} />
      {/* MOVE handle — top-left, the ONLY way to move the tile (mirrors resize).
          Keeps interacting with the feed/overlays from moving it by accident. */}
      <span onPointerDown={onDrag} title="Drag to move" aria-label="Move camera"
        className="absolute left-1.5 top-1.5 z-30 grid size-7 cursor-grab place-items-center rounded-lg bg-black/55 text-white/75 opacity-0 backdrop-blur transition hover:bg-black/70 group-hover:opacity-100 active:cursor-grabbing">
        <Move className="size-3.5" />
      </span>
      {/* resize handle */}
      <span data-resize onPointerDown={onResize}
        className="absolute bottom-0 right-0 z-30 size-5 cursor-nwse-resize opacity-0 transition group-hover:opacity-100"
        style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,.5) 50%)" }} />
    </div>
  );
}
