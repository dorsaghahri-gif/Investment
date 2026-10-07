import { describe, expect, it } from "vitest";
import { computeCompanyMetrics, computeMomentum, cagr, roic, type AnnualPeriod, type Close, type MetricMap } from "./metrics";
import { scoreUniverse, percentileRank, normCdf, ownHistoryZ, marketValueAtScore, type ScoreInput } from "./scoring";
import { checkFit, personalMultipliers, type DnaProfile } from "./fit";
import { recommend, ratingLabel, type RecInput } from "./recommend";
import { coreShareFor, planContribution, type PlanHolding, type PlanSecurity } from "./planner";
import { classify } from "./funds";
import { MODEL_VERSION } from "./definitions";

const period = (year: number, o: { rev: number; gp?: number; oi: number; ni: number; eps: number; eq: number; debt: number; cash: number; fcf: number; shares?: number }): AnnualPeriod => ({
  periodEnd: `${year}-12-31`,
  fiscalYear: year,
  income: {
    revenue: o.rev, gross_profit: o.gp ?? o.rev * 0.5, cost_of_revenue: o.rev - (o.gp ?? o.rev * 0.5), operating_income: o.oi, net_income: o.ni,
    pretax_income: o.ni / 0.79, income_tax_expense: (o.ni / 0.79) * 0.21, eps_diluted: o.eps, shares_diluted: o.shares ?? 100,
    ebitda: o.oi * 1.2, interest_expense: 5,
  },
  balance: { total_equity: o.eq, total_debt: o.debt, cash_and_short_term_investments: o.cash, total_current_assets: 300, total_current_liabilities: 150 },
  cash: { free_cash_flow: o.fcf, operating_cash_flow: o.fcf + 20, capital_expenditure: -20 },
});

const growingCo = [2021, 2022, 2023, 2024, 2025].map((y, i) =>
  period(y, { rev: 1000 * 1.1 ** i, oi: 200 * 1.12 ** i, ni: 150 * 1.12 ** i, eps: 1.5 * 1.12 ** i, eq: 800, debt: 200, cash: 100, fcf: 160 * 1.1 ** i }),
);

function closesFrom(start: string, days: number, f: (i: number) => number): Close[] {
  const out: Close[] = [];
  const d = new Date(start + "T00:00:00Z");
  for (let i = 0; i < days; i++) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push({ date: d.toISOString().slice(0, 10), close: f(out.length) });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

describe("metrics", () => {
  it("computes CAGR and refuses non-positive endpoints", () => {
    expect(cagr(100, 133.1, 3)).toBeCloseTo(0.1, 6);
    expect(cagr(-5, 10, 3)).toBeNull();
    expect(cagr(10, 0, 3)).toBeNull();
  });

  it("computes ROIC on average invested capital with the effective tax rate", () => {
    const [a, b] = growingCo.slice(-2);
    const v = roic(b, a)!;
    // NOPAT = OI × (1 − 21%); IC = 800 + 200 − 100 = 900 both years
    expect(v).toBeCloseTo((b.income.operating_income! * 0.79) / 900, 6);
  });

  it("produces growth, quality, valuation and balance-sheet metrics; nulls when undefined", () => {
    const closes = closesFrom("2024-09-01", 420, (i) => 30 + i * 0.05);
    const m = computeCompanyMetrics({ annuals: growingCo, price: 50, priceAsOf: "2025-10-20", marketCap: null, closes, benchmarkCloses: closes });
    expect(m.revenue_cagr_3y.value).toBeCloseTo(0.1, 6);
    expect(m.revenue_growth_yoy.value).toBeCloseTo(0.1, 6);
    expect(m.gross_margin.value).toBeCloseTo(0.5, 6);
    expect(m.gross_margin.history).toHaveLength(4);
    expect(m.pe_ttm.value).toBeCloseTo((50 * 100) / growingCo[4].income.net_income!, 6);
    expect(m.net_debt_to_ebitda.value).toBeCloseTo(100 / (growingCo[4].income.operating_income! * 1.2), 6);
    expect(m.earnings_consistency.value).toBe(1);
    // no estimates in the data plan → forward metrics missing, never zero
    expect(m.eps_growth_fy1_est.value).toBeNull();
    expect(m.target_upside.value).toBeNull();
  });

  it("treats a P/E on negative earnings as unavailable, not cheap", () => {
    const loss = growingCo.map((p) => ({ ...p, income: { ...p.income, net_income: -10, eps_diluted: -0.1 } }));
    const m = computeCompanyMetrics({ annuals: loss, price: 50, priceAsOf: "2025-10-20", marketCap: 5000, closes: [], benchmarkCloses: [] });
    expect(m.pe_ttm.value).toBeNull();
    expect(m.eps_growth_yoy.value).toBeNull();
    // equity is still positive, so a negative ROE is a real (bad) value
    expect(m.roe.value!).toBeLessThan(0);
  });

  it("does not report a 100% gross margin for companies without cost of revenue", () => {
    const bank = growingCo.map((p) => ({ ...p, income: { ...p.income, gross_profit: p.income.revenue, cost_of_revenue: undefined } }));
    const m = computeCompanyMetrics({ annuals: bank, price: 50, priceAsOf: null, marketCap: null, closes: [], benchmarkCloses: [] });
    expect(m.gross_margin.value).toBeNull();
  });

  it("computes momentum windows and relative strength", () => {
    const up = closesFrom("2024-09-01", 420, (i) => 100 * 1.001 ** i);
    const flat = closesFrom("2024-09-01", 420, () => 100);
    const m = computeMomentum(up, flat);
    expect(m.ret_6m.value!).toBeGreaterThan(0.1);
    expect(m.rs_vs_spy_6m.value).toBeCloseTo(m.ret_6m.value!, 9);
    expect(m.price_vs_200dma.value!).toBeGreaterThan(0);
    // insufficient history → null
    expect(computeMomentum(up.slice(-100), flat).ret_12_1.value).toBeNull();
  });
});

// ── Scoring ─────────────────────────────────────────────────────────

function mm(values: Record<string, number | null>, asOf = "2026-10-01"): MetricMap {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v, asOf, dataKind: "calculated" as const }]));
}

function universe(n: number): ScoreInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `id${i}`,
    symbol: `S${String(i).padStart(2, "0")}`,
    sector: i % 2 ? "Technology" : "Healthcare",
    industry: i % 2 ? "Software" : "Biotech",
    metrics: mm({
      roic: 0.05 + i * 0.01, roe: 0.1 + i * 0.01, gross_margin: 0.3 + i * 0.02, operating_margin: 0.1 + i * 0.01, fcf_margin: 0.05 + i * 0.01, earnings_consistency: (i % 5) / 4,
      revenue_cagr_3y: 0.02 * i, revenue_growth_yoy: 0.03 * i, eps_growth_yoy: 0.02 * i, fcf_cagr_3y: 0.01 * i, growth_acceleration: 0.001 * i,
      pe_ttm: 40 - i, ev_ebitda: 30 - i * 0.5, fcf_yield: 0.01 + i * 0.002, ev_sales: 10 - i * 0.2, peg: 3 - i * 0.05,
      ret_12_1: -0.1 + i * 0.02, ret_6m: -0.05 + i * 0.01, price_vs_200dma: -0.05 + i * 0.005, rs_vs_spy_6m: -0.05 + i * 0.008,
      net_debt_to_ebitda: 3 - i * 0.1, interest_coverage: 5 + i, current_ratio: 1 + i * 0.05, cash_to_debt: 0.2 + i * 0.05,
      gross_margin_stability: 0.05 - i * 0.001,
    }),
  }));
}

describe("scoring", () => {
  it("percentile rank uses mid-ranks and is direction-aware via the engine", () => {
    expect(percentileRank([1, 2, 3, 4], 1)).toBe(12.5);
    expect(percentileRank([1, 2, 2, 4], 2)).toBe(50);
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
  });

  it("own-history z needs ≥ 3 points and non-zero spread", () => {
    expect(ownHistoryZ(1, [1, 1])).toBeNull();
    expect(ownHistoryZ(1, [1, 1, 1])).toBeNull();
    expect(ownHistoryZ(4, [1, 2, 3])).toBeCloseTo(2, 9);
  });

  it("ranks better companies higher, excludes plan-missing categories and reports coverage", () => {
    const res = scoreUniverse(universe(20), { today: "2026-10-05" });
    const best = res.find((r) => r.symbol === "S19")!;
    const worst = res.find((r) => r.symbol === "S00")!;
    expect(best.overall!).toBeGreaterThan(worst.overall!);
    // lower P/E is better → the cheapest (S19) has the top valuation score
    expect(best.categories.valuation!).toBeGreaterThan(worst.categories.valuation!);
    // forward / revisions / ownership have no data → insufficient, excluded (never 0)
    expect(best.categories.forward).toBeNull();
    expect(best.categories.revisions).toBeNull();
    expect(best.categories.ownership).toBeNull();
    // coverage ≈ 70% (those three categories are 30% of the weight); competitive is partial
    expect(best.coverage).toBeGreaterThan(0.6);
    expect(best.coverage).toBeLessThan(0.71);
    expect(best.confidence).toBe("medium");
    const fwd = best.components.find((c) => c.metricKey === "eps_growth_fy1_est")!;
    expect(fwd.isMissing).toBe(true);
    expect(fwd.subScore).toBeNull();
    expect(fwd.weight).toBe(0);
  });

  it("effective weights of scored components sum to 100", () => {
    const [r] = scoreUniverse(universe(20), { today: "2026-10-05" });
    const sum = r.components.reduce((a, c) => a + c.weight, 0);
    expect(sum).toBeCloseTo(100, 2);
  });

  it("drops peer groups smaller than 8 and falls back to sector/market", () => {
    const u = universe(20);
    u[0].industry = "Tiny industry";
    const r = scoreUniverse(u, { today: "2026-10-05" }).find((x) => x.symbol === "S00")!;
    const c = r.components.find((x) => x.metricKey === "roic")!;
    expect(c.percentileIndustry).toBeNull();
    expect(c.percentileSector).not.toBeNull();
    expect(c.peerGroup).toBe("Sector: Healthcare");
  });

  it("hides the overall score below 60% coverage", () => {
    const u = universe(12).map((r) => ({ ...r, metrics: mm({ roic: r.metrics.roic.value, gross_margin: r.metrics.gross_margin.value }) }));
    const r = scoreUniverse(u, { today: "2026-10-05" })[0];
    expect(r.overall).toBeNull();
    expect(r.confidence).toBe("low");
  });

  it("personal multipliers tilt the personal score but not the universal one", () => {
    const u = universe(20);
    // a fast grower that is expensive: growth and valuation disagree
    Object.assign(u[3].metrics, mm({ revenue_cagr_3y: 0.9, revenue_growth_yoy: 0.9, eps_growth_yoy: 0.9, fcf_cagr_3y: 0.9, pe_ttm: 90, ev_ebitda: 60, fcf_yield: 0.001 }));
    const base = scoreUniverse(u, { today: "2026-10-05" });
    const tilted = scoreUniverse(u, { today: "2026-10-05", personalMultipliers: { growth: 1.3, valuation: 0.7 } });
    expect(tilted.map((r) => r.overall)).toEqual(base.map((r) => r.overall));
    expect(tilted.some((r, i) => r.personal !== base[i].personal)).toBe(true);
  });

  it("is deterministic (golden snapshot)", () => {
    const res = scoreUniverse(universe(20), { today: "2026-10-05" }).map((r) => ({ s: r.symbol, o: r.overall, cov: r.coverage, cats: r.categories }));
    expect(MODEL_VERSION).toBe("score-model v1.0");
    expect(res).toMatchSnapshot();
  });

  it("finds the market value at a target score, direction-aware", () => {
    const u = universe(20);
    const peMedian = marketValueAtScore(u, "pe_ttm", 50)!;
    expect(peMedian).toBeCloseTo(30.5, 6);
    expect(marketValueAtScore(u.slice(0, 5), "pe_ttm", 50)).toBeNull();
  });
});

// ── Fit ─────────────────────────────────────────────────────────────

const dna = (o: Partial<DnaProfile> = {}): DnaProfile => ({
  excluded_sectors: [], preferred_sectors: [], market_cap_min: null, market_cap_max: null, max_net_debt_to_ebitda: null, min_roic: null,
  min_revenue_growth: null, min_eps_growth: null, min_fcf_growth: null, require_profitability: false, valuation_ranges: {}, quality_requirements: {},
  growth_value_tilt: null, momentum_preference: null, dividend_preference: null, risk_tolerance: 6, horizon_years: 20,
  max_position_weight: 0.1, max_sector_weight: 0.3, preferred_position_weight: 0.05, cash_target_weight: null, max_speculative_weight: null, ...o,
});

describe("fit", () => {
  it("fails excluded sectors and threshold rules, and flags unverifiable rules without failing", () => {
    const r = checkFit(dna({ excluded_sectors: ["Energy"], min_roic: 0.15, max_net_debt_to_ebitda: 2 }), {
      sector: "Energy", marketCap: 1e11, netIncome: 1, metrics: mm({ roic: 0.1, net_debt_to_ebitda: null }),
    });
    expect(r.pass).toBe(false);
    expect(r.checks.map((c) => `${c.rule}:${c.status}`)).toEqual(["excluded_sector:fail", "max_net_debt_to_ebitda:unknown", "min_roic:fail"]);
  });

  it("uses trailing P/E for a max forward P/E rule and says so", () => {
    const r = checkFit(dna({ valuation_ranges: { pe_forward: { max: 25 } } }), { sector: "Technology", marketCap: 1e11, netIncome: 1, metrics: mm({ pe_ttm: 30 }) });
    expect(r.pass).toBe(false);
    expect(r.checks[0].detail).toMatch(/trailing/);
  });

  it("bounds personal multipliers to ±30%", () => {
    const m = personalMultipliers(dna({ growth_value_tilt: 5, momentum_preference: 0 }));
    expect(m.growth).toBeCloseTo(1.3);
    expect(m.valuation).toBeCloseTo(0.7);
    expect(m.momentum).toBeCloseTo(0.7);
  });
});

// ── Recommendations ─────────────────────────────────────────────────

function recInput(o: { personal: number | null; valuation: number | null; confidence?: "high" | "medium" | "low"; held?: boolean; weight?: number; sectorWeight?: number; dnaPass?: boolean; prev?: RecInput["previous"]; ago?: number | null; isFund?: boolean }): RecInput {
  return {
    score: {
      id: "x", symbol: "X", overall: o.personal, personal: o.personal, coverage: 0.7, confidence: o.confidence ?? "medium",
      categories: { quality: 60, growth: 60, valuation: o.valuation, forward: null, momentum: 60, revisions: null, balance_sheet: 60, competitive: 60, ownership: null },
      components: [],
    },
    personal30dAgo: o.ago ?? null,
    dnaPass: o.dnaPass ?? true,
    dnaFailures: [],
    ctx: { held: o.held ?? false, weight: o.weight ?? 0, sectorWeight: o.sectorWeight ?? 0.1, maxPositionWeight: 0.1, maxSectorWeight: 0.3, preferredPositionWeight: 0.05 },
    previous: o.prev ?? null,
    marketMedian: () => null,
    isFund: o.isFund,
  };
}

describe("recommendation engine", () => {
  it.each([
    [{ personal: 88, valuation: 65 }, "strong_buy"],
    [{ personal: 78, valuation: 50 }, "buy"],
    [{ personal: 78, valuation: 40 }, "watch"],
    [{ personal: 80, valuation: 70, confidence: "low" as const }, "watch"],
    [{ personal: 60, valuation: 50 }, "hold"],
    [{ personal: 40, valuation: 50 }, "avoid"],
    [{ personal: 60, valuation: 50, held: true }, "hold"],
    [{ personal: 48, valuation: 50, held: true }, "reduce"],
    [{ personal: 70, valuation: 50, held: true, weight: 0.15 }, "reduce"],
    [{ personal: 70, valuation: 50, held: true, ago: 82 }, "reduce"],
    [{ personal: 90, valuation: 90, dnaPass: false }, "avoid"],
    [{ personal: 90, valuation: 90, dnaPass: false, held: true }, "reduce"],
    [{ personal: 90, valuation: 90, sectorWeight: 0.28 }, "watch"],
    [{ personal: null, valuation: null, held: true }, "hold"],
    [{ personal: null, valuation: null, isFund: true, held: true }, "hold"],
  ])("%o → %s", (o, expected) => {
    expect(recommend(recInput(o)).rating).toBe(expected);
  });

  it("applies hysteresis: a 1-point dip below 75 keeps a previous Buy", () => {
    const r = recommend(recInput({ personal: 74, valuation: 50, prev: { rating: "buy", personal: 76 } }));
    expect(r.rating).toBe("buy");
    expect(r.rulesFired).toContain("hysteresis_hold");
    expect(recommend(recInput({ personal: 72, valuation: 50, prev: { rating: "buy", personal: 76 } })).rating).toBe("hold");
  });

  it("states upgrade triggers with the rule thresholds", () => {
    const r = recommend(recInput({ personal: 70, valuation: 40 }));
    expect(r.upgradeTriggers.map((t) => t.threshold)).toEqual(expect.arrayContaining([75, 45]));
  });

  it("labels ratings in context", () => {
    expect(ratingLabel("buy", true)).toBe("Add");
    expect(ratingLabel("hold", false)).toBe("Neutral");
    expect(ratingLabel("reduce", true)).toBe("Reduce");
  });
});

// ── Planner ─────────────────────────────────────────────────────────

const sec = (o: Partial<PlanSecurity> & { symbol: string }): PlanSecurity => ({
  name: o.symbol, price: 100, priceAsOf: "2026-10-06", bucket: "Technology", isFund: false, isBroad: false, rating: "buy", personal: 78, confidence: "medium", dnaPass: true, ...o,
});
const hold = (o: Partial<PlanHolding> & { symbol: string; value: number }): PlanHolding => ({ ...sec(o), value: o.value });

describe("planner", () => {
  const limits = { riskTolerance: 5, maxPositionWeight: 0.1, maxSectorWeight: 0.3, preferredPositionWeight: 0.05, cashTargetWeight: null };

  it("maps risk tolerance to the core share", () => {
    expect(coreShareFor(1)).toBe(0.8);
    expect(coreShareFor(10)).toBe(0.35);
    expect(coreShareFor(null)).toBe(0.6);
  });

  it("allocates every dollar, respects sector limits and favors the held broad fund as core", () => {
    const holdings = [
      hold({ symbol: "IVV", value: 4000, isFund: true, isBroad: true, bucket: "Diversified (index / multi-sector funds)", rating: "hold" }),
      hold({ symbol: "FTEC", value: 3000, isFund: true, bucket: "Technology", rating: "hold" }),
      hold({ symbol: "XOM", value: 500, bucket: "Energy", rating: "buy", personal: 80 }),
    ];
    const candidates = [sec({ symbol: "NVDA", bucket: "Technology", personal: 90, rating: "strong_buy" }), sec({ symbol: "JNJ", bucket: "Healthcare", personal: 77 })];
    const p = planContribution({ amount: 1000, cash: 0, holdings, candidates, limits, fallbackCore: null });
    const total = p.lines.reduce((a, l) => a + l.amount, 0);
    expect(total).toBeCloseTo(1000, 2);
    expect(p.lines[0].symbol).toBe("IVV");
    // Technology is already 35% > 30% limit → no tech additions
    expect(p.lines.find((l) => l.symbol === "NVDA")).toBeUndefined();
    expect(p.skipped.find((s) => s.symbol === "NVDA")?.reason).toMatch(/sector limit/);
    expect(p.lines.find((l) => l.symbol === "JNJ")).toBeDefined();
    for (const s of p.sectorWeightsAfter) if (s.limit !== null && s.before <= s.limit) expect(s.after).toBeLessThanOrEqual(s.limit + 1e-9);
  });

  it("never adds to Reduce-rated holdings and tops up cash first", () => {
    const holdings = [hold({ symbol: "IVV", value: 9000, isFund: true, isBroad: true, bucket: "Diversified (index / multi-sector funds)", rating: "hold" }), hold({ symbol: "BAD", value: 1000, rating: "reduce" })];
    const p = planContribution({ amount: 1000, cash: 0, holdings, candidates: [], limits: { ...limits, cashTargetWeight: 0.05 }, fallbackCore: null });
    expect(p.lines[0].kind).toBe("cash");
    expect(p.lines[0].amount).toBeCloseTo(550, 2);
    expect(p.lines.find((l) => l.symbol === "BAD")).toBeUndefined();
    expect(p.skipped.find((s) => s.symbol === "BAD")).toBeDefined();
  });
});

describe("fund classification", () => {
  it("classifies broad, target-date and sector funds", () => {
    expect(classify({ symbol: "IVV", name: "iShares Core S&P 500 ETF", sector: null, securityType: "etf" }).isBroad).toBe(true);
    expect(classify({ symbol: "FDKVX", name: "Fidelity Freedom 2060", sector: null, securityType: "fund" }).isBroad).toBe(true);
    expect(classify({ symbol: "FTEC", name: "Fidelity MSCI Information Technology Index ETF", sector: "Financial Services", securityType: "etf" }).bucket).toBe("Technology");
    expect(classify({ symbol: "QTUM", name: "Defiance Quantum ETF", sector: null, securityType: "etf" }).bucket).toBe("Technology");
    expect(classify({ symbol: "AAPL", name: "Apple Inc.", sector: "Technology", securityType: "stock" }).isFund).toBe(false);
  });
});
