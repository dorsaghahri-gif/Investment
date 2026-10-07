/**
 * Risk statistics on period (daily) returns. All are HISTORICAL measures and
 * must never be presented as expected future values.
 * Minimum sample sizes guard against meaningless numbers (→ null).
 */
import { TRADING_DAYS } from "./series";

export const MIN_OBS = 20;
/** Dispersion below this is treated as zero (floating-point noise), making ratios undefined. */
const EPS = 1e-12;
const usable = (s: number | null): s is number => s !== null && s > EPS;

export function mean(x: number[]): number | null {
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
}

/** Sample standard deviation (n−1). */
export function stdev(x: number[]): number | null {
  if (x.length < 2) return null;
  const m = mean(x)!;
  return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1));
}

export function annualizedVolatility(returns: number[], periodsPerYear = TRADING_DAYS): number | null {
  if (returns.length < MIN_OBS) return null;
  const s = stdev(returns);
  return s === null ? null : s * Math.sqrt(periodsPerYear);
}

/** Annualized downside deviation below a minimum acceptable return (annual MAR, default 0). */
export function downsideDeviation(returns: number[], marAnnual = 0, periodsPerYear = TRADING_DAYS): number | null {
  if (returns.length < MIN_OBS) return null;
  const mar = marAnnual / periodsPerYear;
  const sq = returns.map((r) => Math.min(r - mar, 0) ** 2);
  return Math.sqrt(sq.reduce((a, b) => a + b, 0) / returns.length) * Math.sqrt(periodsPerYear);
}

/** Annualized Sharpe ratio using arithmetic mean excess return. */
export function sharpeRatio(returns: number[], riskFreeAnnual: number, periodsPerYear = TRADING_DAYS): number | null {
  if (returns.length < MIN_OBS) return null;
  const rf = riskFreeAnnual / periodsPerYear;
  const ex = returns.map((r) => r - rf);
  const s = stdev(ex);
  if (!usable(s)) return null;
  return (mean(ex)! / s) * Math.sqrt(periodsPerYear);
}

export function sortinoRatio(returns: number[], riskFreeAnnual: number, periodsPerYear = TRADING_DAYS): number | null {
  if (returns.length < MIN_OBS) return null;
  const dd = downsideDeviation(returns, riskFreeAnnual, periodsPerYear);
  if (!usable(dd)) return null;
  const rf = riskFreeAnnual / periodsPerYear;
  return (mean(returns.map((r) => r - rf))! * periodsPerYear) / dd;
}

export function covariance(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 2) return null;
  const ma = mean(a)!;
  const mb = mean(b)!;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (a.length - 1);
}

export function correlation(a: number[], b: number[]): number | null {
  if (a.length < MIN_OBS) return null;
  const c = covariance(a, b);
  const sa = stdev(a);
  const sb = stdev(b);
  if (c === null || !usable(sa) || !usable(sb)) return null;
  return Math.max(-1, Math.min(1, c / (sa * sb)));
}

/** Beta of asset vs benchmark on aligned returns. */
export function beta(asset: number[], bench: number[]): number | null {
  if (asset.length < MIN_OBS) return null;
  const c = covariance(asset, bench);
  const s = stdev(bench);
  if (c === null || !usable(s)) return null;
  return c / (s * s);
}

export interface Drawdown {
  maxDrawdown: number; // ≤ 0, fraction
  peakDate: string;
  troughDate: string;
  recoveryDate: string | null;
}

/** Maximum peak-to-trough decline of a value series. */
export function maxDrawdown(series: { date: string; value: number }[]): Drawdown | null {
  const s = [...series].filter((p) => p.value > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (s.length < 2) return null;
  let peak = s[0];
  let worst: Drawdown = { maxDrawdown: 0, peakDate: s[0].date, troughDate: s[0].date, recoveryDate: null };
  let worstPeakValue = s[0].value;
  for (const p of s) {
    if (p.value > peak.value) peak = p;
    const dd = p.value / peak.value - 1;
    if (dd < worst.maxDrawdown) {
      worst = { maxDrawdown: dd, peakDate: peak.date, troughDate: p.date, recoveryDate: null };
      worstPeakValue = peak.value;
    }
  }
  if (worst.maxDrawdown < 0) {
    const rec = s.find((p) => p.date > worst.troughDate && p.value >= worstPeakValue);
    worst.recoveryDate = rec?.date ?? null;
  }
  return worst;
}

export function correlationMatrix(values: Record<string, number[]>): { keys: string[]; matrix: (number | null)[][] } {
  const keys = Object.keys(values);
  const matrix = keys.map((a) => keys.map((b) => (a === b ? 1 : correlation(values[a], values[b]))));
  return { keys, matrix };
}

/** Rebuild a value index (start = 1) from returns — used for drawdown on return series. */
export function indexFromReturns(dates: string[], returns: number[]): { date: string; value: number }[] {
  let v = 1;
  return returns.map((r, i) => ({ date: dates[i], value: (v *= 1 + r) }));
}
