"use client";

import { useId } from "react";
import { Figure } from "./parts";

// Themed, dependency-free charts drawn as inline SVG. Colors come from the app's
// accent/arc/success/destructive tokens so they flip with light/dark for free.
// ponytail: hand-rolled SVG over recharts — full theme control, no 400kb dep,
// covers line/bar/area/pie which is all the catalog exposes.

type Row = Record<string, string | number>;
type Series = { key: string; label?: string; color?: string };
export interface ChartProps {
  kind: "line" | "bar" | "area" | "pie";
  data: Row[];
  series: Series[];
  xKey?: string;
  caption?: string;
}

const PALETTE = ["var(--accent)", "var(--arc)", "var(--success)", "var(--destructive)", "#8b5cf6", "#0ea5e9"];
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export function Chart({ props }: { props: ChartProps }) {
  const { kind, data, series, xKey, caption } = props;
  const cats = data.map((r, i) => String(xKey ? r[xKey] : (r.name ?? r.label ?? i + 1)));
  const colors = series.map((s, i) => s.color || PALETTE[i % PALETTE.length]!);
  const body = kind === "pie"
    ? <Pie data={data} series={series} colors={colors} />
    : <XY kind={kind} data={data} series={series} colors={colors} cats={cats} />;
  return (
    <Figure caption={caption}>
      <div className="w-full">
        {body}
        {series.length > 1 || kind === "pie" ? (
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {(kind === "pie" ? cats : series.map((s) => s.label || s.key)).map((lbl, i) => (
              <span key={lbl + i} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="size-2.5 rounded-[3px]" style={{ background: colors[i % colors.length] }} />
                {lbl}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Figure>
  );
}

const W = 560, H = 260, P = { l: 40, r: 12, t: 12, b: 28 };

function XY({ kind, data, series, colors, cats }: { kind: string; data: Row[]; series: Series[]; colors: string[]; cats: string[] }) {
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(1, ...data.flatMap((r) => series.map((s) => num(r[s.key]))));
  const x = (i: number) => P.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => P.t + ih - (v / max) * ih;
  const ticks = 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="xMidYMid meet" role="img">
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const gy = P.t + (i / ticks) * ih;
        return <g key={i}>
          <line x1={P.l} y1={gy} x2={W - P.r} y2={gy} stroke="var(--border)" strokeWidth={1} />
          <text x={P.l - 6} y={gy + 3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">{Math.round(max * (1 - i / ticks))}</text>
        </g>;
      })}
      {cats.map((c, i) => (data.length > 12 && i % 2 ? null :
        <text key={i} x={kind === "bar" ? bandX(i, data.length, iw) + P.l + band(data.length, iw) / 2 : x(i)} y={H - P.b + 16} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">{c.length > 8 ? c.slice(0, 8) + "…" : c}</text>
      ))}
      {kind === "bar"
        ? series.map((s, si) => data.map((r, i) => {
            const bw = band(data.length, iw) / series.length;
            const bx = P.l + bandX(i, data.length, iw) + si * bw;
            const v = num(r[s.key]);
            return <rect key={s.key + i} x={bx + 1} y={y(v)} width={Math.max(1, bw - 2)} height={P.t + ih - y(v)} rx={2} fill={colors[si]} />;
          }))
        : series.map((s, si) => {
            const pts = data.map((r, i) => `${x(i)},${y(num(r[s.key]))}`).join(" ");
            const area = `${P.l},${P.t + ih} ${pts} ${x(data.length - 1)},${P.t + ih}`;
            return <g key={s.key}>
              {kind === "area" && <polygon points={area} fill={colors[si]} opacity={0.14} />}
              <polyline points={pts} fill="none" stroke={colors[si]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {data.map((r, i) => <circle key={i} cx={x(i)} cy={y(num(r[s.key]))} r={2.5} fill={colors[si]} />)}
            </g>;
          })}
    </svg>
  );
}
const band = (n: number, iw: number) => (iw / Math.max(1, n)) * 0.7;
const bandX = (i: number, n: number, iw: number) => (iw / Math.max(1, n)) * i + (iw / Math.max(1, n)) * 0.15;

function Pie({ data, series, colors }: { data: Row[]; series: Series[]; colors: string[] }) {
  const key = series[0]?.key ?? "value";
  const vals = data.map((r) => num(r[key]));
  const total = Math.max(1, vals.reduce((a, b) => a + b, 0));
  const cx = 130, cy = 130, r = 110;
  let acc = -Math.PI / 2;
  const id = useId();
  return (
    <svg viewBox="0 0 260 260" className="mx-auto h-auto w-full max-w-[260px]" role="img">
      {vals.map((v, i) => {
        const ang = (v / total) * Math.PI * 2;
        const x1 = cx + r * Math.cos(acc), y1 = cy + r * Math.sin(acc);
        acc += ang;
        const x2 = cx + r * Math.cos(acc), y2 = cy + r * Math.sin(acc);
        const large = ang > Math.PI ? 1 : 0;
        return <path key={id + i} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`} fill={colors[i % colors.length]} stroke="var(--card)" strokeWidth={1.5} />;
      })}
    </svg>
  );
}
