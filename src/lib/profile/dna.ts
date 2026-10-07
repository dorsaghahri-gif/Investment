/**
 * Investment DNA — the user's investment philosophy as structured, versioned
 * criteria. Form values are entered in human units (%, $B, ×) and stored in
 * canonical units (decimal fractions, dollars). Pure + unit-tested.
 */
import { z } from "zod";

export const SECTORS = [
  "Technology",
  "Communication Services",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Healthcare",
  "Financial Services",
  "Industrials",
  "Energy",
  "Basic Materials",
  "Utilities",
  "Real Estate",
] as const;

const blankToNull = (v: unknown) => (v === "" || v === undefined || v === null ? null : v);
const pct = (min: number, max: number) =>
  z.preprocess(blankToNull, z.coerce.number().min(min).max(max).nullable()).transform((v) => (v === null ? null : v / 100));
const num = (min: number, max: number) => z.preprocess(blankToNull, z.coerce.number().min(min).max(max).nullable());
const int = (min: number, max: number) => z.preprocess(blankToNull, z.coerce.number().int().min(min).max(max).nullable());
const billions = z.preprocess(blankToNull, z.coerce.number().min(0).max(100_000).nullable()).transform((v) => (v === null ? null : v * 1e9));
const sectorList = z.array(z.enum(SECTORS)).default([]);

/** Form → canonical (what is stored). */
export const dnaFormSchema = z
  .object({
    horizonYears: int(0, 80),
    riskTolerance: int(1, 10),
    targetReturn: pct(-50, 100),
    maxDrawdown: pct(0, 100),
    marketCapMin: billions,
    marketCapMax: billions,
    preferredSectors: sectorList,
    excludedSectors: sectorList,
    growthValueTilt: int(-5, 5),
    dividendPreference: int(0, 5),
    momentumPreference: int(0, 5),
    minRevenueGrowth: pct(-100, 500),
    minEpsGrowth: pct(-100, 500),
    minFcfGrowth: pct(-100, 500),
    minRoic: pct(-100, 200),
    maxNetDebtToEbitda: num(-50, 50),
    maxForwardPe: num(0, 1000),
    maxEvToEbitda: num(0, 1000),
    maxPriceToFcf: num(0, 1000),
    minGrossMargin: pct(-100, 100),
    minFcfMargin: pct(-100, 100),
    requireProfitability: z.preprocess((v) => v === "on" || v === true || v === "true", z.boolean()),
    maxPositionWeight: pct(0, 100),
    maxSectorWeight: pct(0, 100),
    preferredPositionWeight: pct(0, 100),
    cashTargetWeight: pct(0, 100),
    maxSpeculativeWeight: pct(0, 100),
    freeformInstructions: z.preprocess(blankToNull, z.string().trim().max(4000).nullable()),
  })
  .superRefine((v, ctx) => {
    const overlap = v.preferredSectors.filter((s) => v.excludedSectors.includes(s));
    if (overlap.length) ctx.addIssue({ code: "custom", path: ["excludedSectors"], message: `A sector can't be both preferred and excluded: ${overlap.join(", ")}` });
    if (v.marketCapMin !== null && v.marketCapMax !== null && v.marketCapMin > v.marketCapMax)
      ctx.addIssue({ code: "custom", path: ["marketCapMax"], message: "Maximum market cap must be ≥ minimum" });
    if (v.maxPositionWeight !== null && v.maxSectorWeight !== null && v.maxPositionWeight > v.maxSectorWeight)
      ctx.addIssue({ code: "custom", path: ["maxPositionWeight"], message: "Max single position can't exceed max sector weight" });
    if (v.preferredPositionWeight !== null && v.maxPositionWeight !== null && v.preferredPositionWeight > v.maxPositionWeight)
      ctx.addIssue({ code: "custom", path: ["preferredPositionWeight"], message: "Preferred position size can't exceed the maximum position size" });
  });

export type DnaForm = z.infer<typeof dnaFormSchema>;

/** Canonical form → database row columns. */
export function toProfileRow(v: DnaForm) {
  const valuation: Record<string, { max: number }> = {};
  if (v.maxForwardPe !== null) valuation.pe_forward = { max: v.maxForwardPe };
  if (v.maxEvToEbitda !== null) valuation.ev_ebitda = { max: v.maxEvToEbitda };
  if (v.maxPriceToFcf !== null) valuation.p_fcf = { max: v.maxPriceToFcf };
  const quality: Record<string, { min: number }> = {};
  if (v.minGrossMargin !== null) quality.gross_margin = { min: v.minGrossMargin };
  if (v.minFcfMargin !== null) quality.fcf_margin = { min: v.minFcfMargin };
  return {
    horizon_years: v.horizonYears,
    risk_tolerance: v.riskTolerance,
    target_return: v.targetReturn,
    max_drawdown: v.maxDrawdown,
    market_cap_min: v.marketCapMin,
    market_cap_max: v.marketCapMax,
    preferred_sectors: v.preferredSectors,
    excluded_sectors: v.excludedSectors,
    growth_value_tilt: v.growthValueTilt,
    dividend_preference: v.dividendPreference,
    momentum_preference: v.momentumPreference,
    min_revenue_growth: v.minRevenueGrowth,
    min_eps_growth: v.minEpsGrowth,
    min_fcf_growth: v.minFcfGrowth,
    min_roic: v.minRoic,
    max_net_debt_to_ebitda: v.maxNetDebtToEbitda,
    valuation_ranges: valuation,
    quality_requirements: quality,
    require_profitability: v.requireProfitability,
    max_position_weight: v.maxPositionWeight,
    max_sector_weight: v.maxSectorWeight,
    preferred_position_weight: v.preferredPositionWeight,
    cash_target_weight: v.cashTargetWeight,
    max_speculative_weight: v.maxSpeculativeWeight,
    freeform_instructions: v.freeformInstructions,
  };
}

export type ProfileRow = ReturnType<typeof toProfileRow> & { version?: number; updated_at?: string };

/** Database row → form default values (human units, strings). */
export function toFormDefaults(row: Partial<ProfileRow> | null): Record<string, string | boolean | string[]> {
  const p = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(+(Number(v) * 100).toFixed(4)));
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(Number(v)));
  const b = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(+(Number(v) / 1e9).toFixed(4)));
  const val = (row?.valuation_ranges ?? {}) as Record<string, { max?: number }>;
  const q = (row?.quality_requirements ?? {}) as Record<string, { min?: number }>;
  return {
    horizonYears: n(row?.horizon_years),
    riskTolerance: n(row?.risk_tolerance),
    targetReturn: p(row?.target_return),
    maxDrawdown: p(row?.max_drawdown),
    marketCapMin: b(row?.market_cap_min),
    marketCapMax: b(row?.market_cap_max),
    preferredSectors: (row?.preferred_sectors as string[]) ?? [],
    excludedSectors: (row?.excluded_sectors as string[]) ?? [],
    growthValueTilt: n(row?.growth_value_tilt),
    dividendPreference: n(row?.dividend_preference),
    momentumPreference: n(row?.momentum_preference),
    minRevenueGrowth: p(row?.min_revenue_growth),
    minEpsGrowth: p(row?.min_eps_growth),
    minFcfGrowth: p(row?.min_fcf_growth),
    minRoic: p(row?.min_roic),
    maxNetDebtToEbitda: n(row?.max_net_debt_to_ebitda),
    maxForwardPe: n(val.pe_forward?.max),
    maxEvToEbitda: n(val.ev_ebitda?.max),
    maxPriceToFcf: n(val.p_fcf?.max),
    minGrossMargin: p(q.gross_margin?.min),
    minFcfMargin: p(q.fcf_margin?.min),
    requireProfitability: !!row?.require_profitability,
    maxPositionWeight: p(row?.max_position_weight),
    maxSectorWeight: p(row?.max_sector_weight),
    preferredPositionWeight: p(row?.preferred_position_weight),
    cashTargetWeight: p(row?.cash_target_weight),
    maxSpeculativeWeight: p(row?.max_speculative_weight),
    freeformInstructions: (row?.freeform_instructions as string) ?? "",
  };
}

/** FormData → plain object for the schema (multi-value sector checkboxes). */
export function formDataToDnaInput(fd: FormData): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k === "preferredSectors" || k === "excludedSectors") {
      const list = (o[k] as string[] | undefined) ?? [];
      list.push(String(v));
      o[k] = list;
    } else o[k] = v;
  }
  return o;
}
