"use client";

import { useEffect, useRef, useState } from "react";
import { Video } from "lucide-react";

// A floating camera tile on the stage during a live video call. Draggable from
// anywhere on it, corner-resizable, and clamped to the stage bounds. Sits above
// the stage content but never blocks it (you move it where you want).
export function CameraPiP({ stream }: { stream: MediaStream | null }) {
  const vidRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: -1, y: -1 }); // -1 = default bottom-right
  const [size, setSize] = useState(200);

  useEffect(() => { if (vidRef.current) vidRef.current.srcObject = stream; }, [stream]);

  // Place bottom-right on first mount (once we know the parent size).
  useEffect(() => {
    if (pos.x >= 0 || !boxRef.current?.parentElement) return;
    const p = boxRef.current.parentElement.getBoundingClientRect();
    setPos({ x: p.width - size - 16, y: p.height - size * 0.75 - 96 });
  }, [pos.x, size]);

  const clamp = (x: number, y: number, w: number, h: number) => {
    const p = boxRef.current?.parentElement?.getBoundingClientRect();
    if (!p) return { x, y };
    return { x: Math.max(8, Math.min(x, p.width - w - 8)), y: Math.max(8, Math.min(y, p.height - h - 8)) };
  };

  const onDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.resize) return; // resize handle owns this
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY, ox = pos.x, oy = pos.y;
    const h = size * 0.75;
    const move = (ev: PointerEvent) => setPos(clamp(ox + (ev.clientX - startX), oy + (ev.clientY - startY), size, h));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const onResize = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, ow = size;
    const move = (ev: PointerEvent) => setSize(Math.max(120, Math.min(360, ow + (ev.clientX - startX))));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  return (
    <div ref={boxRef} onPointerDown={onDrag}
      style={{ left: pos.x < 0 ? undefined : pos.x, top: pos.y < 0 ? undefined : pos.y, width: size, height: size * 0.75, right: pos.x < 0 ? 16 : undefined, bottom: pos.y < 0 ? 96 : undefined }}
      className="group absolute z-30 cursor-grab touch-none overflow-hidden rounded-2xl border border-border/60 bg-black shadow-2xl shadow-black/40 active:cursor-grabbing">
      {stream
        ? <video ref={vidRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        : <div className="grid h-full place-items-center text-muted-foreground"><Video className="size-6" /></div>}
      {/* resize handle */}
      <span data-resize onPointerDown={onResize}
        className="absolute bottom-0 right-0 size-5 cursor-nwse-resize opacity-0 transition group-hover:opacity-100"
        style={{ background: "linear-gradient(135deg, transparent 50%, rgba(255,255,255,.5) 50%)" }} />
    </div>
  );
}
