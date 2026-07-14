// Lightweight on-device object tracking for live-mode marks. The camera is
// handheld — an arrow pinned on a screw must FOLLOW the screw as the view
// drifts, and disappear when it leaves the frame. No ML, no deps: template
// matching (mean-abs-diff) on a ~160px grayscale downscale, searching a small
// window around each mark's last position at ~10 fps. A few ms per tick.
// Handheld motion is continuous, so each tick searches around the PREDICTED
// position (last spot + last velocity), not just the last spot — a fast pan
// stays inside the search window instead of jumping out of it and dropping.
// ponytail: translation-only appearance tracking — no scale/rotation, no
// re-detection after loss. Upgrade path if it ever matters: MOSSE filter, or
// re-acquire by scanning the whole frame on loss.

import type { LiveOverlay } from "./liveStore";

export interface TrackPoint { id: string; x: number; y: number } // normalized 0–1

// ── overlay ⇄ tracker glue (pure) ───────────────────────────────────────────

/** The anchor point each on-feed element is tracked BY: an arrow by its tip,
 *  ring/box/label by their center, a path by its centroid, pins by the anchor. */
export function trackables(o: LiveOverlay | null): TrackPoint[] {
  if (!o) return [];
  if (o.kind === "marks") {
    return (o.marks ?? []).flatMap((m, i) => {
      const p = m.shape === "arrow" ? m.to
        : m.shape === "path" && m.points?.length
          ? { x: m.points.reduce((s, q) => s + q.x, 0) / m.points.length, y: m.points.reduce((s, q) => s + q.y, 0) / m.points.length }
          : m.at;
      return p ? [{ id: `m${i}`, x: p.x, y: p.y }] : [];
    });
  }
  if ((o.kind === "note" || o.kind === "model" || o.kind === "figure") && o.anchor) {
    return [{ id: "anchor", x: o.anchor.x, y: o.anchor.y }];
  }
  return [];
}

/** Apply tracked movement/loss to an overlay: marks translate rigidly with
 *  their tracked point, lost marks drop, a fully-lost overlay returns null. */
export function applyTrack(
  o: LiveOverlay,
  moved: Map<string, { x: number; y: number }>,
  lost: string[],
): LiveOverlay | null {
  if (o.kind === "marks") {
    const pts = new Map(trackables(o).map((t) => [t.id, t]));
    const marks = (o.marks ?? []).flatMap((m, i) => {
      const id = `m${i}`;
      if (lost.includes(id)) return [];
      const to = moved.get(id), from = pts.get(id);
      if (!to || !from) return [m];
      const dx = to.x - from.x, dy = to.y - from.y;
      const mv = (p?: { x: number; y: number }) => (p ? { x: p.x + dx, y: p.y + dy } : undefined);
      return [{ ...m, at: mv(m.at), from: mv(m.from), to: mv(m.to), points: m.points?.map((q) => ({ x: q.x + dx, y: q.y + dy })) }];
    });
    return marks.length ? { ...o, marks } : null;
  }
  if (lost.includes("anchor")) return null;
  const to = moved.get("anchor");
  return to ? { ...o, anchor: to } : o;
}

// ── pure matching core (node-testable; no DOM) ──────────────────────────────

export const PATCH = 17;        // odd patch side, downscaled px
export const SEARCH = 18;       // search radius, downscaled px
export const LOST_SCORE = 30;   // mean abs diff (0–255) above this = no match
export const ADAPT_SCORE = 8;   // refresh the template only on near-perfect matches (limits drift)
export const MISS_LIMIT = 9;    // consecutive misses (~1s at 10fps) → target gone

/** Copy a PATCH×PATCH block centered at (cx,cy); null if it leaves the frame. */
export function grabPatch(f: Uint8Array, fw: number, fh: number, cx: number, cy: number): Uint8Array | null {
  const half = (PATCH - 1) / 2;
  const x0 = Math.round(cx) - half, y0 = Math.round(cy) - half;
  if (x0 < 0 || y0 < 0 || x0 + PATCH > fw || y0 + PATCH > fh) return null;
  const out = new Uint8Array(PATCH * PATCH);
  for (let y = 0; y < PATCH; y++) out.set(f.subarray((y0 + y) * fw + x0, (y0 + y) * fw + x0 + PATCH), y * PATCH);
  return out;
}

/** Mean abs diff between the template and the block at (x0,y0). Early-outs once
 *  it can't beat `best` (keeps the whole search cheap). */
function sadAt(f: Uint8Array, fw: number, x0: number, y0: number, tpl: Uint8Array, best: number): number {
  const budget = best * PATCH * PATCH;
  let sum = 0;
  for (let y = 0; y < PATCH; y++) {
    const row = (y0 + y) * fw + x0;
    const trow = y * PATCH;
    for (let x = 0; x < PATCH; x++) sum += Math.abs(f[row + x]! - tpl[trow + x]!);
    if (sum > budget) return Infinity;
  }
  return sum / (PATCH * PATCH);
}

/** Best match for `tpl` within ±SEARCH of (cx,cy). Returns center + score. */
export function bestMatch(f: Uint8Array, fw: number, fh: number, tpl: Uint8Array, cx: number, cy: number): { x: number; y: number; score: number } {
  const half = (PATCH - 1) / 2;
  let bx = cx, by = cy, best = Infinity;
  const x0min = Math.max(0, Math.round(cx) - half - SEARCH), x0max = Math.min(fw - PATCH, Math.round(cx) - half + SEARCH);
  const y0min = Math.max(0, Math.round(cy) - half - SEARCH), y0max = Math.min(fh - PATCH, Math.round(cy) - half + SEARCH);
  for (let y0 = y0min; y0 <= y0max; y0++) {
    for (let x0 = x0min; x0 <= x0max; x0++) {
      const s = sadAt(f, fw, x0, y0, tpl, best === Infinity ? 255 : best);
      if (s < best) { best = s; bx = x0 + half; by = y0 + half; }
    }
  }
  return { x: bx, y: by, score: best };
}

// ── DOM tracker (samples a <video>, drives position updates) ────────────────

interface Target {
  id: string;
  x: number; y: number;        // current, downscaled px
  vx: number; vy: number;      // smoothed velocity, downscaled px/tick (for prediction)
  tpl: Uint8Array;
  misses: number;
}

export class MarkTracker {
  private targets: Target[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  private fw = 0; private fh = 0;
  private video: HTMLVideoElement;
  /** moved: id → new normalized pos; lost: ids whose object left the view */
  private onChange: (moved: Map<string, { x: number; y: number }>, lost: string[]) => void;

  // (explicit fields, not TS parameter properties — the test file runs under
  // node --experimental-strip-types, which doesn't support them)
  constructor(video: HTMLVideoElement, onChange: (moved: Map<string, { x: number; y: number }>, lost: string[]) => void) {
    this.video = video;
    this.onChange = onChange;
  }

  /** Grayscale downscale of the current video frame. Null until video is ready. */
  private frame(): Uint8Array | null {
    const v = this.video;
    if (!this.canvas || !v.videoWidth || !v.videoHeight) return null;
    this.fw = 160;
    this.fh = Math.max(2, Math.round((160 * v.videoHeight) / v.videoWidth));
    this.canvas.width = this.fw; this.canvas.height = this.fh;
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, this.fw, this.fh);
    const { data } = ctx.getImageData(0, 0, this.fw, this.fh);
    const g = new Uint8Array(this.fw * this.fh);
    for (let i = 0; i < g.length; i++) {
      const p = i * 4;
      g[i] = (data[p]! * 77 + data[p + 1]! * 150 + data[p + 2]! * 29) >> 8; // Rec.601-ish
    }
    return g;
  }

  /** (Re)acquire templates for the given anchor points from the CURRENT frame.
   *  Points too close to the edge for a full patch are dropped immediately. */
  setTargets(points: TrackPoint[]): void {
    const f = this.frame();
    this.targets = [];
    if (!f) return;
    for (const p of points) {
      const cx = p.x * this.fw, cy = p.y * this.fh;
      const tpl = grabPatch(f, this.fw, this.fh, cx, cy);
      if (tpl) this.targets.push({ id: p.id, x: cx, y: cy, vx: 0, vy: 0, tpl, misses: 0 });
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 100); // ~10 fps — plenty for handheld drift
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.targets = [];
  }

  private tick(): void {
    if (!this.targets.length) return;
    const f = this.frame();
    if (!f) return;
    const moved = new Map<string, { x: number; y: number }>();
    const lost: string[] = [];
    const clampVel = (v: number) => Math.max(-SEARCH, Math.min(SEARCH, v)); // never predict past one search window
    for (const t of this.targets) {
      // search around where the object is HEADING; if that overshoots, fall back
      // to the last-known spot (a wrong prediction shouldn't cost the track)
      let m = bestMatch(f, this.fw, this.fh, t.tpl, t.x + t.vx, t.y + t.vy);
      if (m.score > LOST_SCORE && (t.vx || t.vy)) {
        const m2 = bestMatch(f, this.fw, this.fh, t.tpl, t.x, t.y);
        if (m2.score < m.score) m = m2;
      }
      if (m.score <= LOST_SCORE) {
        t.misses = 0;
        const dx = m.x - t.x, dy = m.y - t.y;
        t.vx = clampVel(0.6 * dx + 0.4 * t.vx); // smoothed so one noisy frame doesn't fling the prediction
        t.vy = clampVel(0.6 * dy + 0.4 * t.vy);
        if (dx || dy) { t.x = m.x; t.y = m.y; moved.set(t.id, { x: m.x / this.fw, y: m.y / this.fh }); }
        if (m.score <= ADAPT_SCORE) { const fresh = grabPatch(f, this.fw, this.fh, m.x, m.y); if (fresh) t.tpl = fresh; }
      } else if (++t.misses >= MISS_LIMIT) {
        lost.push(t.id);
      } else {
        t.vx *= 0.5; t.vy *= 0.5; // decay the guess while we've lost sight of it
      }
    }
    if (lost.length) this.targets = this.targets.filter((t) => !lost.includes(t.id));
    if (moved.size || lost.length) this.onChange(moved, lost);
  }
}
