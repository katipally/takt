"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Waypoints, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

// The product's REAL knowledge graph, explorable: every stored entity and edge,
// force-laid-out on a canvas with pan/zoom, node drag, search, type filters,
// and a detail panel — click a node to read what Takt stored (value, page,
// summary) and hop through its connections to traverse the whole graph.
// No graph library: one canvas, one rAF sim.

interface GNode {
  id: string; type: string; name: string; degree: number;
  summary: string; value: string | null; unit: string | null; page: number | null;
  x: number; y: number; vx: number; vy: number;
}
interface GLink { src: string; dst: string; rel: string }
type GraphData = { nodes: Omit<GNode, "x" | "y" | "vx" | "vy">[]; links: GLink[] };

// Category colors from the validated canvas palette (canvas-css.ts).
const TYPE_COLOR: Record<string, string> = {
  part: "#2a78d6", spec: "#eda100", symptom: "#e34948", procedure: "#1baf7a",
  warning: "#eb6834", model_part: "#4a3aa7", video_clip: "#e87ba4", figure: "#8a8f98",
  setting: "#008300", compatibility: "#0e7f8a", term: "#7a7f88", step: "#199e70",
  assembly: "#3987e5", region: "#9a8f4f", image: "#c98500",
};
const color = (t: string) => TYPE_COLOR[t] ?? "#8a8f98";
const radius = (n: { degree: number }) => 3 + Math.min(8, Math.sqrt(n.degree + 1) * 1.6);

export function KnowledgeGraph({ slug }: { slug: string }) {
  const { data } = useQuery({
    queryKey: ["graph", slug],
    queryFn: () => fetch(`/api/graph?product=${slug}`).then((r) => r.json() as Promise<GraphData>),
    staleTime: 60_000,
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [offTypes, setOffTypes] = useState<Set<string>>(new Set());

  // ── mutable sim state (refs so the rAF loop never re-subscribes) ──────────
  const nodesRef = useRef<GNode[]>([]);
  const byIdRef = useRef<Map<string, GNode>>(new Map());
  const linksRef = useRef<GLink[]>([]);
  const neighborsRef = useRef<Map<string, Set<string>>>(new Map());
  const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });   // world → screen: p*scale + t
  const alphaRef = useRef(1);                            // sim heat; decays to rest
  const uiRef = useRef({ selectedId: null as string | null, hoverId: null as string | null, query: "", offTypes: new Set<string>() });
  uiRef.current = { selectedId, hoverId, query: query.trim().toLowerCase(), offTypes };

  // Build sim state when the data lands: seed each type on its own ring sector
  // so the layout starts readable instead of as one hairball.
  useEffect(() => {
    if (!data?.nodes.length) return;
    const types = [...new Set(data.nodes.map((n) => n.type))];
    const nodes: GNode[] = data.nodes.map((n, i) => {
      const t = types.indexOf(n.type) / types.length;
      const a = t * Math.PI * 2 + ((i * 137) % 100) / 100 * 1.1;
      const r = 220 + ((i * 61) % 260);
      return { ...n, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0 };
    });
    nodesRef.current = nodes;
    byIdRef.current = new Map(nodes.map((n) => [n.id, n]));
    linksRef.current = data.links.filter((l) => byIdRef.current.has(l.src) && byIdRef.current.has(l.dst));
    const nb = new Map<string, Set<string>>();
    for (const l of linksRef.current) {
      (nb.get(l.src) ?? nb.set(l.src, new Set()).get(l.src)!).add(l.dst);
      (nb.get(l.dst) ?? nb.set(l.dst, new Set()).get(l.dst)!).add(l.src);
    }
    neighborsRef.current = nb;
    alphaRef.current = 1;
  }, [data]);

  // ── the sim + renderer ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !data?.nodes.length) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const resize = () => {
      W = el.clientWidth; H = el.clientHeight;
      el.width = W * dpr; el.height = H * dpr;
    };
    resize();
    const ro = new ResizeObserver(() => { resize(); alphaRef.current = Math.max(alphaRef.current, 0.05); });
    ro.observe(el);
    if (!viewRef.current.tx && !viewRef.current.ty) { viewRef.current.tx = W / 2; viewRef.current.ty = H / 2; }

    const visible = (n: GNode) => !uiRef.current.offTypes.has(n.type);

    const step = () => {
      const nodes = nodesRef.current.filter(visible);
      const k = alphaRef.current;
      // repulsion on a coarse grid (n is a few hundred — grid keeps it smooth)
      const CELL = 90;
      const grid = new Map<string, GNode[]>();
      for (const n of nodes) {
        const key = `${Math.round(n.x / CELL)}:${Math.round(n.y / CELL)}`;
        (grid.get(key) ?? grid.set(key, []).get(key)!).push(n);
      }
      for (const n of nodes) {
        const cx = Math.round(n.x / CELL), cy = Math.round(n.y / CELL);
        for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (const m of grid.get(`${gx}:${gy}`) ?? []) {
            if (m === n) continue;
            const dx = n.x - m.x, dy = n.y - m.y;
            const d2 = Math.max(60, dx * dx + dy * dy);
            if (d2 > CELL * CELL * 4) continue;
            const f = (1400 / d2) * k;
            const d = Math.sqrt(d2);
            n.vx += (dx / d) * f; n.vy += (dy / d) * f;
          }
        }
        n.vx += -n.x * 0.0015 * k; // gentle centering
        n.vy += -n.y * 0.0015 * k;
      }
      for (const l of linksRef.current) {
        const s = byIdRef.current.get(l.src)!, t = byIdRef.current.get(l.dst)!;
        if (!visible(s) || !visible(t)) continue;
        const dx = t.x - s.x, dy = t.y - s.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const f = (d - 80) * 0.012 * k;
        s.vx += (dx / d) * f; s.vy += (dy / d) * f;
        t.vx -= (dx / d) * f; t.vy -= (dy / d) * f;
      }
      for (const n of nodes) {
        if (drag.current?.node === n) { n.vx = 0; n.vy = 0; continue; }
        n.x += (n.vx *= 0.8); n.y += (n.vy *= 0.8);
      }
      alphaRef.current = Math.max(0, k - 0.004);
    };

    const draw = () => {
      const { scale, tx, ty } = viewRef.current;
      const { selectedId: sel, hoverId: hov, query: q, offTypes: off } = uiRef.current;
      const selN = sel ? byIdRef.current.get(sel) : null;
      const selNb = sel ? neighborsRef.current.get(sel) : null;
      const matches = (n: GNode) => !q || n.name.toLowerCase().includes(q);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
      const base = getComputedStyle(el).color;

      // edges — connected-to-selection pop, the rest recede
      for (const l of linksRef.current) {
        const s = byIdRef.current.get(l.src)!, t = byIdRef.current.get(l.dst)!;
        if (off.has(s.type) || off.has(t.type)) continue;
        const hot = sel && (l.src === sel || l.dst === sel);
        ctx.globalAlpha = hot ? 0.9 : sel || q ? 0.06 : 0.18;
        ctx.strokeStyle = hot ? color(selN!.type) : base;
        ctx.lineWidth = (hot ? 1.6 : 1) / scale;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); ctx.stroke();
        if (hot && scale > 0.55) {
          // relationship label on the selected node's edges
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = base;
          ctx.font = `${10 / scale}px ui-sans-serif, system-ui`;
          ctx.fillText(l.rel, (s.x + t.x) / 2 + 4 / scale, (s.y + t.y) / 2 - 4 / scale);
        }
      }
      // nodes
      for (const n of nodesRef.current) {
        if (off.has(n.type)) continue;
        const isSel = n.id === sel, isNb = !!selNb?.has(n.id), isHov = n.id === hov;
        const dim = (sel && !isSel && !isNb) || (q && !matches(n));
        ctx.globalAlpha = dim ? 0.15 : 1;
        const r = radius(n) / Math.sqrt(scale);
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color(n.type); ctx.fill();
        if (isSel || isHov) {
          ctx.globalAlpha = 1; ctx.lineWidth = 2 / scale; ctx.strokeStyle = base; ctx.stroke();
        }
        // labels: hubs at rest zoom, everything when zoomed in, always for
        // selection + its neighborhood + search matches
        const label = isSel || isNb || isHov || (q && matches(n)) || scale > 1.7 || (scale > 0.8 && n.degree >= 5);
        if (label && !dim) {
          ctx.globalAlpha = isSel || isHov ? 1 : 0.75;
          ctx.fillStyle = base;
          ctx.font = `${11 / scale}px ui-sans-serif, system-ui`;
          ctx.fillText(n.name.length > 34 ? n.name.slice(0, 33) + "…" : n.name, n.x + r + 3 / scale, n.y + 3.5 / scale);
        }
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    const loop = () => {
      if (alphaRef.current > 0) { step(); step(); }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // ── interaction: hover, click-select, drag node, pan, wheel zoom ────────
    const toWorld = (mx: number, my: number) => {
      const { scale, tx, ty } = viewRef.current;
      return { x: (mx - tx) / scale, y: (my - ty) / scale };
    };
    const pick = (mx: number, my: number): GNode | null => {
      const { x, y } = toWorld(mx, my);
      const { scale } = viewRef.current;
      let best: GNode | null = null, bd = 12 / scale;
      for (const n of nodesRef.current) {
        if (uiRef.current.offTypes.has(n.type)) continue;
        const d = Math.hypot(n.x - x, n.y - y);
        if (d < bd + radius(n) / Math.sqrt(scale)) { bd = d; best = n; }
      }
      return best;
    };
    const drag = { current: null as null | { node: GNode | null; sx: number; sy: number; moved: boolean } };
    const pos = (e: PointerEvent) => { const r = el.getBoundingClientRect(); return { mx: e.clientX - r.left, my: e.clientY - r.top }; };

    const onDown = (e: PointerEvent) => {
      const { mx, my } = pos(e);
      el.setPointerCapture(e.pointerId);
      drag.current = { node: pick(mx, my), sx: mx, sy: my, moved: false };
    };
    const onMove = (e: PointerEvent) => {
      const { mx, my } = pos(e);
      if (drag.current) {
        const d = drag.current;
        const dx = mx - d.sx, dy = my - d.sy;
        if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
        if (d.node) {
          const w = toWorld(mx, my);
          d.node.x = w.x; d.node.y = w.y;
          alphaRef.current = Math.max(alphaRef.current, 0.25); // re-heat around the drag
        } else {
          viewRef.current.tx += dx; viewRef.current.ty += dy;
        }
        d.sx = mx; d.sy = my;
      } else {
        const h = pick(mx, my);
        setHoverId(h?.id ?? null);
        el.style.cursor = h ? "pointer" : "grab";
      }
    };
    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (d && !d.moved) setSelectedId(d.node ? (uiRef.current.selectedId === d.node.id ? null : d.node.id) : null);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { mx, my } = (() => { const r = el.getBoundingClientRect(); return { mx: e.clientX - r.left, my: e.clientY - r.top }; })();
      const v = viewRef.current;
      const f = Math.exp(-e.deltaY * 0.0016);
      const ns = Math.max(0.25, Math.min(5, v.scale * f));
      // zoom around the cursor
      v.tx = mx - ((mx - v.tx) / v.scale) * ns;
      v.ty = my - ((my - v.ty) / v.scale) * ns;
      v.scale = ns;
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Center the view on a node (used when hopping through connections).
  const focusNode = (id: string) => {
    const n = byIdRef.current.get(id);
    const el = canvasRef.current;
    if (!n || !el) return;
    const v = viewRef.current;
    const s = Math.max(v.scale, 1.1);
    v.scale = s;
    v.tx = el.clientWidth / 2 - n.x * s;
    v.ty = el.clientHeight / 2 - n.y * s;
    setSelectedId(id);
  };

  const selected = selectedId ? byIdRef.current.get(selectedId) : null;
  const connections = useMemo(() => {
    if (!selectedId) return [];
    return linksRef.current
      .filter((l) => l.src === selectedId || l.dst === selectedId)
      .map((l) => {
        const otherId = l.src === selectedId ? l.dst : l.src;
        const other = byIdRef.current.get(otherId);
        return other ? { rel: l.rel, dir: l.src === selectedId ? "→" : "←", other } : null;
      })
      .filter(Boolean) as { rel: string; dir: string; other: GNode }[];
  }, [selectedId, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data) return [];
    return data.nodes.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, data]);

  if (!data?.nodes.length) return null;
  const types = [...new Set(data.nodes.map((n) => n.type))];

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-faint">
          <Waypoints className="size-3.5" /> Knowledge graph
          <span className="normal-case tracking-normal text-faint">· {data.nodes.length} entities · {data.links.length} links</span>
        </div>
        <div className="relative">
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1">
            <Search className="size-3.5 text-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} name="graph-search" aria-label="Search the knowledge graph"
              placeholder="Find a part, spec, symptom…" className="w-44 bg-transparent text-[12px] text-foreground outline-none placeholder:text-faint" />
            {query && <button onClick={() => setQuery("")} aria-label="Clear search"><X className="size-3 text-faint" /></button>}
          </div>
          {searchHits.length > 0 && (
            <div className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              {searchHits.map((h) => (
                <button key={h.id} onClick={() => { setQuery(""); focusNode(h.id); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-foreground transition hover:bg-foreground/[0.06]">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: color(h.type) }} />
                  <span className="truncate">{h.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-faint">{h.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Everything Takt extracted, live from the store — drag to pan, scroll to zoom, click a node to
        read what's on it and hop through its connections. This is the graph every answer walks.
      </p>

      {/* Panel sits beside the canvas on wide screens, stacks under it on
          mobile — a fixed side panel would crush the canvas at phone widths. */}
      <div className="mt-3 flex flex-col gap-3 md:flex-row">
        <div className="relative min-w-0 flex-1">
          <canvas ref={canvasRef} className="h-[340px] w-full cursor-grab rounded-lg border border-border bg-surface text-muted-foreground md:h-[440px]" />
        </div>

        {/* Detail panel — the SELECTED entity, verbatim from the store, with its
            connections as click-through hops. */}
        {selected && (
          <aside className="takt-scroll max-h-72 w-full shrink-0 overflow-y-auto rounded-lg border border-border bg-surface p-3 md:max-h-[440px] md:w-72">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide" style={{ color: color(selected.type) }}>
                <span className="size-2 rounded-full" style={{ background: color(selected.type) }} /> {selected.type.replace("_", " ")}
              </div>
              <button onClick={() => setSelectedId(null)} aria-label="Close details" className="text-faint hover:text-foreground"><X className="size-3.5" /></button>
            </div>
            <div className="mt-1 text-[14px] font-semibold leading-snug text-foreground">{selected.name}</div>
            {selected.value != null && (
              <div className="mt-1.5 font-mono text-[15px] text-foreground">{selected.value}{selected.unit ? ` ${selected.unit}` : ""}</div>
            )}
            {selected.page != null && <div className="mt-1 text-[11px] text-faint">manual p.{selected.page}</div>}
            {selected.summary && <p className="mt-2 text-[12px] leading-[17px] text-muted-foreground">{selected.summary}</p>}
            {connections.length > 0 && (
              <>
                <div className="mt-3 text-[10px] uppercase tracking-wide text-faint">Connections · {connections.length}</div>
                <div className="mt-1 flex flex-col">
                  {connections.map((c, i) => (
                    <button key={i} onClick={() => focusNode(c.other.id)}
                      className="group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition hover:bg-foreground/[0.06]">
                      <span className="shrink-0 font-mono text-[10px] text-faint">{c.dir} {c.rel}</span>
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color(c.other.type) }} />
                      <span className="min-w-0 truncate text-[12px] text-foreground">{c.other.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {/* Type filter chips — toggle a kind on/off to declutter the view. */}
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
        {types.map((t) => {
          const off = offTypes.has(t);
          return (
            <button key={t} aria-pressed={!off}
              onClick={() => setOffTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
              className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition",
                off ? "border-border text-faint opacity-50" : "border-transparent text-muted-foreground hover:text-foreground")}>
              <span className="size-2 rounded-full" style={{ background: color(t) }} />
              {t.replace("_", " ")} <span className="text-faint">{data.nodes.filter((n) => n.type === t).length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
