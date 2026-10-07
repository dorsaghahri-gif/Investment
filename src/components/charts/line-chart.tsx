"use client";

/**
 * Minimal, dependency-free SVG line chart.
 * Spec (dataviz): 2px lines, recessive grid, one y-axis, crosshair + tooltip,
 * legend for ≥2 series plus direct end labels (identity never color-alone).
 */
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface LineSeries {
  key: string;
  label: string;
  color: string; // CSS color / var()
  points: { date: string; value: number }[];
}

export function LineChart({
  series,
  height = 220,
  formatY,
  formatTooltip,
  className,
  ariaLabel,
}: {
  series: LineSeries[];
  height?: number;
  formatY: (v: number) => string;
  formatTooltip?: (v: number) => string;
  className?: string;
  ariaLabel: string;
}) {
  const W = 720;
  const H = height;
  const longest = Math.max(...series.map((s) => s.label.length));
  const pad = { l: 56, r: series.length > 1 ? Math.min(110, 14 + longest * 6) : 12, t: 10, b: 24 };
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const dates = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort(), [series]);
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  if (dates.length < 2 || !values.length) {
    return <div className={cn("flex items-center justify-center text-sm text-muted-foreground", className)} style={{ height }}>Not enough data to draw a chart yet.</div>;
  }
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  lo -= span * 0.05;
  hi += span * 0.05;
  const x = (i: number) => pad.l + (i / (dates.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const idx = new Map(dates.map((d, i) => [d, i]));
  const ticks = Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / 4);
  const xTicks = [0, Math.floor((dates.length - 1) / 2), dates.length - 1];
  const fmtT = formatTooltip ?? formatY;

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (dates.length - 1));
    setHover(Math.max(0, Math.min(dates.length - 1, i)));
  };

  const hoverDate = hover !== null ? dates[hover] : null;
  return (
    <div className={cn("relative", className)}>
      {series.length > 1 && (
        <div className="mb-1.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground" aria-hidden>
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      )}
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[10px]">{formatY(t)}</text>
          </g>
        ))}
        {xTicks.map((i, k) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} className="fill-muted-foreground text-[10px]">{dates[i]}</text>
        ))}
        {series.map((s) => {
          const pts = s.points.filter((p) => idx.has(p.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
          const d = pts.map((p, j) => `${j ? "L" : "M"}${x(idx.get(p.date)!).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
          const last = pts.at(-1);
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {series.length > 1 && last && (
                <text x={x(idx.get(last.date)!) + 6} y={y(last.value)} dominantBaseline="middle" className="fill-foreground text-[10px] font-medium">{s.label}</text>
              )}
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="currentColor" className="text-muted-foreground" strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s) => {
              const p = s.points.find((q) => q.date === hoverDate);
              return p ? <circle key={s.key} cx={x(hover)} cy={y(p.value)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} /> : null;
            })}
          </g>
        )}
      </svg>
      {hover !== null && hoverDate && (
        <div
          className="pointer-events-none absolute top-6 z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${Math.min(80, Math.max(2, (x(hover) / W) * 100))}%`, transform: "translateX(-50%)" }}
          role="status"
        >
          <div className="mb-0.5 font-medium">{hoverDate}</div>
          {series.map((s) => {
            const p = s.points.find((q) => q.date === hoverDate);
            return (
              <div key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                <span className="text-muted-foreground">{s.label}</span>
                <span className="num ml-auto font-medium">{p ? fmtT(p.value) : "—"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
