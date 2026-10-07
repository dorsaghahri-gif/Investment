/**
 * Time-series primitives. All functions are pure and deterministic.
 * Conventions: dates are ISO YYYY-MM-DD; returns are decimal fractions.
 * Functions return null instead of guessing when inputs are insufficient.
 */
export interface DatedValue {
  date: string;
  value: number;
}
export interface DatedReturn {
  date: string;
  r: number;
}

export const CALC_VERSION = "calc-v1";
export const TRADING_DAYS = 252;

/** Simple period returns from a price/value series (ascending by date). Non-positive prior values are skipped. */
export function simpleReturns(series: DatedValue[]): DatedReturn[] {
  const s = [...series].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: DatedReturn[] = [];
  for (let i = 1; i < s.length; i++) {
    const prev = s[i - 1].value;
    const cur = s[i].value;
    if (!(prev > 0) || !Number.isFinite(cur)) continue;
    out.push({ date: s[i].date, r: cur / prev - 1 });
  }
  return out;
}

/** Keep only dates present in every series; returns aligned arrays in date order. */
export function alignReturns(seriesByKey: Record<string, DatedReturn[]>): { dates: string[]; values: Record<string, number[]> } {
  const keys = Object.keys(seriesByKey);
  if (!keys.length) return { dates: [], values: {} };
  const maps = keys.map((k) => new Map(seriesByKey[k].map((p) => [p.date, p.r])));
  const dates = [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  const values: Record<string, number[]> = {};
  keys.forEach((k, i) => (values[k] = dates.map((d) => maps[i].get(d)!)));
  return { dates, values };
}

/** Compound a list of period returns: Π(1+r) − 1. */
export function compound(returns: number[]): number {
  return returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
}

/** Annualize a total return over a number of calendar days (null for < 1 day). */
export function annualizeReturn(totalReturn: number, calendarDays: number): number | null {
  if (!(calendarDays >= 1) || totalReturn <= -1) return null;
  return Math.pow(1 + totalReturn, 365 / calendarDays) - 1;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
}

/** Return over a window ending at the last point, starting at the last point on/before `fromDate`. */
export function periodReturn(series: DatedValue[], fromDate: string): { value: number; start: DatedValue; end: DatedValue } | null {
  const s = [...series].sort((a, b) => (a.date < b.date ? -1 : 1));
  const end = s.at(-1);
  const start = [...s].reverse().find((p) => p.date <= fromDate);
  if (!end || !start || start.date === end.date || !(start.value > 0)) return null;
  return { value: end.value / start.value - 1, start, end };
}
