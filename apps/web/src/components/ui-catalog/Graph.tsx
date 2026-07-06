"use client";

import { useMemo, useState } from "react";
import { Figure } from "./parts";

// The product-map: an interactive node-graph of the PKB (parts, faults,
// procedures, specs and how they connect). Click a node to focus it — its links
// light up and its anchored media (manual pages, 3D parts, videos) show in the
// panel. ponytail: hand-rolled force layout + inline SVG, no d3 dependency in the
// app bundle — the graph is small (dozens of nodes) so a fixed-iteration sim on
// mount is instant and fully theme-controlled.

interface GNode { id: string; label: string; type?: string; detail?: string }
interface GEdge { source: string; target: string; type?: string }
export interface GraphProps { nodes: GNode[]; edges: GEdge[]; caption?: string }

// entity type → theme token (falls back to muted for unknown types)
function colorFor(type = ""): string {
  const t = type.toLowerCase();
  if (t.startsWith("part") || t.startsWith("subsystem")) return "var(--accent)";
  if (t.startsWith("fault") || t.startsWith("symptom")) return "var(--destructive)";
  if (t.startsWith("proc") || t.startsWith("task")) return "var(--success)";
  if (t.startsWith("spec") || t.startsWith("setting")) return "var(--arc)";
  return "var(--muted-foreground)";
}

const VW = 640, VH = 420;

// Deterministic mini force-directed layout: seed on a circle, then relax with
// pairwise repulsion + edge springs + centering for a fixed number of steps.
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
        let d2 = dx * dx + dy * dy || 0.01;
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
  const nodes = (props.nodes ?? []).slice(0, 120);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = (props.edges ?? []).filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  const pos = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const [sel, setSel] = useState<string | null>(null);

  const deg = new Map<string, number>();
  for (const e of edges) { deg.set(e.source, (deg.get(e.source) ?? 0) + 1); deg.set(e.target, (deg.get(e.target) ?? 0) + 1); }
  const connected = new Set<string>();
  if (sel) { connected.add(sel); for (const e of edges) { if (e.source === sel) connected.add(e.target); if (e.target === sel) connected.add(e.source); } }
  const dim = (id: string) => (sel && !connected.has(id) ? 0.18 : 1);
  const selNode = nodes.find((n) => n.id === sel);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  if (!nodes.length) return <Figure caption={props.caption}><div className="p-4 text-sm text-muted-foreground">No graph data.</div></Figure>;

  return (
    <Figure caption={props.caption}>
      <div className="relative w-full overflow-hidden rounded-lg border border-border bg-card">
        <svg viewBox={`0 0 ${VW} ${VH}`} className="h-auto w-full" role="img" onClick={() => setSel(null)}>
          {edges.map((e, i) => {
            const a = pos.get(e.source)!, b = pos.get(e.target)!;
            const on = sel && (e.source === sel || e.target === sel);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? "var(--accent)" : "var(--border)"} strokeWidth={on ? 2 : 1} opacity={sel && !on ? 0.15 : 0.7} />;
          })}
          {nodes.map((nd) => {
            const p = pos.get(nd.id)!;
            const r = 5 + Math.min(8, (deg.get(nd.id) ?? 0));
            return (
              <g key={nd.id} opacity={dim(nd.id)} className="cursor-pointer" onClick={(ev) => { ev.stopPropagation(); setSel(nd.id === sel ? null : nd.id); }}>
                <circle cx={p.x} cy={p.y} r={r} fill={colorFor(nd.type)} stroke="var(--card)" strokeWidth={1.5} />
                {(sel ? connected.has(nd.id) : (deg.get(nd.id) ?? 0) >= 2) && (
                  <text x={p.x} y={p.y - r - 3} textAnchor="middle" fontSize={10} fill="var(--foreground)">{nd.label.length > 18 ? nd.label.slice(0, 18) + "…" : nd.label}</text>
                )}
              </g>
            );
          })}
        </svg>

        {selNode && (
          <div className="absolute right-2 top-2 max-w-[45%] rounded-md border border-border bg-background/95 p-3 text-xs shadow-sm">
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
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {[["Part", "part"], ["Fault", "fault"], ["Procedure", "procedure"], ["Spec", "spec"]].map(([lbl, t]) => (
          <span key={t} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: colorFor(t) }} />{lbl}</span>
        ))}
      </div>
    </Figure>
  );
}
