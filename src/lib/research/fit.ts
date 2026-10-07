/**
 * Personal fit (docs/SCORING.md §5): Investment DNA hard constraints → pass/fail
 * with the failing rule listed, and soft preferences → bounded category multipliers.
 */
import type { Category } from "./definitions";
import type { MetricMap } from "./metrics";

/** Subset of `investment_profiles` used by research (decimal fractions, USD). */
export interface DnaProfile {
  excluded_sectors: string[];
  preferred_sectors: string[];
  market_cap_min: number | null;
  market_cap_max: number | null;
  max_net_debt_to_ebitda: number | null;
  min_roic: number | null;
  min_revenue_growth: number | null;
  min_eps_growth: number | null;
  min_fcf_growth: number | null;
  require_profitability: boolean;
  valuation_ranges: Record<string, { max?: number; min?: number }>;
  quality_requirements: Record<string, { max?: number; min?: number }>;
  growth_value_tilt: number | null;
  momentum_preference: number | null;
  dividend_preference: number | null;
  risk_tolerance: number | null;
  horizon_years: number | null;
  max_position_weight: number | null;
  max_sector_weight: number | null;
  preferred_position_weight: number | null;
  cash_target_weight: number | null;
  max_speculative_weight: number | null;
}

export interface FitCheck {
  rule: string;
  status: "fail" | "unknown";
  detail: string;
}

export interface FitResult {
  pass: boolean;
  checks: FitCheck[]; // failures and unverifiable rules only
}

const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtX = (v: number) => `${v.toFixed(1)}×`;
const fmtB = (v: number) => `$${(v / 1e9).toFixed(1)}B`;

export function checkFit(
  dna: DnaProfile | null,
  c: { sector: string | null; marketCap: number | null; netIncome: number | null; metrics: MetricMap },
): FitResult {
  if (!dna) return { pass: true, checks: [] };
  const checks: FitCheck[] = [];
  const m = (k: string) => c.metrics[k]?.value ?? null;
  const fail = (rule: string, detail: string) => checks.push({ rule, status: "fail", detail });
  const unknown = (rule: string, what: string) => checks.push({ rule, status: "unknown", detail: `Couldn't verify: ${what} is unavailable` });

  if (dna.excluded_sectors?.length && c.sector && dna.excluded_sectors.includes(c.sector)) {
    fail("excluded_sector", `${c.sector} is an excluded sector in your Investment DNA`);
  }
  const minMax = (rule: string, label: string, v: number | null, min: number | null | undefined, max: number | null | undefined, fmt: (n: number) => string) => {
    if (min == null && max == null) return;
    if (v === null) return unknown(rule, label);
    if (min != null && v < min) fail(rule, `${label} ${fmt(v)} is below your minimum ${fmt(min)}`);
    if (max != null && v > max) fail(rule, `${label} ${fmt(v)} is above your maximum ${fmt(max)}`);
  };
  minMax("market_cap", "Market cap", c.marketCap, dna.market_cap_min, dna.market_cap_max, fmtB);
  minMax("max_net_debt_to_ebitda", "Net debt / EBITDA", m("net_debt_to_ebitda"), null, dna.max_net_debt_to_ebitda, fmtX);
  minMax("min_roic", "ROIC", m("roic"), dna.min_roic, null, fmtPct);
  minMax("min_revenue_growth", "Revenue growth (3-yr CAGR)", m("revenue_cagr_3y") ?? m("revenue_growth_yoy"), dna.min_revenue_growth, null, fmtPct);
  minMax("min_eps_growth", "EPS growth (latest FY)", m("eps_growth_yoy"), dna.min_eps_growth, null, fmtPct);
  minMax("min_fcf_growth", "FCF growth (3-yr CAGR)", m("fcf_cagr_3y"), dna.min_fcf_growth, null, fmtPct);
  if (dna.require_profitability) {
    if (c.netIncome === null) unknown("require_profitability", "net income");
    else if (c.netIncome <= 0) fail("require_profitability", "Not profitable in the latest fiscal year (your DNA requires profitability)");
  }
  const vr = dna.valuation_ranges ?? {};
  if (vr.pe_forward?.max != null) {
    // forward P/E needs analyst estimates; the trailing P/E is the closest available measure
    const pe = m("pe_ttm");
    if (pe === null) unknown("max_pe", "P/E");
    else if (pe > vr.pe_forward.max) fail("max_pe", `P/E (trailing — forward estimates unavailable) ${fmtX(pe)} is above your maximum ${fmtX(vr.pe_forward.max)}`);
  }
  if (vr.ev_ebitda?.max != null) minMax("max_ev_ebitda", "EV / EBITDA", m("ev_ebitda"), null, vr.ev_ebitda.max, fmtX);
  if (vr.p_fcf?.max != null) {
    const y = m("fcf_yield");
    minMax("max_p_fcf", "Price / FCF", y !== null && y > 0 ? 1 / y : null, null, vr.p_fcf.max, fmtX);
  }
  const qr = dna.quality_requirements ?? {};
  if (qr.gross_margin?.min != null) minMax("min_gross_margin", "Gross margin", m("gross_margin"), qr.gross_margin.min, null, fmtPct);
  if (qr.fcf_margin?.min != null) minMax("min_fcf_margin", "FCF margin", m("fcf_margin"), qr.fcf_margin.min, null, fmtPct);

  return { pass: !checks.some((x) => x.status === "fail"), checks };
}

/** Soft preferences → category weight multipliers, bounded to ±30%. */
export function personalMultipliers(dna: DnaProfile | null): Partial<Record<Category, number>> {
  if (!dna) return {};
  const clamp = (v: number) => Math.min(1.3, Math.max(0.7, v));
  const out: Partial<Record<Category, number>> = {};
  const t = dna.growth_value_tilt;
  if (t != null) {
    out.growth = clamp(1 + 0.06 * t);
    out.forward = clamp(1 + 0.04 * t);
    out.valuation = clamp(1 - 0.06 * t);
  }
  const p = dna.momentum_preference;
  if (p != null) out.momentum = clamp(0.7 + 0.12 * p);
  return out;
}
