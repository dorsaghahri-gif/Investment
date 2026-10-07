/**
 * Portfolio performance measures.
 *
 * TIME-WEIGHTED RETURN (daily-linked):
 *   External flows (deposits +, withdrawals −) are assumed to occur at the
 *   START of the day they are recorded, so for day t:
 *     r_t = (V_t − V_{t−1} − F_t) / (V_{t−1} + F_t)
 *   TWR = Π(1 + r_t) − 1. Days whose starting capital (V_{t−1}+F_t) ≤ 0 are
 *   excluded and counted in `skippedDays`.
 *
 * MONEY-WEIGHTED RETURN (XIRR):
 *   Investor perspective — money put in is negative, money taken out (and the
 *   ending value) is positive. Solved with Newton–Raphson, falling back to
 *   bisection. Returns null when no solution exists (e.g. all flows same sign).
 */
import { compound, daysBetween } from "./series";

export interface ValuationPoint {
  date: string;
  value: number; // end-of-day total value (positions + cash)
  flow: number; // net external flow that day (deposits − withdrawals)
}

export function dailyFlowAdjustedReturns(points: ValuationPoint[]): { date: string; r: number }[] & { skippedDays?: number } {
  const p = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: { date: string; r: number }[] & { skippedDays?: number } = [];
  let skipped = 0;
  for (let i = 1; i < p.length; i++) {
    const base = p[i - 1].value + p[i].flow;
    if (!(base > 0)) {
      skipped++;
      continue;
    }
    out.push({ date: p[i].date, r: (p[i].value - p[i - 1].value - p[i].flow) / base });
  }
  out.skippedDays = skipped;
  return out;
}

export function timeWeightedReturn(points: ValuationPoint[]): { twr: number; days: number; skippedDays: number } | null {
  const daily = dailyFlowAdjustedReturns(points);
  if (daily.length === 0) return null;
  return { twr: compound(daily.map((d) => d.r)), days: daily.length, skippedDays: daily.skippedDays ?? 0 };
}

export interface CashFlow {
  date: string;
  amount: number;
}

export function xirr(flows: CashFlow[], guess = 0.1): number | null {
  const f = flows.filter((c) => c.amount !== 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (f.length < 2) return null;
  if (!f.some((c) => c.amount > 0) || !f.some((c) => c.amount < 0)) return null;
  const t0 = f[0].date;
  const years = f.map((c) => daysBetween(t0, c.date) / 365);
  const npv = (r: number) => f.reduce((s, c, i) => s + c.amount / Math.pow(1 + r, years[i]), 0);
  const dnpv = (r: number) => f.reduce((s, c, i) => s - (years[i] * c.amount) / Math.pow(1 + r, years[i] + 1), 0);

  // Newton–Raphson
  let r = guess;
  for (let i = 0; i < 100; i++) {
    const v = npv(r);
    const d = dnpv(r);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!Number.isFinite(next) || next <= -0.999999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  // Bisection fallback on (-0.9999, 100)
  let lo = -0.9999;
  let hi = 100;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || Math.sign(flo) === Math.sign(fhi)) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-12) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return null;
}

/**
 * Builds XIRR cash flows from a valuation history: start value is treated as
 * an initial investment, external flows as additional investments/withdrawals,
 * end value as the terminal (liquidation) value.
 */
export function moneyWeightedReturn(points: ValuationPoint[]): number | null {
  const p = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (p.length < 2) return null;
  const flows: CashFlow[] = [{ date: p[0].date, amount: -p[0].value }];
  for (let i = 1; i < p.length; i++) if (p[i].flow) flows.push({ date: p[i].date, amount: -p[i].flow });
  flows.push({ date: p.at(-1)!.date, amount: p.at(-1)!.value });
  return xirr(flows);
}
