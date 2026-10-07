/**
 * Company-level metric calculations (data_kind = calculated). Pure and
 * deterministic: inputs are normalized statements, prices and (optionally)
 * analyst estimates. Every function returns null instead of guessing.
 *
 * Cross-sectional metrics that need the whole universe (roic_vs_sector,
 * growth_vs_industry) are added by the scorer.
 */
import type { LineItems } from "@/lib/domain/fundamentals";

export const METRICS_CALC_VERSION = "metrics-v1";

export interface AnnualPeriod {
  periodEnd: string; // YYYY-MM-DD
  fiscalYear: number | null;
  income: LineItems;
  balance: LineItems;
  cash: LineItems;
}

export interface Close {
  date: string;
  close: number;
}

export interface EstimateInput {
  /** Consensus for the first fiscal year ending after the latest reported annual period. */
  fiscalPeriodEnd: string;
  epsAvg: number | null;
  epsLow: number | null;
  epsHigh: number | null;
  revenueAvg: number | null;
  asOf: string;
}

export interface MetricInputs {
  /** Annual periods, any order; the latest is used as "current". */
  annuals: AnnualPeriod[];
  price: number | null;
  priceAsOf: string | null;
  /** Provider market cap (quote); falls back to price × diluted shares. */
  marketCap: number | null;
  closes: Close[]; // ascending or not; sorted internally
  benchmarkCloses: Close[]; // SPY
  estimate?: EstimateInput | null;
  targetMean?: number | null;
  targetAsOf?: string | null;
  /** Precomputed momentum metrics (job path); when given, closes are not used for momentum. */
  momentum?: MetricMap;
  /** Close at each annual period end (job path); when given, closes are not used for valuation history. */
  fyEndCloses?: Record<string, number | null>;
}

export interface MetricValue {
  value: number | null;
  asOf: string | null;
  /** Prior values (oldest → newest, excluding current) for own-history comparison. */
  history?: number[];
  dataKind: "calculated" | "estimate";
}

export type MetricMap = Record<string, MetricValue>;

const finite = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const g = (items: LineItems, k: keyof LineItems): number | null => {
  const v = items[k];
  return finite(v) ? v : null;
};
const div = (a: number | null, b: number | null): number | null => (finite(a) && finite(b) && b !== 0 ? a / b : null);
const posDiv = (a: number | null, b: number | null): number | null => (finite(a) && finite(b) && b > 0 ? a / b : null);

function sortedAnnuals(a: AnnualPeriod[]): AnnualPeriod[] {
  return [...a].sort((x, y) => (x.periodEnd < y.periodEnd ? -1 : 1));
}

function cash(p: AnnualPeriod): number | null {
  return g(p.balance, "cash_and_short_term_investments") ?? g(p.balance, "cash_and_equivalents");
}
function totalDebt(p: AnnualPeriod): number | null {
  const td = g(p.balance, "total_debt");
  if (td !== null) return td;
  const s = g(p.balance, "short_term_debt");
  const l = g(p.balance, "long_term_debt");
  return s === null && l === null ? null : (s ?? 0) + (l ?? 0);
}
function fcf(p: AnnualPeriod): number | null {
  const f = g(p.cash, "free_cash_flow");
  if (f !== null) return f;
  const ocf = g(p.cash, "operating_cash_flow");
  const capex = g(p.cash, "capital_expenditure");
  // capex is reported negative by most providers
  return ocf !== null && capex !== null ? ocf - Math.abs(capex) : null;
}
function ebitda(p: AnnualPeriod): number | null {
  const e = g(p.income, "ebitda");
  if (e !== null) return e;
  const oi = g(p.income, "operating_income");
  const da = g(p.income, "depreciation_and_amortization") ?? g(p.cash, "depreciation_and_amortization");
  return oi !== null && da !== null ? oi + da : null;
}
function eps(p: AnnualPeriod): number | null {
  return g(p.income, "eps_diluted") ?? g(p.income, "eps_basic");
}
function taxRate(p: AnnualPeriod): number {
  const r = div(g(p.income, "income_tax_expense"), g(p.income, "pretax_income"));
  return r !== null && r >= 0 && r <= 0.5 ? r : 0.21;
}
function investedCapital(p: AnnualPeriod): number | null {
  const eq = g(p.balance, "total_equity");
  const debt = totalDebt(p);
  const c = cash(p) ?? 0;
  if (eq === null || debt === null) return null;
  return eq + debt - c;
}

export function roic(cur: AnnualPeriod, prev: AnnualPeriod | null): number | null {
  const oi = g(cur.income, "operating_income");
  if (oi === null) return null;
  const nopat = oi * (1 - taxRate(cur));
  const icCur = investedCapital(cur);
  const icPrev = prev ? investedCapital(prev) : null;
  const ic = icCur !== null && icPrev !== null ? (icCur + icPrev) / 2 : icCur;
  return posDiv(nopat, ic);
}

export function roe(cur: AnnualPeriod, prev: AnnualPeriod | null): number | null {
  const ni = g(cur.income, "net_income");
  const eCur = g(cur.balance, "total_equity");
  const ePrev = prev ? g(prev.balance, "total_equity") : null;
  const eq = eCur !== null && ePrev !== null ? (eCur + ePrev) / 2 : eCur;
  return posDiv(ni, eq);
}

const margin = (p: AnnualPeriod, num: number | null) => posDiv(num, g(p.income, "revenue"));
export const grossMargin = (p: AnnualPeriod) => {
  const gp = g(p.income, "gross_profit");
  const rev = g(p.income, "revenue");
  const cor = g(p.income, "cost_of_revenue");
  // Financials often report no cost of revenue; gross margin is undefined there, not 100%.
  if (gp === null || (cor === null && rev !== null && gp === rev)) return null;
  return margin(p, gp);
};
export const operatingMargin = (p: AnnualPeriod) => margin(p, g(p.income, "operating_income"));
export const fcfMargin = (p: AnnualPeriod) => margin(p, fcf(p));

export function cagr(start: number | null, end: number | null, years: number): number | null {
  if (!finite(start) || !finite(end) || start <= 0 || end <= 0 || years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

export function growth(prev: number | null, cur: number | null): number | null {
  if (!finite(prev) || !finite(cur) || prev <= 0) return null;
  return cur / prev - 1;
}

export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Last close on or before `date` (closes sorted ascending). */
export function closeOnOrBefore(closes: Close[], date: string): Close | null {
  let lo = 0;
  let hi = closes.length - 1;
  let ans: Close | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (closes[mid].date <= date) {
      ans = closes[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

function shiftDate(date: string, months: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Return between the closes on/before two dates; null if the start is missing or too far from the target date. */
export function windowReturn(closes: Close[], fromDate: string, toDate: string): number | null {
  const a = closeOnOrBefore(closes, fromDate);
  const b = closeOnOrBefore(closes, toDate);
  if (!a || !b || a.close <= 0) return null;
  // the series must actually cover the start (allow a week for holidays)
  if (Date.parse(fromDate) - Date.parse(a.date) > 7 * 86_400_000) return null;
  return b.close / a.close - 1;
}

export function computeMomentum(closesIn: Close[], benchIn: Close[]): MetricMap {
  const closes = [...closesIn].filter((c) => finite(c.close) && c.close > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  const bench = [...benchIn].filter((c) => finite(c.close) && c.close > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = closes.at(-1);
  const out: MetricMap = {};
  const put = (k: string, v: number | null) => (out[k] = { value: v, asOf: last?.date ?? null, dataKind: "calculated" });
  if (!last) {
    for (const k of ["ret_12_1", "ret_6m", "price_vs_200dma", "rs_vs_spy_6m"]) put(k, null);
    return out;
  }
  const t = last.date;
  put("ret_12_1", windowReturn(closes, shiftDate(t, -12), shiftDate(t, -1)));
  const r6 = windowReturn(closes, shiftDate(t, -6), t);
  put("ret_6m", r6);
  const tail = closes.slice(-200);
  put("price_vs_200dma", tail.length >= 200 ? last.close / (tail.reduce((a, c) => a + c.close, 0) / tail.length) - 1 : null);
  const b6 = windowReturn(bench, shiftDate(t, -6), t);
  put("rs_vs_spy_6m", r6 !== null && b6 !== null ? r6 - b6 : null);
  return out;
}

/** Price points from the database (research_momentum_inputs). */
export interface MomentumPoints {
  lastDate: string | null;
  lastClose: number | null;
  d1m: string | null;
  close1m: number | null;
  d6m: string | null;
  close6m: number | null;
  d12m: string | null;
  close12m: number | null;
  avg200: number | null;
  n200: number | null;
}

const MAX_GAP_DAYS = 10;
const covers = (target: string | null, actual: string | null, months: number) => {
  if (!target || !actual) return false;
  const want = new Date(target + "T00:00:00Z");
  want.setUTCMonth(want.getUTCMonth() - months);
  return (want.getTime() - Date.parse(actual + "T00:00:00Z")) / 86_400_000 <= MAX_GAP_DAYS;
};

/** Same definitions as computeMomentum, from pre-aggregated price points. */
export function momentumFromPoints(p: MomentumPoints, spy: MomentumPoints | null): MetricMap {
  const ok = (v: number | null): v is number => finite(v) && v > 0;
  const r = (a: number | null, b: number | null) => (ok(a) && ok(b) ? b / a - 1 : null);
  const r121 = covers(p.lastDate, p.d12m, 12) ? r(p.close12m, p.close1m) : null;
  const r6 = covers(p.lastDate, p.d6m, 6) ? r(p.close6m, p.lastClose) : null;
  const b6 = spy && covers(spy.lastDate, spy.d6m, 6) ? r(spy.close6m, spy.lastClose) : null;
  const dma = (p.n200 ?? 0) >= 200 && ok(p.avg200) && ok(p.lastClose) ? p.lastClose / p.avg200 - 1 : null;
  const v = (value: number | null): MetricValue => ({ value, asOf: p.lastDate, dataKind: "calculated" });
  return { ret_12_1: v(r121), ret_6m: v(r6), price_vs_200dma: v(dma), rs_vs_spy_6m: v(r6 !== null && b6 !== null ? r6 - b6 : null) };
}

/** Compute every single-company metric. Missing inputs → value null. */
export function computeCompanyMetrics(inp: MetricInputs): MetricMap {
  const ann = sortedAnnuals(inp.annuals);
  const out: MetricMap = {};
  const cur = ann.at(-1) ?? null;
  const fyAsOf = cur?.periodEnd ?? null;
  const put = (k: string, v: number | null, history?: (number | null)[], asOf: string | null = fyAsOf, dataKind: MetricValue["dataKind"] = "calculated") => {
    const h = history?.filter(finite);
    out[k] = { value: finite(v) ? v : null, asOf, dataKind, ...(h && h.length ? { history: h } : {}) };
  };
  const series = <T>(fn: (p: AnnualPeriod, i: number) => T) => ann.map((p, i) => fn(p, i));
  const hist = (vals: (number | null)[]) => vals.slice(0, -1);

  // ── Quality ───────────────────────────────────────────────
  const roicS = series((p, i) => roic(p, i > 0 ? ann[i - 1] : null));
  const roeS = series((p, i) => roe(p, i > 0 ? ann[i - 1] : null));
  const gmS = series(grossMargin);
  const omS = series(operatingMargin);
  const fmS = series(fcfMargin);
  put("roic", roicS.at(-1) ?? null, hist(roicS));
  put("roe", roeS.at(-1) ?? null, hist(roeS));
  put("gross_margin", gmS.at(-1) ?? null, hist(gmS));
  put("operating_margin", omS.at(-1) ?? null, hist(omS));
  put("fcf_margin", fmS.at(-1) ?? null, hist(fmS));

  const last5 = ann.slice(-5);
  if (last5.length >= 3) {
    let good = 0;
    let n = 0;
    last5.forEach((p, i) => {
      const ni = g(p.income, "net_income");
      if (ni === null) return;
      n++;
      const prior = i > 0 ? eps(last5[i - 1]) : null;
      const e = eps(p);
      const nonDeclining = prior === null || e === null ? true : e >= prior;
      if (ni > 0 && nonDeclining) good++;
    });
    put("earnings_consistency", n >= 3 ? good / n : null);
  } else put("earnings_consistency", null);

  // ── Growth ────────────────────────────────────────────────
  const rev = series((p) => g(p.income, "revenue"));
  const revCur = rev.at(-1) ?? null;
  const revPrev = rev.at(-2) ?? null;
  const rev3 = rev.length >= 4 ? rev.at(-4)! : null;
  put("revenue_cagr_3y", cagr(rev3, revCur, 3));
  const gYoy = growth(revPrev, revCur);
  put("revenue_growth_yoy", gYoy);
  const epsS = series(eps);
  put("eps_growth_yoy", growth(epsS.at(-2) ?? null, epsS.at(-1) ?? null));
  const fcfS = series(fcf);
  put("fcf_cagr_3y", fcfS.length >= 4 ? cagr(fcfS.at(-4)!, fcfS.at(-1)!, 3) : null);
  const gPrior = rev.length >= 3 ? growth(rev.at(-3)!, revPrev) : null;
  put("growth_acceleration", gYoy !== null && gPrior !== null ? gYoy - gPrior : null);

  // ── Valuation (current price; history at each fiscal year-end) ──
  const closes = [...inp.closes].filter((c) => finite(c.close) && c.close > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
  const shares = (p: AnnualPeriod) => g(p.income, "shares_diluted") ?? g(p.income, "shares_basic");
  const mcapAt = (p: AnnualPeriod, px: number | null) => {
    const s = shares(p);
    return finite(px) && s !== null && s > 0 ? px * s : null;
  };
  const curMcap = cur ? (finite(inp.marketCap) && inp.marketCap > 0 ? inp.marketCap : mcapAt(cur, inp.price)) : null;
  const ev = (p: AnnualPeriod, mc: number | null) => {
    const d = totalDebt(p);
    const c = cash(p);
    return mc !== null && d !== null ? mc + d - (c ?? 0) : null;
  };
  const valuationAt = (p: AnnualPeriod, mc: number | null) => {
    const ni = g(p.income, "net_income");
    const e = ebitda(p);
    const f = fcf(p);
    const r = g(p.income, "revenue");
    const evv = ev(p, mc);
    return {
      pe: ni !== null && ni > 0 ? div(mc, ni) : null,
      ev_ebitda: e !== null && e > 0 ? div(evv, e) : null,
      fcf_yield: posDiv(f, mc),
      ev_sales: r !== null && r > 0 ? div(evv, r) : null,
    };
  };
  const fyClose = (p: AnnualPeriod) => (inp.fyEndCloses ? (inp.fyEndCloses[p.periodEnd] ?? null) : (closeOnOrBefore(closes, p.periodEnd)?.close ?? null));
  const valHist = ann.slice(0, -1).map((p) => valuationAt(p, mcapAt(p, fyClose(p))));
  const vNow = cur ? valuationAt(cur, curMcap) : { pe: null, ev_ebitda: null, fcf_yield: null, ev_sales: null };
  const pAsOf = inp.priceAsOf ?? fyAsOf;
  put("pe_ttm", vNow.pe, valHist.map((v) => v.pe), pAsOf);
  put("ev_ebitda", vNow.ev_ebitda, valHist.map((v) => v.ev_ebitda), pAsOf);
  put("fcf_yield", vNow.fcf_yield, valHist.map((v) => v.fcf_yield), pAsOf);
  put("ev_sales", vNow.ev_sales, valHist.map((v) => v.ev_sales), pAsOf);
  const epsCagr = epsS.length >= 4 ? cagr(epsS.at(-4)!, epsS.at(-1)!, 3) : null;
  put("peg", vNow.pe !== null && epsCagr !== null && epsCagr > 0 ? vNow.pe / (epsCagr * 100) : null, undefined, pAsOf);

  // ── Forward expectations (estimates, when the plan provides them) ──
  const est = inp.estimate ?? null;
  const epsCur = epsS.at(-1) ?? null;
  if (est && cur && est.fiscalPeriodEnd > cur.periodEnd) {
    put("eps_growth_fy1_est", growth(epsCur, est.epsAvg), undefined, est.asOf, "estimate");
    put("revenue_growth_fy1_est", growth(revCur, est.revenueAvg), undefined, est.asOf, "estimate");
    const disp = finite(est.epsHigh) && finite(est.epsLow) && finite(est.epsAvg) && est.epsAvg !== 0 ? (est.epsHigh - est.epsLow) / Math.abs(est.epsAvg) : null;
    put("estimate_dispersion", disp, undefined, est.asOf, "estimate");
  } else {
    for (const k of ["eps_growth_fy1_est", "revenue_growth_fy1_est", "estimate_dispersion"]) put(k, null, undefined, null, "estimate");
  }
  put("target_upside", finite(inp.targetMean) && finite(inp.price) && inp.price > 0 ? inp.targetMean / inp.price - 1 : null, undefined, inp.targetAsOf ?? null, "estimate");

  // ── Momentum ──────────────────────────────────────────────
  Object.assign(out, inp.momentum ?? computeMomentum(closes, inp.benchmarkCloses));

  // ── Balance sheet ─────────────────────────────────────────
  if (cur) {
    const d = totalDebt(cur);
    const c = cash(cur);
    const e = ebitda(cur);
    put("net_debt_to_ebitda", d !== null && e !== null && e > 0 ? (d - (c ?? 0)) / e : null);
    const oi = g(cur.income, "operating_income");
    const ie = g(cur.income, "interest_expense");
    put("interest_coverage", oi === null ? null : ie === null ? null : Math.abs(ie) === 0 ? (oi > 0 ? 100 : null) : Math.min(100, oi / Math.abs(ie)));
    put("current_ratio", posDiv(g(cur.balance, "total_current_assets"), g(cur.balance, "total_current_liabilities")));
    put("cash_to_debt", c === null || d === null ? null : d === 0 ? (c > 0 ? 10 : null) : Math.min(10, c / d));
  } else {
    for (const k of ["net_debt_to_ebitda", "interest_coverage", "current_ratio", "cash_to_debt"]) put(k, null);
  }

  // ── Competitive (single-company part) ─────────────────────
  const gm5 = gmS.slice(-5).filter(finite);
  put("gross_margin_stability", gm5.length >= 3 ? stdev(gm5) : null);

  return out;
}

/** Inputs the DNA hard-constraint check needs, derived from the same data. */
export function fitInputs(inp: MetricInputs): { marketCap: number | null; netIncome: number | null } {
  const cur = sortedAnnuals(inp.annuals).at(-1);
  const s = cur ? (g(cur.income, "shares_diluted") ?? g(cur.income, "shares_basic")) : null;
  const mc = finite(inp.marketCap) && inp.marketCap > 0 ? inp.marketCap : finite(inp.price) && s ? inp.price * s : null;
  return { marketCap: mc, netIncome: cur ? g(cur.income, "net_income") : null };
}
