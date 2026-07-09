"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, Maximize2 } from "lucide-react";
import { Figure } from "./parts";

// The product-map: a GENUINELY interactive node graph — drag nodes to rearrange,
// scroll to zoom, drag the background to pan, hover to reveal a label, click to
// focus a node (its links light up, its anchored media shows). ponytail:
// hand-rolled force layout + SVG pan/zoom/drag, no graph library in the bundle.

interface GNode { id: string; label: string; type?: string; detail?: string }
interface GEdge { source: string; target: string; type?: string }
export interface GraphProps { nodes: GNode[]; edges: GEdge[]; caption?: string }

function colorFor(type = ""): string {
  const t = type.toLowerCase();
  if (t.startsWith("part") || t.startsWith("subsystem")) return "var(--accent)";
  if (t.startsWith("fault") || t.startsWith("symptom")) return "var(--destructive)";
  if (t.startsWith("proc") || t.startsWith("task")) return "var(--success)";
  if (t.startsWith("spec") || t.startsWith("setting")) return "var(--arc)";
  return "var(--muted-foreground)";
}

const VW = 640, VH = 420;

function layout(nodes: GNode[], edges: GEdge[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  const n = nodes.length || 1;
  nodes.forEach((nd, i) => {
    const a = (i / n) * Math.PI * 2;
    pos.set(nd.id, { x: VW / 2 + Math.cos(a) * 150, y: VH / 2 + Math.sin(a) * 120, vx: 0, vy: 0 });
  });
  const idx = new Set(nodes.map((nd) => nd.id));
  const links = edges.filter((e) => idx.has(e.source) && idx.has(e.target));
  const STEPS = 260, REPULSE = 2600, SPRING = 0.04, REST = 70, DAMP = 0.85;
  for (let s = 0; s < STEPS; s++) {
    for (let i = 0; i < nodes.length; i++) {
      const a = pos.get(nodes[i]!.id)!;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = pos.get(nodes[j]!.id)!;
        let dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy || 0.01;
        const f = REPULSE / d2;
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    for (const e of links) {
      const a = pos.get(e.source)!, b = pos.get(e.target)!;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - REST) * SPRING;
      dx /= d; dy /= d;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const p of pos.values()) {
      p.vx += (VW / 2 - p.x) * 0.002; p.vy += (VH / 2 - p.y) * 0.002;
      p.x += p.vx * 0.5; p.y += p.vy * 0.5; p.vx *= DAMP; p.vy *= DAMP;
      p.x = Math.max(24, Math.min(VW - 24, p.x)); p.y = Math.max(24, Math.min(VH - 24, p.y));
    }
  }
  return new Map([...pos].map(([k, v]) => [k, { x: v.x, y: v.y }]));
}

export function Graph({ props }: { props: GraphProps }) {
  const nodes = useMemo(() => (props.nodes ?? []).slice(0, 120), [props.nodes]);
  const nodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo(() => (props.edges ?? []).filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target)), [props.edges, nodeIds]);
  const initial = useMemo(() => layout(nodes, edges), [nodes, edges]);

  const [pos, setPos] = useState(initial);
  useEffect(() => setPos(initial), [initial]);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ type: "node" | "pan"; id?: string; offX?: number; offY?: number; startX?: number; startY?: number; origX?: number; origY?: number; downX: number; downY: number } | null>(null);
  const moved = useRef(false);

  const deg = useMemo(() => { const d = new Map<string, number>(); for (const e of edges) { d.set(e.source, (d.get(e.source) ?? 0) + 1); d.set(e.target, (d.get(e.target) ?? 0) + 1); } return d; }, [edges]);
  const hubIds = useMemo(() => new Set([...deg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([id]) => id)), [deg]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const connected = new Set<string>();
  if (sel) { connected.add(sel); for (const e of edges) { if (e.source === sel) connected.add(e.target); if (e.target === sel) connected.add(e.source); } }
  const selNode = nodes.find((n) => n.id === sel);

  // ── coordinate helpers ─────────────────────────────────────────────────────
  const toVB = (cx: number, cy: number) => { const r = svgRef.current!.getBoundingClientRect(); return { x: ((cx - r.left) / r.width) * VW, y: ((cy - r.top) / r.height) * VH }; };
  const toGraph = (vb: { x: number; y: number }) => ({ x: (vb.x - view.x) / view.k, y: (vb.y - view.y) / view.k });

  // ── pointer drag (node move + background pan) ───────────────────────────────
  const onDownNode = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const g = toGraph(toVB(e.clientX, e.clientY));
    const p = pos.get(id)!;
    drag.current = { type: "node", id, offX: g.x - p.x, offY: g.y - p.y, downX: e.clientX, downY: e.clientY };
    moved.current = false;
  };
  const onDownBg = (e: React.PointerEvent) => {
    svgRef.current?.setPointerCapture?.(e.pointerId);
    drag.current = { type: "pan", origX: view.x, origY: view.y, startX: e.clientX, startY: e.clientY, downX: e.clientX, downY: e.clientY };
    moved.current = false;
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.downX) + Math.abs(e.clientY - d.downY) > 3) moved.current = true;
    if (d.type === "node") {
      const g = toGraph(toVB(e.clientX, e.clientY));
      setPos((m) => { const n = new Map(m); n.set(d.id!, { x: g.x - d.offX!, y: g.y - d.offY! }); return n; });
    } else {
      const r = svgRef.current!.getBoundingClientRect();
      const dx = ((e.clientX - d.startX!) / r.width) * VW, dy = ((e.clientY - d.startY!) / r.height) * VH;
      setView((v) => ({ ...v, x: d.origX! + dx, y: d.origY! + dy }));
    }
  };
  const onUp = () => { drag.current = null; };

  // ── wheel zoom toward cursor (non-passive listener) ─────────────────────────
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const vb = toVB(e.clientX, e.clientY);
      setView((v) => {
        const gx = (vb.x - v.x) / v.k, gy = (vb.y - v.y) / v.k;
        const k = Math.min(4, Math.max(0.4, v.k * (e.deltaY < 0 ? 1.12 : 0.89)));
        return { k, x: vb.x - gx * k, y: vb.y - gy * k };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  if (!nodes.length) return <Figure caption={props.caption}><div className="p-4 text-sm text-muted-foreground">No graph data.</div></Figure>;

  const labelFor = (id: string) => (sel ? connected.has(id) : hubIds.has(id)) || hover === id;

  return (
    <Figure caption={props.caption}>
      <div className="relative w-full overflow-hidden rounded-lg border border-border bg-card">
        <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} className="h-auto w-full select-none" role="img"
          style={{ touchAction: "none", cursor: drag.current?.type === "pan" ? "grabbing" : "grab" }}
          onPointerDown={onDownBg} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
          onClick={() => { if (!moved.current) setSel(null); }}>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {edges.map((e, i) => {
              const a = pos.get(e.source)!, b = pos.get(e.target)!;
              if (!a || !b) return null;
              const on = sel && (e.source === sel || e.target === sel);
              return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? "var(--accent)" : "var(--border)"} strokeWidth={(on ? 2 : 1) / view.k} opacity={sel && !on ? 0.12 : 0.7} />;
            })}
            {nodes.map((nd) => {
              const p = pos.get(nd.id); if (!p) return null;
              const r = 5 + Math.min(8, deg.get(nd.id) ?? 0);
              const dim = sel && !connected.has(nd.id) ? 0.16 : 1;
              return (
                <g key={nd.id} opacity={dim} style={{ cursor: "pointer" }}
                  onPointerDown={(e) => onDownNode(e, nd.id)}
                  onPointerEnter={() => setHover(nd.id)} onPointerLeave={() => setHover((h) => (h === nd.id ? null : h))}
                  onClick={(ev) => { ev.stopPropagation(); if (!moved.current) setSel((s) => (s === nd.id ? null : nd.id)); }}>
                  <circle cx={p.x} cy={p.y} r={r} fill={colorFor(nd.type)} stroke={hover === nd.id ? "var(--foreground)" : "var(--card)"} strokeWidth={(hover === nd.id ? 2 : 1.5) / view.k} />
                  {labelFor(nd.id) && (
                    <text x={p.x} y={p.y - r - 3} textAnchor={p.x > VW - 96 ? "end" : p.x < 96 ? "start" : "middle"} fontSize={10 / view.k} fill="var(--foreground)" stroke="var(--card)" strokeWidth={3 / view.k} paintOrder="stroke" className="pointer-events-none">{nd.label.length > 20 ? nd.label.slice(0, 20) + "…" : nd.label}</text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* zoom controls */}
        <div className="absolute right-2 top-2 flex flex-col gap-1">
          {[["+", <Plus key="p" className="size-3.5" />], ["-", <Minus key="m" className="size-3.5" />], ["r", <Maximize2 key="r" className="size-3" />]].map(([act, icon]) => (
            <button key={act as string} onClick={() => setView((v) => act === "r" ? { x: 0, y: 0, k: 1 } : { ...v, k: Math.min(4, Math.max(0.4, v.k * (act === "+" ? 1.2 : 0.83))) })}
              className="grid size-7 place-items-center rounded-md border border-border bg-background/80 text-muted-foreground backdrop-blur transition hover:text-foreground">{icon as React.ReactNode}</button>
          ))}
        </div>

        {selNode && (
          <div className="absolute left-2 top-2 max-w-[52%] rounded-md border border-border bg-background/95 p-3 text-xs shadow-sm">
            <div className="flex items-center gap-2 font-medium">
              <span className="size-2.5 rounded-full" style={{ background: colorFor(selNode.type) }} />
              {selNode.label}
              {selNode.type && <span className="text-muted-foreground">· {selNode.type}</span>}
            </div>
            {selNode.detail && <div className="mt-1.5 whitespace-pre-line text-muted-foreground">{selNode.detail}</div>}
            <div className="mt-2 space-y-0.5">
              {edges.filter((e) => e.source === selNode.id || e.target === selNode.id).slice(0, 8).map((e, i) => {
                const other = e.source === selNode.id ? e.target : e.source;
                return <div key={i} className="text-muted-foreground"><span className="text-foreground">{e.type ?? "link"}</span> → {byId.get(other)?.label ?? other}</div>;
              })}
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2.5 py-1 text-[10px] text-white/75">drag nodes · scroll to zoom · drag bg to pan</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {[["Part", "part"], ["Fault", "fault"], ["Procedure", "procedure"], ["Spec", "spec"]].map(([lbl, t]) => (
          <span key={t} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: colorFor(t) }} />{lbl}</span>
        ))}
      </div>
    </Figure>
  );
}
