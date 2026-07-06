"use client";

import { Component, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { UISurface, UINode } from "@takt/shared";
import { REGISTRY, CONTAINERS } from "./registry";
import type { RenderCtx, SurfaceData } from "./ctx";
import { ptrGet, ptrSet } from "./bind";

// Walks a flat adjacency-list surface into React. Order-independent (renders from
// `root`; missing child refs become skeletons), every node isolated by an error
// boundary (a bad node never blanks the stage), unknown types → neutral
// placeholder, and each node fades in on mount so streamed surfaces compose in.

export const UIRenderer = memo(function UIRenderer({ surface, ctx, animate = true }: { surface: UISurface; ctx: RenderCtx; animate?: boolean }) {
  const byId = useMemo(() => { const m = new Map<string, UINode>(); for (const n of surface.nodes) m.set(n.id, n); return m; }, [surface]);
  // Two-way-bound data model for interactive nodes (read-only surfaces get no store).
  const data = useSurfaceData(surface, ctx.readOnly);
  const boundCtx = useMemo<RenderCtx>(() => (data ? { ...ctx, data } : ctx), [ctx, data]);
  return <RenderNode id={surface.root} byId={byId} ctx={boundCtx} animate={animate} seen={new Set()} />;
});

// Surface data store: seeded from surface.data, re-seeded only when the surface's
// identity (key/id) changes — so a re-emit (streaming/versions) doesn't wipe what
// the user has typed. `set` immutably updates so the subtree re-renders.
function useSurfaceData(surface: UISurface, readOnly?: boolean): SurfaceData | undefined {
  const [data, setData] = useState<Record<string, unknown>>(() => structuredClone(surface.data ?? {}));
  const keyRef = useRef(surface.key ?? surface.id);
  useEffect(() => {
    const k = surface.key ?? surface.id;
    if (k !== keyRef.current) { keyRef.current = k; setData(structuredClone(surface.data ?? {})); }
  }, [surface]);
  const get = useCallback((ptr?: string) => ptrGet(data, ptr), [data]);
  const set = useCallback((ptr: string, v: unknown) => setData((d) => ptrSet(d, ptr, v)), []);
  return useMemo(() => (readOnly ? undefined : { get, set }), [get, set, readOnly]);
}

function RenderNode({ id, byId, ctx, animate, seen }: { id: string; byId: Map<string, UINode>; ctx: RenderCtx; animate: boolean; seen: Set<string> }): ReactNode {
  const node = byId.get(id);
  if (!node) return <Skeleton />;
  if (seen.has(id)) return null; // cycle guard
  const nextSeen = new Set(seen).add(id);

  const Comp = REGISTRY[node.type];
  if (!Comp) return <NodeAnim animate={animate}><Placeholder type={node.type} /></NodeAnim>;

  const children = CONTAINERS.has(node.type) && node.children?.length
    ? node.children.map((c) => <RenderNode key={c} id={c} byId={byId} ctx={ctx} animate={animate} seen={nextSeen} />)
    : undefined;

  return (
    <NodeAnim animate={animate}>
      <NodeBoundary type={node.type}>
        {Comp({ props: node.props ?? {}, children, ctx, bind: node.bind })}
      </NodeBoundary>
    </NodeAnim>
  );
}

// Cheap mount animation — CSS transition, no per-node motion component. Always
// resolves to opacity 1 (keyed on `on`, not `animate`), so a node never gets
// stuck invisible if `animate` flips off before the first frame paints.
function NodeAnim({ animate, children }: { animate: boolean; children: ReactNode }) {
  const [on, setOn] = useState(!animate);
  useEffect(() => { if (on) return; const r = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(r); }, [on]);
  return <div style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(6px)", transition: "opacity .28s var(--ease-out-quart), transform .28s var(--ease-out-quart)" }}>{children}</div>;
}

function Skeleton() { return <div className="h-16 animate-pulse rounded-lg border border-border bg-surface" />; }

function Placeholder({ type }: { type: string }) {
  return <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-[12px] text-muted-foreground">Unsupported block: {type}</div>;
}

class NodeBoundary extends Component<{ type: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-[12px] text-muted-foreground">Couldn’t render {this.props.type}.</div>;
    return this.props.children;
  }
}
