/**
 * Normalized fundamentals. The line-item dictionary is provider-agnostic:
 * every provider maps into these keys; unknown items are dropped.
 */

export type StatementType = "income" | "balance" | "cash_flow";
export type StatementPeriod = "annual" | "quarter" | "ttm";

export const INCOME_ITEMS = [
  "revenue",
  "cost_of_revenue",
  "gross_profit",
  "research_and_development",
  "sga_expense",
  "operating_expenses",
  "operating_income",
  "interest_expense",
  "interest_income",
  "pretax_income",
  "income_tax_expense",
  "net_income",
  "ebitda",
  "depreciation_and_amortization",
  "eps_basic",
  "eps_diluted",
  "shares_basic",
  "shares_diluted",
] as const;

export const BALANCE_ITEMS = [
  "cash_and_equivalents",
  "cash_and_short_term_investments",
  "short_term_investments",
  "accounts_receivable",
  "inventory",
  "total_current_assets",
  "goodwill",
  "intangible_assets",
  "total_assets",
  "accounts_payable",
  "short_term_debt",
  "total_current_liabilities",
  "long_term_debt",
  "total_debt",
  "net_debt",
  "total_liabilities",
  "total_equity",
  "retained_earnings",
] as const;

export const CASH_FLOW_ITEMS = [
  "operating_cash_flow",
  "capital_expenditure",
  "free_cash_flow",
  "stock_based_compensation",
  "dividends_paid",
  "share_repurchases",
  "acquisitions",
  "depreciation_and_amortization",
] as const;

export type IncomeItem = (typeof INCOME_ITEMS)[number];
export type BalanceItem = (typeof BALANCE_ITEMS)[number];
export type CashFlowItem = (typeof CASH_FLOW_ITEMS)[number];
export type LineItemKey = IncomeItem | BalanceItem | CashFlowItem;

export type LineItems = Partial<Record<LineItemKey, number | null>>;

export interface FinancialStatement {
  symbol: string;
  type: StatementType;
  period: StatementPeriod;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  periodEnd: string; // YYYY-MM-DD
  filedAt: string | null;
  currency: string | null;
  lineItems: LineItems;
}

/**
 * Metrics/ratios as computed by a provider (data_kind = provider_derived).
 * The app recomputes its own valuation multiples; these are a cross-check.
 */
export const PROVIDER_METRIC_KEYS = [
  "market_cap",
  "enterprise_value",
  "pe",
  "peg",
  "ps",
  "pb",
  "p_fcf",
  "ev_sales",
  "ev_ebitda",
  "fcf_yield",
  "earnings_yield",
  "dividend_yield",
  "gross_margin",
  "operating_margin",
  "net_margin",
  "fcf_margin",
  "roic",
  "roe",
  "roa",
  "net_debt_to_ebitda",
  "debt_to_equity",
  "current_ratio",
  "interest_coverage",
  "revenue_growth",
  "eps_growth",
  "fcf_growth",
  "operating_income_growth",
] as const;
export type ProviderMetricKey = (typeof PROVIDER_METRIC_KEYS)[number];

export interface ProviderMetricSet {
  symbol: string;
  period: StatementPeriod;
  asOf: string; // period end
  metrics: Partial<Record<ProviderMetricKey, number | null>>;
}
