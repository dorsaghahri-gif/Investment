/**
 * Score model definitions (docs/SCORING.md). Changing anything here that alters
 * results must bump MODEL_VERSION so stored history stays interpretable.
 */

export const MODEL_VERSION = "score-model v1.0";
export const ENGINE_VERSION = "rec-engine v1.0";

export const CATEGORIES = [
  "quality",
  "growth",
  "valuation",
  "forward",
  "momentum",
  "revisions",
  "balance_sheet",
  "competitive",
  "ownership",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  quality: "Quality",
  growth: "Growth",
  valuation: "Valuation",
  forward: "Forward expectations",
  momentum: "Momentum",
  revisions: "Analyst revisions",
  balance_sheet: "Balance sheet",
  competitive: "Competitive position",
  ownership: "Insider / institutional",
};

export const DEFAULT_CATEGORY_WEIGHTS: Record<Category, number> = {
  quality: 20,
  growth: 15,
  valuation: 15,
  forward: 15,
  momentum: 10,
  revisions: 10,
  balance_sheet: 5,
  competitive: 5,
  ownership: 5,
};

export type Unit = "ratio" | "x" | "pct_points" | "score";

export interface MetricDef {
  key: string;
  label: string;
  category: Category;
  weight: number; // sub-weight within its category
  direction: 1 | -1; // 1 = higher is better
  unit: Unit;
  /** Compare against the company's own history (margins, ROIC, valuation multiples). */
  useHistory: boolean;
  /** Short plain-language explanation shown in the UI. */
  help: string;
}

/**
 * Metrics the engine knows. Metrics a data plan can't supply stay missing and
 * their category is excluded when < 50% of its weight is present.
 */
export const METRICS: MetricDef[] = [
  // Quality
  { key: "roic", label: "Return on invested capital", category: "quality", weight: 25, direction: 1, unit: "ratio", useHistory: true, help: "After-tax operating profit ÷ (equity + debt − cash)." },
  { key: "roe", label: "Return on equity", category: "quality", weight: 10, direction: 1, unit: "ratio", useHistory: true, help: "Net income ÷ average shareholders' equity." },
  { key: "gross_margin", label: "Gross margin", category: "quality", weight: 15, direction: 1, unit: "ratio", useHistory: true, help: "Gross profit ÷ revenue." },
  { key: "operating_margin", label: "Operating margin", category: "quality", weight: 15, direction: 1, unit: "ratio", useHistory: true, help: "Operating income ÷ revenue." },
  { key: "fcf_margin", label: "Free-cash-flow margin", category: "quality", weight: 20, direction: 1, unit: "ratio", useHistory: true, help: "Free cash flow ÷ revenue." },
  { key: "earnings_consistency", label: "Earnings consistency", category: "quality", weight: 15, direction: 1, unit: "ratio", useHistory: false, help: "Share of the last (up to) 5 fiscal years with positive net income and non-declining EPS." },

  // Growth
  { key: "revenue_cagr_3y", label: "Revenue growth (3-yr CAGR)", category: "growth", weight: 25, direction: 1, unit: "ratio", useHistory: false, help: "Compound annual revenue growth over the last 3 fiscal years." },
  { key: "revenue_growth_yoy", label: "Revenue growth (latest FY)", category: "growth", weight: 25, direction: 1, unit: "ratio", useHistory: false, help: "Latest fiscal-year revenue vs the prior year." },
  { key: "eps_growth_yoy", label: "EPS growth (latest FY)", category: "growth", weight: 20, direction: 1, unit: "ratio", useHistory: false, help: "Diluted EPS vs the prior year (unavailable when prior EPS ≤ 0)." },
  { key: "fcf_cagr_3y", label: "FCF growth (3-yr CAGR)", category: "growth", weight: 20, direction: 1, unit: "ratio", useHistory: false, help: "Compound annual free-cash-flow growth (unavailable when either end is ≤ 0)." },
  { key: "growth_acceleration", label: "Growth acceleration", category: "growth", weight: 10, direction: 1, unit: "pct_points", useHistory: false, help: "Latest revenue growth minus the prior year's revenue growth." },

  // Valuation (trailing — the Starter data plan has no forward estimates)
  { key: "pe_ttm", label: "P/E (trailing)", category: "valuation", weight: 20, direction: -1, unit: "x", useHistory: true, help: "Market cap ÷ latest fiscal-year net income. Unavailable when earnings ≤ 0." },
  { key: "ev_ebitda", label: "EV / EBITDA", category: "valuation", weight: 20, direction: -1, unit: "x", useHistory: true, help: "(Market cap + debt − cash) ÷ EBITDA. Unavailable when EBITDA ≤ 0." },
  { key: "fcf_yield", label: "Free-cash-flow yield", category: "valuation", weight: 25, direction: 1, unit: "ratio", useHistory: true, help: "Free cash flow ÷ market cap." },
  { key: "ev_sales", label: "EV / Sales", category: "valuation", weight: 10, direction: -1, unit: "x", useHistory: true, help: "Enterprise value ÷ revenue." },
  { key: "peg", label: "PEG (trailing)", category: "valuation", weight: 15, direction: -1, unit: "x", useHistory: false, help: "Trailing P/E ÷ 3-yr EPS growth (in %). Unavailable when growth ≤ 0." },

  // Forward expectations (analyst estimates — plan-dependent)
  { key: "eps_growth_fy1_est", label: "Next-FY EPS growth (est.)", category: "forward", weight: 35, direction: 1, unit: "ratio", useHistory: false, help: "Consensus next-fiscal-year EPS vs last reported EPS." },
  { key: "revenue_growth_fy1_est", label: "Next-FY revenue growth (est.)", category: "forward", weight: 30, direction: 1, unit: "ratio", useHistory: false, help: "Consensus next-fiscal-year revenue vs last reported revenue." },
  { key: "target_upside", label: "Upside to consensus target", category: "forward", weight: 15, direction: 1, unit: "ratio", useHistory: false, help: "Mean analyst price target ÷ price − 1." },
  { key: "estimate_dispersion", label: "Estimate dispersion", category: "forward", weight: 20, direction: -1, unit: "ratio", useHistory: false, help: "(High − low EPS estimate) ÷ |mean|. Lower = analysts agree more." },

  // Momentum
  { key: "ret_12_1", label: "12-1 month return", category: "momentum", weight: 40, direction: 1, unit: "ratio", useHistory: false, help: "Return from 12 months ago to 1 month ago (skips the latest month)." },
  { key: "ret_6m", label: "6-month return", category: "momentum", weight: 25, direction: 1, unit: "ratio", useHistory: false, help: "Price return over the last 6 months." },
  { key: "price_vs_200dma", label: "Price vs 200-day average", category: "momentum", weight: 20, direction: 1, unit: "ratio", useHistory: false, help: "Latest close ÷ 200-trading-day average − 1." },
  { key: "rs_vs_spy_6m", label: "6-month return vs S&P 500", category: "momentum", weight: 15, direction: 1, unit: "pct_points", useHistory: false, help: "6-month return minus SPY's 6-month return." },

  // Analyst revisions (needs estimate history — accumulates over time)
  { key: "eps_revision_30d", label: "EPS estimate revision (30d)", category: "revisions", weight: 35, direction: 1, unit: "ratio", useHistory: false, help: "Change in next-FY consensus EPS over 30 days." },
  { key: "eps_revision_90d", label: "EPS estimate revision (90d)", category: "revisions", weight: 25, direction: 1, unit: "ratio", useHistory: false, help: "Change in next-FY consensus EPS over 90 days." },
  { key: "revenue_revision_90d", label: "Revenue estimate revision (90d)", category: "revisions", weight: 20, direction: 1, unit: "ratio", useHistory: false, help: "Change in next-FY consensus revenue over 90 days." },
  { key: "net_upgrades_90d", label: "Net upgrades (90d)", category: "revisions", weight: 20, direction: 1, unit: "score", useHistory: false, help: "Analyst upgrades minus downgrades in 90 days." },

  // Balance sheet
  { key: "net_debt_to_ebitda", label: "Net debt / EBITDA", category: "balance_sheet", weight: 40, direction: -1, unit: "x", useHistory: false, help: "(Debt − cash) ÷ EBITDA. Negative = net cash." },
  { key: "interest_coverage", label: "Interest coverage", category: "balance_sheet", weight: 25, direction: 1, unit: "x", useHistory: false, help: "Operating income ÷ interest expense (capped at 100×)." },
  { key: "current_ratio", label: "Current ratio", category: "balance_sheet", weight: 15, direction: 1, unit: "x", useHistory: false, help: "Current assets ÷ current liabilities." },
  { key: "cash_to_debt", label: "Cash / total debt", category: "balance_sheet", weight: 20, direction: 1, unit: "x", useHistory: false, help: "Cash & short-term investments ÷ total debt (capped at 10×)." },

  // Competitive position (quantitative proxies only)
  { key: "gross_margin_stability", label: "Gross-margin stability (5y)", category: "competitive", weight: 35, direction: -1, unit: "pct_points", useHistory: false, help: "Standard deviation of gross margin over up to 5 years. Lower = steadier pricing power." },
  { key: "roic_vs_sector", label: "ROIC vs sector median", category: "competitive", weight: 35, direction: 1, unit: "pct_points", useHistory: false, help: "ROIC minus the median ROIC of its sector in the universe." },
  { key: "growth_vs_industry", label: "Revenue growth vs industry median", category: "competitive", weight: 30, direction: 1, unit: "pct_points", useHistory: false, help: "Latest revenue growth minus its industry's median (market-share proxy)." },

  // Ownership (plan-dependent)
  { key: "insider_net_buying_6m", label: "Net insider buying (6m, % of mkt cap)", category: "ownership", weight: 50, direction: 1, unit: "ratio", useHistory: false, help: "Insider purchases minus sales ÷ market cap." },
  { key: "institutional_change_qoq", label: "Institutional ownership change (QoQ)", category: "ownership", weight: 50, direction: 1, unit: "ratio", useHistory: false, help: "Quarter-over-quarter change in institutional ownership." },
];

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export const PEER_BLEND = { industry: 0.35, sector: 0.25, market: 0.2, history: 0.2 } as const;
export const MIN_PEER_GROUP = 8;
export const MIN_CATEGORY_COVERAGE = 0.5;
export const MIN_OVERALL_COVERAGE = 0.6;
