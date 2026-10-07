/**
 * Portfolio analytics — pure, deterministic composition of src/lib/calc.
 *
 * Two distinct bases are kept separate and labelled everywhere:
 *   • "actual"    — from stored daily snapshots of what was really held.
 *   • "backtest"  — CURRENT holdings applied to past prices (ex-ante risk).
 *                   Useful for volatility/beta/correlation of today's
 *                   portfolio; never presented as past performance.
 *
 * Price returns use closes (dividends excluded until an adjusted series is
 * ingested); this is stated in the UI.
 */
import { CALC_VERSION, alignReturns, periodReturn, simpleReturns, type DatedValue } from "@/lib/calc/series";
import { timeWeightedReturn, type ValuationPoint } from "@/lib/calc/returns";
import {
  annualizedVolatility,
  beta,
  correlationMatrix,
  downsideDeviation,
  indexFromReturns,
  maxDrawdown,
  sharpeRatio,
  sortinoRatio,
} from "@/lib/calc/risk";
import { effectiveN, groupWeights, hhi, topNWeight } from "@/lib/calc/concentration";

export const ANALYTICS_VERSION = `${CALC_VERSION}+analytics-v1`;
export const BENCHMARKS = ["SPY", "QQQ"] as const;

export interface AnalyticsHolding {
  symbol: string;
  quantity: number;
  sector: string | null;
  industry: string | null;
  securityType: string | null;
  assetClass: string | null;
}

export interface SnapshotPoint {
  date: string;
  totalValue: number;
  netFlow: number;
  dailyReturn: number | null;
}

export interface AnalyticsInput {
  asOf: string; // market date (latest benchmark close)
  holdings: AnalyticsHolding[];
  cash: number;
  closes: Record<string, DatedValue[]>; // per symbol, ascending, ideally ≥ 1y
  benchmarks: Record<string, DatedValue[]>;
  snapshots: SnapshotPoint[];
  riskFreeRate: number | null; // annual decimal; null → Sharpe/Sortino unavailable
  lookbackDays?: number; // backtest window in trading days (default 252)
}

export interface Metric<T = number | null> {
  value: T;
  basis: "actual" | "backtest" | "market";
  note?: string;
}

const ytdStart = (asOf: string) => `${Number(asOf.slice(0, 4)) - 1}-12-31`;

export function lastClose(series: DatedValue[] | undefined, onOrBefore: string): DatedValue | null {
  if (!series?.length) return null;
  for (let i = series.length - 1; i >= 0; i--) if (series[i].date <= onOrBefore) return series[i];
  return null;
}

export function computePortfolioAnalytics(input: AnalyticsInput) {
  const lookback = input.lookbackDays ?? 252;

  // ── Current weights (priced positions only; cash included) ──────────
  const priced = input.holdings
    .map((h) => {
      const c = lastClose(input.closes[h.symbol], input.asOf);
      return { ...h, close: c?.value ?? null, closeDate: c?.date ?? null, value: c ? h.quantity * c.value : null };
    });
  const invested = priced.reduce((s, h) => s + (h.value ?? 0), 0);
  const total = invested + input.cash;
  const weighted = priced.map((h) => ({ ...h, weight: h.value !== null && total > 0 ? h.value / total : null }));
  const cashWeight = total > 0 ? input.cash / total : null;

  // ── Concentration (current) ─────────────────────────────────────────
  const posWeights = weighted.map((h) => h.weight).filter((w): w is number => w !== null);
  const concentration = {
    hhi: { value: hhi(posWeights), basis: "actual" } as Metric,
    effectiveN: { value: effectiveN(posWeights), basis: "actual" } as Metric,
    top5Weight: { value: posWeights.length ? topNWeight(posWeights, 5) : null, basis: "actual" } as Metric,
    largestPosition: weighted.filter((h) => h.weight !== null).sort((a, b) => b.weight! - a.weight!)[0] ?? null,
    bySector: groupWeights(weighted, (h) => (h.securityType === "etf" ? "ETF / Fund" : h.sector), (h) => h.weight),
    byIndustry: groupWeights(weighted, (h) => (h.securityType === "etf" ? "ETF / Fund" : h.industry), (h) => h.weight),
    byAssetClass: [
      ...groupWeights(weighted, (h) => h.assetClass ?? "equity", (h) => h.weight),
      ...(cashWeight ? [{ group: "cash", weight: cashWeight }] : []),
    ].sort((a, b) => b.weight - a.weight),
    byCompany: weighted
      .filter((h) => h.weight !== null)
      .map((h) => ({ group: h.symbol, weight: h.weight! }))
      .sort((a, b) => b.weight - a.weight),
    cashWeight: { value: cashWeight, basis: "actual" } as Metric,
  };

  // ── Backtest of current holdings (ex-ante risk) ─────────────────────
  const symRets: Record<string, { date: string; r: number }[]> = {};
  for (const h of weighted) if (h.weight) symRets[h.symbol] = simpleReturns(input.closes[h.symbol] ?? []).slice(-lookback);
  const spyRets = simpleReturns(input.benchmarks.SPY ?? []).slice(-lookback);
  const aligned = alignReturns({ ...symRets, __SPY: spyRets });
  const missingHistory = weighted.filter((h) => h.weight && (symRets[h.symbol]?.length ?? 0) < lookback * 0.8).map((h) => h.symbol);

  let portRets: number[] = [];
  if (aligned.dates.length) {
    portRets = aligned.dates.map((_, i) =>
      weighted.reduce((s, h) => (h.weight && aligned.values[h.symbol] ? s + h.weight * aligned.values[h.symbol][i] : s), 0),
    );
  }
  const btIndex = indexFromReturns(aligned.dates, portRets);
  const dd = maxDrawdown(btIndex);
  const backtestNote =
    `Current holdings and weights applied to the last ${aligned.dates.length} common trading days` +
    (missingHistory.length ? `; limited history for ${missingHistory.join(", ")}` : "") +
    ". Price returns, dividends excluded.";
  const rfNote = input.riskFreeRate === null ? "Risk-free rate not configured (RISK_FREE_RATE)." : `Risk-free rate ${(input.riskFreeRate * 100).toFixed(2)}% (assumption).`;

  const risk = {
    observations: aligned.dates.length,
    volatility: { value: annualizedVolatility(portRets), basis: "backtest", note: backtestNote } as Metric,
    beta: { value: beta(portRets, aligned.values.__SPY ?? []), basis: "backtest", note: "vs SPY" } as Metric,
    sharpe: { value: input.riskFreeRate === null ? null : sharpeRatio(portRets, input.riskFreeRate), basis: "backtest", note: rfNote } as Metric,
    sortino: { value: input.riskFreeRate === null ? null : sortinoRatio(portRets, input.riskFreeRate), basis: "backtest", note: rfNote } as Metric,
    downsideDeviation: { value: downsideDeviation(portRets), basis: "backtest" } as Metric,
    maxDrawdown: { value: dd?.maxDrawdown ?? null, basis: "backtest", note: dd ? `Peak ${dd.peakDate} → trough ${dd.troughDate}` : undefined } as Metric,
    missingHistory,
    note: backtestNote,
  };

  // Correlation among the largest holdings (max 12 for readability)
  const topSyms = concentration.byCompany.slice(0, 12).map((c) => c.group).filter((s) => aligned.values[s]);
  const corr = correlationMatrix(Object.fromEntries(topSyms.map((s) => [s, aligned.values[s]])));
  const highlyCorrelated: { a: string; b: string; rho: number }[] = [];
  corr.keys.forEach((a, i) =>
    corr.keys.forEach((b, j) => {
      const rho = corr.matrix[i][j];
      if (j > i && rho !== null && rho >= 0.8) highlyCorrelated.push({ a, b, rho });
    }),
  );

  // ── Actual performance (snapshots) ──────────────────────────────────
  const snaps = [...input.snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));
  const linked = (from: string | null) => {
    const sel = snaps.filter((s) => (from ? s.date >= from : true));
    // need the snapshot on/before `from` as the base
    const base = from ? [...snaps].reverse().find((s) => s.date <= from) : snaps[0];
    if (!base) return null;
    const pts: ValuationPoint[] = [base, ...sel.filter((s) => s.date > base.date)].map((s) => ({ date: s.date, value: s.totalValue, flow: s.netFlow }));
    const holdingsBased = sel.filter((s) => s.date > base.date && s.dailyReturn !== null).map((s) => s.dailyReturn!);
    if (pts.length < 2) return null;
    // Prefer the holdings-based daily returns stored on snapshots (robust to manual edits);
    // fall back to flow-adjusted value changes.
    if (holdingsBased.length === pts.length - 1) return { value: holdingsBased.reduce((a, r) => a * (1 + r), 1) - 1, from: base.date };
    const t = timeWeightedReturn(pts);
    return t ? { value: t.twr, from: base.date } : null;
  };
  const ytdBase = ytdStart(input.asOf);
  const ytd = snaps.length && snaps[0].date <= ytdBase ? linked(ytdBase) : null;
  const sinceInception = snaps.length >= 2 ? linked(null) : null;

  const bench = Object.fromEntries(
    BENCHMARKS.map((b) => {
      const pr = periodReturn((input.benchmarks[b] ?? []).filter((p) => p.date <= input.asOf), ytdBase);
      return [b, { ytd: { value: pr?.value ?? null, basis: "market", note: pr ? `${pr.start.date} → ${pr.end.date}, price return` : "Data unavailable" } as Metric }];
    }),
  ) as Record<(typeof BENCHMARKS)[number], { ytd: Metric }>;

  const performance = {
    ytd: {
      value: ytd?.value ?? null,
      basis: "actual",
      note: ytd ? `Time-weighted since ${ytd.from}` : snaps.length ? `Insufficient history: snapshots begin ${snaps[0].date}` : "No daily snapshots yet",
    } as Metric,
    sinceTracking: { value: sinceInception?.value ?? null, basis: "actual", note: sinceInception ? `Time-weighted since ${sinceInception.from}` : "Needs ≥ 2 daily snapshots" } as Metric,
    excessVsSpyYtd: {
      value: ytd && bench.SPY.ytd.value !== null ? ytd.value - bench.SPY.ytd.value : null,
      basis: "actual",
    } as Metric,
    trackingStart: snaps[0]?.date ?? null,
  };

  return {
    version: ANALYTICS_VERSION,
    asOf: input.asOf,
    totals: { invested, cash: input.cash, total, unpriced: weighted.filter((h) => h.value === null).map((h) => h.symbol) },
    positions: weighted,
    concentration,
    risk,
    correlation: { ...corr, highlyCorrelated },
    performance,
    benchmarks: bench,
    backtestSeries: btIndex,
  };
}

export type PortfolioAnalytics = ReturnType<typeof computePortfolioAnalytics>;

// ── Daily snapshot construction ─────────────────────────────────────

export interface SnapshotPosition {
  symbol: string;
  quantity: number;
  price: number | null;
  priceDate: string | null;
  value: number | null;
  weight: number | null;
}

export interface BuiltSnapshot {
  snapshotDate: string;
  marketValue: number;
  cashValue: number;
  totalValue: number;
  costBasis: number | null;
  dailyReturn: number | null;
  positions: SnapshotPosition[];
  priceStaleness: Record<string, string | null>;
}

/**
 * Builds today's snapshot. The daily return is HOLDINGS-BASED: yesterday's
 * positions (and cash at 0%) re-priced from yesterday's closes to today's.
 * Trades, deposits and manual edits therefore never show up as performance.
 */
export function buildSnapshot(args: {
  snapshotDate: string;
  holdings: { symbol: string; quantity: number; costBasisTotal: number | null }[];
  cash: number;
  closes: Record<string, DatedValue[]>;
  previous: { totalValue: number; positions: SnapshotPosition[] } | null;
}): BuiltSnapshot {
  const staleness: Record<string, string | null> = {};
  const positions: SnapshotPosition[] = args.holdings.map((h) => {
    const c = lastClose(args.closes[h.symbol], args.snapshotDate);
    if (!c || c.date !== args.snapshotDate) staleness[h.symbol] = c?.date ?? null;
    return { symbol: h.symbol, quantity: h.quantity, price: c?.value ?? null, priceDate: c?.date ?? null, value: c ? h.quantity * c.value : null, weight: null };
  });
  const marketValue = positions.reduce((s, p) => s + (p.value ?? 0), 0);
  const totalValue = marketValue + args.cash;
  for (const p of positions) p.weight = p.value !== null && totalValue > 0 ? p.value / totalValue : null;
  const costs = args.holdings.map((h) => h.costBasisTotal);
  const costBasis = costs.every((c) => c !== null) ? costs.reduce((a, b) => a + (b as number), 0) : null;

  let dailyReturn: number | null = null;
  const prev = args.previous;
  if (prev && prev.totalValue > 0) {
    let pnl = 0;
    let ok = true;
    for (const p of prev.positions) {
      if (p.price === null || p.value === null) continue; // unpriced yesterday: not in base either
      const today = lastClose(args.closes[p.symbol], args.snapshotDate);
      if (!today) {
        ok = false;
        break;
      }
      pnl += p.quantity * (today.value - p.price);
    }
    dailyReturn = ok ? pnl / prev.totalValue : null;
  }

  return {
    snapshotDate: args.snapshotDate,
    marketValue,
    cashValue: args.cash,
    totalValue,
    costBasis,
    dailyReturn,
    positions,
    priceStaleness: staleness,
  };
}
