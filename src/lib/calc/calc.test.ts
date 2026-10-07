import { describe, expect, it } from "vitest";
import { annualizeReturn, alignReturns, compound, periodReturn, simpleReturns } from "./series";
import { dailyFlowAdjustedReturns, moneyWeightedReturn, timeWeightedReturn, xirr } from "./returns";
import { annualizedVolatility, beta, correlation, correlationMatrix, downsideDeviation, maxDrawdown, sharpeRatio, sortinoRatio, stdev } from "./risk";
import { effectiveN, groupWeights, hhi, topNWeight } from "./concentration";
import { attributeDay } from "./attribution";

/** Deterministic pseudo-random returns for statistical tests. */
function rets(n: number, seed: number, scale = 0.01) {
  let s = seed;
  return Array.from({ length: n }, () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s / 2147483648 - 0.5) * 2 * scale;
  });
}

describe("series", () => {
  it("computes simple returns and skips non-positive bases", () => {
    const r = simpleReturns([
      { date: "2026-01-02", value: 100 },
      { date: "2026-01-05", value: 110 },
      { date: "2026-01-03", value: 0 },
    ]);
    // sorted: 100 → 0 (skipped? no: base 100, cur 0 → -100%), then 0 → 110 skipped
    expect(r).toEqual([{ date: "2026-01-03", r: -1 }]);
  });
  it("aligns on common dates", () => {
    const a = alignReturns({ A: [{ date: "d1", r: 0.1 }, { date: "d2", r: 0.2 }], B: [{ date: "d2", r: 0.3 }] });
    expect(a.dates).toEqual(["d2"]);
    expect(a.values).toEqual({ A: [0.2], B: [0.3] });
  });
  it("compounds and annualizes", () => {
    expect(compound([0.1, -0.1])).toBeCloseTo(-0.01, 12);
    expect(annualizeReturn(0.21, 730)).toBeCloseTo(0.1, 3);
    expect(annualizeReturn(0.1, 0)).toBeNull();
  });
  it("period return uses last point on/before the start date", () => {
    const pr = periodReturn(
      [
        { date: "2025-12-31", value: 100 },
        { date: "2026-01-02", value: 105 },
        { date: "2026-06-30", value: 120 },
      ],
      "2025-12-31",
    )!;
    expect(pr.value).toBeCloseTo(0.2, 12);
    expect(periodReturn([{ date: "2026-01-02", value: 1 }], "2025-12-31")).toBeNull();
  });
});

describe("time-weighted return", () => {
  it("neutralizes deposits (start-of-day convention)", () => {
    const pts = [
      { date: "2026-01-01", value: 100, flow: 0 },
      { date: "2026-01-02", value: 210, flow: 100 }, // +100 deposit, +10 gain on 200
      { date: "2026-01-03", value: 189, flow: 0 }, // −10%
    ];
    const daily = dailyFlowAdjustedReturns(pts);
    expect(daily[0].r).toBeCloseTo(0.05, 12);
    expect(daily[1].r).toBeCloseTo(-0.1, 12);
    expect(timeWeightedReturn(pts)!.twr).toBeCloseTo(1.05 * 0.9 - 1, 12);
  });
  it("returns null without at least two points", () => {
    expect(timeWeightedReturn([{ date: "2026-01-01", value: 1, flow: 0 }])).toBeNull();
  });
});

describe("XIRR", () => {
  it("matches the Excel XIRR reference example (37.336%)", () => {
    const r = xirr([
      { date: "2008-01-01", amount: -10000 },
      { date: "2008-03-01", amount: 2750 },
      { date: "2008-10-30", amount: 4250 },
      { date: "2009-02-15", amount: 3250 },
      { date: "2009-04-01", amount: 2750 },
    ])!;
    expect(r).toBeCloseTo(0.373362535, 6);
  });
  it("is 10% for −1000 → +1100 after 365 days", () => {
    expect(xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2026-01-01", amount: 1100 }])!).toBeCloseTo(0.1, 8);
  });
  it("returns null when all flows have the same sign", () => {
    expect(xirr([{ date: "2025-01-01", amount: 100 }, { date: "2026-01-01", amount: 100 }])).toBeNull();
  });
  it("money-weighted return differs from TWR when flows are badly timed", () => {
    const pts = [
      { date: "2025-01-01", value: 1000, flow: 0 },
      { date: "2025-07-01", value: 12000, flow: 10000 }, // +10% on first 1000 then big deposit... (value includes deposit)
      { date: "2026-01-01", value: 10800, flow: 0 }, // −10% after deposit
    ];
    const mwr = moneyWeightedReturn(pts)!;
    const twr = timeWeightedReturn(pts)!.twr;
    expect(mwr).toBeLessThan(twr);
  });
});

describe("risk", () => {
  const a = rets(252, 7);
  it("annualizes volatility by sqrt(252) and enforces minimum sample", () => {
    expect(annualizedVolatility(a)!).toBeCloseTo(stdev(a)! * Math.sqrt(252), 12);
    expect(annualizedVolatility(a.slice(0, 5))).toBeNull();
  });
  it("beta and correlation behave on scaled and identical series", () => {
    const b = a.map((x) => 2 * x);
    expect(beta(b, a)!).toBeCloseTo(2, 10);
    expect(correlation(a, b)!).toBeCloseTo(1, 10);
    expect(correlation(a, a.map((x) => -x))!).toBeCloseTo(-1, 10);
  });
  it("downside deviation ignores upside", () => {
    const up = Array(30).fill(0.01);
    expect(downsideDeviation(up)).toBe(0);
    expect(sortinoRatio(up, 0)).toBeNull(); // no downside → undefined, not infinite
  });
  it("sharpe of constant positive excess returns is undefined (zero variance)", () => {
    expect(sharpeRatio(Array(30).fill(0.001), 0)).toBeNull();
    expect(sharpeRatio(a, 0.04)).not.toBeNull();
  });
  it("max drawdown with peak, trough and recovery", () => {
    const dd = maxDrawdown([
      { date: "d1", value: 100 },
      { date: "d2", value: 120 },
      { date: "d3", value: 90 },
      { date: "d4", value: 95 },
      { date: "d5", value: 130 },
    ])!;
    expect(dd.maxDrawdown).toBeCloseTo(-0.25, 12);
    expect(dd).toMatchObject({ peakDate: "d2", troughDate: "d3", recoveryDate: "d5" });
  });
  it("correlation matrix is symmetric with unit diagonal", () => {
    const m = correlationMatrix({ A: a, B: rets(252, 11), C: a.map((x) => x * 3) });
    expect(m.matrix[0][0]).toBe(1);
    expect(m.matrix[0][2]).toBeCloseTo(1, 10);
    expect(m.matrix[1][0]).toBeCloseTo(m.matrix[0][1]!, 12);
  });
});

describe("concentration", () => {
  it("computes HHI and effective N", () => {
    expect(hhi([0.5, 0.5])).toBeCloseTo(0.5);
    expect(effectiveN([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(4);
    expect(hhi([])).toBeNull();
    expect(topNWeight([0.1, 0.5, 0.4], 2)).toBeCloseTo(0.9);
  });
  it("groups weights with an Unclassified bucket", () => {
    const g = groupWeights(
      [
        { s: "Tech", w: 0.3 },
        { s: null, w: 0.1 },
        { s: "Tech", w: 0.2 },
        { s: "Energy", w: null },
      ],
      (x) => x.s,
      (x) => x.w,
    );
    expect(g).toEqual([
      { group: "Tech", weight: 0.5 },
      { group: "Unclassified", weight: 0.1 },
    ]);
  });
});

describe("attribution", () => {
  it("reconciles daily change into contributions, flows and residual", () => {
    const a = attributeDay({
      prevValue: 10_000,
      value: 10_842 + 500,
      netFlows: 500,
      moves: [
        { symbol: "NVDA", quantity: 10, prevClose: 100, close: 141 }, // +410
        { symbol: "MSFT", quantity: 4, prevClose: 400, close: 458 }, // +232
        { symbol: "QXO", quantity: 21, prevClose: 20, close: 15 }, // −105
        { symbol: "OTHER", quantity: 61, prevClose: 10, close: 15 }, // +305
        { symbol: "NEW", quantity: 1, prevClose: null, close: 5 },
      ],
    });
    expect(a.marketContribution).toBe(842);
    expect(a.residual).toBeCloseTo(0, 9);
    expect(a.top.map((c) => c.symbol)).toEqual(["NVDA", "OTHER", "MSFT"]);
    expect(a.bottom.map((c) => c.symbol)).toEqual(["QXO"]);
    expect(a.unpriced).toEqual(["NEW"]);
  });
});
