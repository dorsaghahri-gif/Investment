import { describe, expect, it } from "vitest";
import { buildSnapshot, computePortfolioAnalytics } from "./portfolio";
import type { DatedValue } from "@/lib/calc/series";

function series(start: string, n: number, f: (i: number) => number): DatedValue[] {
  const out: DatedValue[] = [];
  const d = new Date(start + "T00:00:00Z");
  let i = 0;
  while (out.length < n) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) out.push({ date: d.toISOString().slice(0, 10), value: f(i++) });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("buildSnapshot", () => {
  it("computes holdings-based return that ignores manual edits and deposits", () => {
    const closes = { A: [{ date: "2026-10-05", value: 100 }, { date: "2026-10-06", value: 110 }] };
    const prev = buildSnapshot({ snapshotDate: "2026-10-05", holdings: [{ symbol: "A", quantity: 10, costBasisTotal: 900 }], cash: 1000, closes, previous: null });
    expect(prev.totalValue).toBe(2000);
    expect(prev.dailyReturn).toBeNull();
    // user added 10 shares and $5000 cash overnight — must not count as return
    const today = buildSnapshot({ snapshotDate: "2026-10-06", holdings: [{ symbol: "A", quantity: 20, costBasisTotal: null }], cash: 6000, closes, previous: prev });
    expect(today.dailyReturn).toBeCloseTo(100 / 2000, 12); // 10 sh × $10 on a $2000 base
    expect(today.costBasis).toBeNull();
    expect(today.priceStaleness).toEqual({});
  });
  it("flags stale prices", () => {
    const s = buildSnapshot({
      snapshotDate: "2026-10-06",
      holdings: [{ symbol: "B", quantity: 1, costBasisTotal: 1 }],
      cash: 0,
      closes: { B: [{ date: "2026-10-02", value: 5 }] },
      previous: null,
    });
    expect(s.priceStaleness).toEqual({ B: "2026-10-02" });
    expect(s.totalValue).toBe(5);
  });
});

describe("computePortfolioAnalytics", () => {
  const n = 300;
  const spy = series("2025-08-01", n, (i) => 500 * (1 + 0.0005 * i + 0.01 * Math.sin(i / 3)));
  const lev = series("2025-08-01", n, (i) => 100 * (1 + 0.001 * i + 0.02 * Math.sin(i / 3)));
  const asOf = spy.at(-1)!.date;

  it("separates actual vs backtest bases and refuses missing data", () => {
    const a = computePortfolioAnalytics({
      asOf,
      holdings: [
        { symbol: "LEV", quantity: 10, sector: "Technology", industry: "Semis", securityType: "stock", assetClass: "equity" },
        { symbol: "NOPX", quantity: 5, sector: null, industry: null, securityType: "stock", assetClass: "equity" },
      ],
      cash: 0,
      closes: { LEV: lev },
      benchmarks: { SPY: spy },
      snapshots: [],
      riskFreeRate: null,
    });
    expect(a.totals.unpriced).toEqual(["NOPX"]);
    expect(a.risk.volatility.basis).toBe("backtest");
    expect(a.risk.volatility.value).toBeGreaterThan(0);
    expect(a.risk.beta.value).toBeGreaterThan(1); // sin amplitude doubled ≈ higher beta
    expect(a.risk.sharpe.value).toBeNull(); // no risk-free configured
    expect(a.performance.ytd.value).toBeNull();
    expect(a.performance.ytd.note).toMatch(/No daily snapshots/);
    expect(a.benchmarks.SPY.ytd.value).not.toBeNull();
    expect(a.concentration.bySector).toEqual([{ group: "Technology", weight: 1 }]);
  });

  it("links snapshot returns for YTD only when history covers the year start", () => {
    const base = {
      asOf: "2026-03-31",
      holdings: [],
      cash: 100,
      closes: {},
      benchmarks: { SPY: spy },
      riskFreeRate: 0.04,
    };
    const short = computePortfolioAnalytics({ ...base, snapshots: [{ date: "2026-02-01", totalValue: 100, netFlow: 0, dailyReturn: null }, { date: "2026-02-02", totalValue: 101, netFlow: 0, dailyReturn: 0.01 }] });
    expect(short.performance.ytd.value).toBeNull();
    expect(short.performance.sinceTracking.value).toBeCloseTo(0.01, 12);
    const full = computePortfolioAnalytics({
      ...base,
      snapshots: [
        { date: "2025-12-31", totalValue: 100, netFlow: 0, dailyReturn: null },
        { date: "2026-01-02", totalValue: 110, netFlow: 0, dailyReturn: 0.1 },
        { date: "2026-01-05", totalValue: 99, netFlow: 0, dailyReturn: -0.1 },
      ],
    });
    expect(full.performance.ytd.value).toBeCloseTo(1.1 * 0.9 - 1, 12);
  });
});
