"use client";

import { useMemo, useState } from "react";
import { LineChart } from "./line-chart";
import { cn } from "@/lib/utils";

type Pt = { date: string; value: number };
const RANGES = [
  { key: "1M", days: 31 },
  { key: "3M", days: 92 },
  { key: "6M", days: 183 },
  { key: "YTD", days: null },
  { key: "1Y", days: 366 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function cut(points: Pt[], range: RangeKey, asOf: string): Pt[] {
  const r = RANGES.find((x) => x.key === range)!;
  let from: string;
  if (r.days === null) from = `${Number(asOf.slice(0, 4)) - 1}-12-31`;
  else {
    const d = new Date(asOf + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - r.days);
    from = d.toISOString().slice(0, 10);
  }
  // include the last point on/before `from` as the base
  const base = [...points].reverse().find((p) => p.date <= from);
  return points.filter((p) => p.date > from || p === base);
}

function rebase(points: Pt[]): Pt[] {
  const b = points[0]?.value;
  return b ? points.map((p) => ({ date: p.date, value: (p.value / b) * 100 })) : [];
}

export function RangeTabs({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="inline-flex rounded-md border p-0.5" role="tablist" aria-label="Time range">
      {RANGES.map((r) => (
        <button
          key={r.key}
          role="tab"
          aria-selected={value === r.key}
          onClick={() => onChange(r.key)}
          className={cn("rounded px-2 py-0.5 text-[11px] font-medium", value === r.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
        >
          {r.key}
        </button>
      ))}
    </div>
  );
}

/** Indexed comparison: current-holdings backtest vs SPY vs QQQ (all rebased to 100 at range start). */
export function ComparisonChart({ asOf, portfolio, spy, qqq }: { asOf: string; portfolio: Pt[]; spy: Pt[]; qqq: Pt[] }) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const series = useMemo(() => {
    const p = cut(portfolio, range, asOf);
    const start = p[0]?.date;
    const align = (s: Pt[]) => rebase(cut(s, range, asOf).filter((x) => !start || x.date >= start));
    return [
      { key: "p", label: "Holdings", color: "var(--viz-1)", points: rebase(p) },
      { key: "spy", label: "SPY", color: "var(--viz-2)", points: align(spy) },
      { key: "qqq", label: "QQQ", color: "var(--viz-3)", points: align(qqq) },
    ];
  }, [portfolio, spy, qqq, range, asOf]);
  const ret = (pts: Pt[]) => (pts.length > 1 ? pts.at(-1)!.value / 100 - 1 : null);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3 text-xs">
          {series.map((s) => {
            const r = ret(s.points);
            return (
              <span key={s.key} className="text-muted-foreground">
                {s.label}: <span className={cn("num font-medium", r !== null && (r >= 0 ? "text-positive" : "text-negative"))}>{r === null ? "—" : `${r >= 0 ? "+" : "−"}${Math.abs(r * 100).toFixed(1)}%`}</span>
              </span>
            );
          })}
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <LineChart series={series} formatY={(v) => v.toFixed(0)} formatTooltip={(v) => v.toFixed(1)} ariaLabel="Current holdings versus SPY and QQQ, indexed to 100" />
    </div>
  );
}

/** Actual portfolio value from daily snapshots. */
export function ValueChart({ asOf, points }: { asOf: string; points: Pt[] }) {
  const [range, setRange] = useState<RangeKey>("1Y");
  const shown = useMemo(() => cut(points, range, asOf), [points, range, asOf]);
  const fmt = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
  const fmtFull = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
  return (
    <div>
      <div className="mb-2 flex justify-end"><RangeTabs value={range} onChange={setRange} /></div>
      <LineChart series={[{ key: "v", label: "Portfolio value", color: "var(--viz-1)", points: shown }]} formatY={fmt} formatTooltip={fmtFull} ariaLabel="Portfolio value over time" height={200} />
    </div>
  );
}
