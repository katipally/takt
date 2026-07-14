"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Waypoints } from "lucide-react";

// The product's knowledge graph, visible: a small force-directed layout of the
// most-connected entities (parts, specs, symptoms, procedures…) and the typed
// edges between them. Canvas + a ~60-node sample — no graph library.
// ponytail: translation-only force sim, no zoom/drag; add pan/zoom if people
// actually explore it rather than glance at it.

interface GNode { id: string; type: string; name: string; degree: number; x: number; y: number; vx: number; vy: number }
interface GLink { src: string; dst: string; rel: string }

// Category colors from the validated canvas palette (canvas-css.ts).
const TYPE_COLOR: Record<string, string> = {
  part: "#2a78d6", spec: "#eda100", symptom: "#e34948", procedure: "#1baf7a",
  warning: "#eb6834", model_part: "#4a3aa7", video_clip: "#e87ba4", figure: "#8a8f98",
};
const color = (t: string) => TYPE_COLOR[t] ?? "#8a8f98";

export function KnowledgeGraph({ slug }: { slug: string }) {
  const { data } = useQuery({
    queryKey: ["graph", slug],
    queryFn: () => fetch(`/api/graph?product=${slug}`).then((r) => r.json() as Promise<{ nodes: Omit<GNode, "x" | "y" | "vx" | "vy">[]; links: GLink[] }>),
    staleTime: 60_000,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ name: string; type: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !data?.nodes.length) return;
    const W = el.clientWidth, H = el.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = W * dpr; el.height = H * dpr;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Seed nodes on a ring (deterministic per index) and run a small spring sim.
    const nodes: GNode[] = data.nodes.map((n, i) => {
      const a = (i / data.nodes.length) * Math.PI * 2;
      const r = Math.min(W, H) * 0.32 * (0.6 + ((i * 37) % 40) / 100);
      return { ...n, x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, vx: 0, vy: 0 };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = data.links.filter((l) => byId.has(l.src) && byId.has(l.dst));
    const muted = getComputedStyle(el).color; // theme-aware edge/label color

    const step = () => {
      for (const a of nodes) {
        for (const b of nodes) {
          if (a === b) continue;
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = Math.max(80, dx * dx + dy * dy);
          const f = 900 / d2;
          a.vx += (dx / Math.sqrt(d2)) * f;
          a.vy += (dy / Math.sqrt(d2)) * f;
        }
        // gentle pull to center
        a.vx += (W / 2 - a.x) * 0.004;
        a.vy += (H / 2 - a.y) * 0.004;
      }
      for (const l of links) {
        const s = byId.get(l.src)!, t = byId.get(l.dst)!;
        const dx = t.x - s.x, dy = t.y - s.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = (d - 70) * 0.01;
        s.vx += (dx / d) * f; s.vy += (dy / d) * f;
        t.vx -= (dx / d) * f; t.vy -= (dy / d) * f;
      }
      for (const n of nodes) {
        n.x = Math.max(14, Math.min(W - 14, n.x + (n.vx *= 0.82)));
        n.y = Math.max(14, Math.min(H - 14, n.y + (n.vy *= 0.82)));
      }
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = muted;
      ctx.lineWidth = 1;
      for (const l of links) {
        const s = byId.get(l.src)!, t = byId.get(l.dst)!;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const n of nodes) {
        const r = 3 + Math.min(7, Math.sqrt(n.degree));
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color(n.type); ctx.fill();
      }
    };

    // Settle over ~2s of rAF so the layout visibly organizes itself, then stop.
    let ticks = 0, raf = 0;
    const loop = () => { step(); step(); draw(); if (++ticks < 60) raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      let best: GNode | null = null, bd = 14;
      for (const n of nodes) { const d = Math.hypot(n.x - mx, n.y - my); if (d < bd) { bd = d; best = n; } }
      setHover(best ? { name: best.name, type: best.type, x: best.x, y: best.y } : null);
    };
    const onLeave = () => setHover(null);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseleave", onLeave); };
  }, [data]);

  if (!data?.nodes.length) return null;
  const types = [...new Set(data.nodes.map((n) => n.type))].filter((t) => TYPE_COLOR[t]);

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-faint">
        <Waypoints className="size-3.5" /> Knowledge graph
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        The most-connected pieces of what Takt extracted — parts, specs, symptoms, and the fixes that
        link them. Every answer walks this graph.
      </p>
      <div className="relative mt-3">
        <canvas ref={canvasRef} className="h-[320px] w-full rounded-lg border border-border bg-surface text-muted-foreground" />
        {hover && (
          <div className="pointer-events-none absolute z-10 max-w-[240px] -translate-x-1/2 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-foreground shadow-lg"
            style={{ left: hover.x, top: Math.max(0, hover.y - 34) }}>
            <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: color(hover.type) }} />
            {hover.name} <span className="text-faint">· {hover.type}</span>
          </div>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {types.map((t) => (
          <span key={t} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-2 rounded-full" style={{ background: color(t) }} /> {t.replace("_", " ")}
          </span>
        ))}
      </div>
    </div>
  );
}
