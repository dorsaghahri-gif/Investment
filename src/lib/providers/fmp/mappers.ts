/**
 * FMP (/stable API) → normalized domain mappers. Pure functions; unit-tested.
 *
 * Conventions verified/assumed per field (run `npm run fmp:smoke` against your
 * plan to confirm field names — mismatches surface as schema warnings and
 * null values, never as wrong numbers):
 *   • quote.changePercentage / changesPercentage: PERCENT (1.5 = 1.5%) → fraction
 *   • ratios *Margin, key-metrics returnOn*, *Yield, growth fields: FRACTIONS already
 *   • institutional ownershipPercent: PERCENT → fraction
 *   • capitalExpenditure: reported NEGATIVE (cash outflow); kept as reported
 * Older v3 field names are accepted as fallbacks where FMP renamed fields.
 */
import type { FinancialStatement, LineItems, ProviderMetricSet, StatementPeriod, StatementType } from "@/lib/domain/fundamentals";
import type { PriceBar, Quote } from "@/lib/domain/market";
import type {
  AnalystEstimate,
  CompanyProfile,
  DividendEvent,
  EarningsEvent,
  Executive,
  Filing,
  InsiderTransaction,
  InstitutionalOwnershipSummary,
  NewsItem,
  PriceTargetConsensus,
  RatingChange,
  SecurityType,
  SplitEvent,
  SymbolSearchResult,
} from "@/lib/domain/research";
import {
  bool,
  int,
  isoDate,
  isoDateTime,
  normalizeSymbol,
  num,
  pctToFraction,
  pickNum,
  pickStr,
  str,
} from "../parse";

type Raw = Record<string, unknown>;

export function asRows(body: unknown): Raw[] {
  if (Array.isArray(body)) return body.filter((r): r is Raw => !!r && typeof r === "object");
  if (body && typeof body === "object") {
    const b = body as Raw;
    // v3-style wrappers
    if (Array.isArray(b.historical)) return asRows(b.historical);
    if (Array.isArray(b.data)) return asRows(b.data);
    return [b];
  }
  return [];
}

// ── Market data ─────────────────────────────────────────────────────

export const QUOTE_FIELDS = ["symbol", "price", "change", "volume", "marketCap", "previousClose", "timestamp"];

export function mapQuote(r: Raw): Quote | null {
  const symbol = str(r.symbol);
  if (!symbol) return null;
  const pct = r.changePercentage ?? r.changesPercentage;
  return {
    symbol: normalizeSymbol(symbol),
    name: str(r.name),
    price: num(r.price),
    change: num(r.change),
    changePct: pctToFraction(pct),
    previousClose: num(r.previousClose),
    open: num(r.open),
    dayHigh: num(r.dayHigh),
    dayLow: num(r.dayLow),
    volume: num(r.volume),
    marketCap: num(r.marketCap),
    yearHigh: num(r.yearHigh),
    yearLow: num(r.yearLow),
    currency: str(r.currency),
    quoteTime: isoDateTime(r.timestamp),
  };
}

export const BAR_FIELDS = ["date", "open", "high", "low", "close", "volume"];

export function mapBar(symbol: string, r: Raw): PriceBar | null {
  const date = isoDate(r.date);
  const close = num(r.close);
  if (!date || close === null) return null;
  return {
    symbol: normalizeSymbol(symbol),
    date,
    open: num(r.open),
    high: num(r.high),
    low: num(r.low),
    close,
    adjClose: pickNum(r, "adjClose"),
    volume: num(r.volume),
    vwap: num(r.vwap),
  };
}

// ── Fundamentals ────────────────────────────────────────────────────

const INCOME_MAP: Record<string, string[]> = {
  revenue: ["revenue"],
  cost_of_revenue: ["costOfRevenue"],
  gross_profit: ["grossProfit"],
  research_and_development: ["researchAndDevelopmentExpenses"],
  sga_expense: ["sellingGeneralAndAdministrativeExpenses"],
  operating_expenses: ["operatingExpenses"],
  operating_income: ["operatingIncome"],
  interest_expense: ["interestExpense"],
  interest_income: ["interestIncome"],
  pretax_income: ["incomeBeforeTax"],
  income_tax_expense: ["incomeTaxExpense"],
  net_income: ["netIncome"],
  ebitda: ["ebitda"],
  depreciation_and_amortization: ["depreciationAndAmortization"],
  eps_basic: ["eps"],
  eps_diluted: ["epsDiluted", "epsdiluted"],
  shares_basic: ["weightedAverageShsOut"],
  shares_diluted: ["weightedAverageShsOutDil"],
};

const BALANCE_MAP: Record<string, string[]> = {
  cash_and_equivalents: ["cashAndCashEquivalents"],
  cash_and_short_term_investments: ["cashAndShortTermInvestments"],
  short_term_investments: ["shortTermInvestments"],
  accounts_receivable: ["accountsReceivables", "netReceivables"],
  inventory: ["inventory"],
  total_current_assets: ["totalCurrentAssets"],
  goodwill: ["goodwill"],
  intangible_assets: ["intangibleAssets"],
  total_assets: ["totalAssets"],
  accounts_payable: ["accountPayables", "accountsPayables"],
  short_term_debt: ["shortTermDebt"],
  total_current_liabilities: ["totalCurrentLiabilities"],
  long_term_debt: ["longTermDebt"],
  total_debt: ["totalDebt"],
  net_debt: ["netDebt"],
  total_liabilities: ["totalLiabilities"],
  total_equity: ["totalStockholdersEquity", "totalEquity"],
  retained_earnings: ["retainedEarnings"],
};

const CASH_FLOW_MAP: Record<string, string[]> = {
  operating_cash_flow: ["operatingCashFlow", "netCashProvidedByOperatingActivities"],
  capital_expenditure: ["capitalExpenditure", "investmentsInPropertyPlantAndEquipment"],
  free_cash_flow: ["freeCashFlow"],
  stock_based_compensation: ["stockBasedCompensation"],
  dividends_paid: ["commonDividendsPaid", "netDividendsPaid", "dividendsPaid"],
  share_repurchases: ["commonStockRepurchased"],
  acquisitions: ["acquisitionsNet"],
  depreciation_and_amortization: ["depreciationAndAmortization"],
};

export const STATEMENT_MAPS: Record<StatementType, Record<string, string[]>> = {
  income: INCOME_MAP,
  balance: BALANCE_MAP,
  cash_flow: CASH_FLOW_MAP,
};

/** Expected raw field names per statement type (first candidate of each item). */
export function expectedStatementFields(type: StatementType): string[] {
  return ["date", ...Object.values(STATEMENT_MAPS[type]).map((c) => c[0])];
}

function parseFiscalQuarter(period: unknown): number | null {
  const s = str(period);
  const m = s ? /^Q([1-4])$/i.exec(s) : null;
  return m ? Number(m[1]) : null;
}

export function mapStatement(
  symbol: string,
  type: StatementType,
  period: Exclude<StatementPeriod, "ttm">,
  r: Raw,
): FinancialStatement | null {
  const periodEnd = isoDate(r.date);
  if (!periodEnd) return null;
  const map = STATEMENT_MAPS[type];
  const lineItems: LineItems = {};
  for (const [key, candidates] of Object.entries(map)) {
    lineItems[key as keyof LineItems] = pickNum(r, ...candidates);
  }
  return {
    symbol: normalizeSymbol(symbol),
    type,
    period,
    fiscalYear: int(r.fiscalYear ?? r.calendarYear),
    fiscalQuarter: period === "quarter" ? parseFiscalQuarter(r.period) : null,
    periodEnd,
    filedAt: isoDate(r.filingDate ?? r.fillingDate),
    currency: str(r.reportedCurrency),
    lineItems,
  };
}

export const KEY_METRICS_FIELDS = ["date", "marketCap", "enterpriseValue", "evToEBITDA", "returnOnInvestedCapital", "returnOnEquity", "freeCashFlowYield"];
export const RATIOS_FIELDS = ["date", "grossProfitMargin", "operatingProfitMargin", "netProfitMargin", "priceToEarningsRatio", "priceToFreeCashFlowRatio"];
export const GROWTH_FIELDS = ["date", "revenueGrowth", "freeCashFlowGrowth"];

/** Merge key-metrics, ratios and financial-growth rows by period end date. */
export function mapProviderMetrics(
  symbol: string,
  period: Exclude<StatementPeriod, "ttm">,
  keyMetrics: Raw[],
  ratios: Raw[],
  growth: Raw[],
): ProviderMetricSet[] {
  const byDate = new Map<string, { km?: Raw; ra?: Raw; gr?: Raw }>();
  const add = (rows: Raw[], k: "km" | "ra" | "gr") => {
    for (const r of rows) {
      const d = isoDate(r.date);
      if (!d) continue;
      const e = byDate.get(d) ?? {};
      e[k] = r;
      byDate.set(d, e);
    }
  };
  add(keyMetrics, "km");
  add(ratios, "ra");
  add(growth, "gr");

  const out: ProviderMetricSet[] = [];
  for (const [asOf, { km = {}, ra = {}, gr = {} }] of byDate) {
    out.push({
      symbol: normalizeSymbol(symbol),
      period,
      asOf,
      metrics: {
        market_cap: pickNum(km, "marketCap"),
        enterprise_value: pickNum(km, "enterpriseValue"),
        pe: pickNum(ra, "priceToEarningsRatio", "peRatio"),
        peg: pickNum(ra, "priceToEarningsGrowthRatio", "pegRatio"),
        ps: pickNum(ra, "priceToSalesRatio"),
        pb: pickNum(ra, "priceToBookRatio", "pbRatio"),
        p_fcf: pickNum(ra, "priceToFreeCashFlowRatio", "pfcfRatio"),
        ev_sales: pickNum(km, "evToSales"),
        ev_ebitda: pickNum(km, "evToEBITDA", "enterpriseValueOverEBITDA"),
        fcf_yield: pickNum(km, "freeCashFlowYield"),
        earnings_yield: pickNum(km, "earningsYield"),
        dividend_yield: pickNum(ra, "dividendYield"),
        gross_margin: pickNum(ra, "grossProfitMargin"),
        operating_margin: pickNum(ra, "operatingProfitMargin"),
        net_margin: pickNum(ra, "netProfitMargin"),
        fcf_margin: null, // computed in-app from statements
        roic: pickNum(km, "returnOnInvestedCapital", "roic"),
        roe: pickNum(km, "returnOnEquity", "roe"),
        roa: pickNum(km, "returnOnAssets", "returnOnTangibleAssets"),
        net_debt_to_ebitda: pickNum(km, "netDebtToEBITDA"),
        debt_to_equity: pickNum(ra, "debtToEquityRatio", "debtToEquity"),
        current_ratio: pickNum(km, "currentRatio") ?? pickNum(ra, "currentRatio"),
        interest_coverage: pickNum(ra, "interestCoverageRatio", "interestCoverage"),
        revenue_growth: pickNum(gr, "revenueGrowth"),
        eps_growth: pickNum(gr, "epsgrowth", "epsGrowth"),
        fcf_growth: pickNum(gr, "freeCashFlowGrowth"),
        operating_income_growth: pickNum(gr, "operatingIncomeGrowth"),
      },
    });
  }
  return out.sort((a, b) => (a.asOf < b.asOf ? 1 : -1));
}

// ── Estimates ───────────────────────────────────────────────────────

export const ESTIMATE_FIELDS = ["date", "revenueAvg", "epsAvg", "numAnalystsEps"];

export function mapEstimate(symbol: string, period: "annual" | "quarter", r: Raw): AnalystEstimate | null {
  const end = isoDate(r.date);
  if (!end) return null;
  return {
    symbol: normalizeSymbol(symbol),
    period,
    fiscalPeriodEnd: end,
    revenueAvg: pickNum(r, "revenueAvg", "estimatedRevenueAvg"),
    revenueLow: pickNum(r, "revenueLow", "estimatedRevenueLow"),
    revenueHigh: pickNum(r, "revenueHigh", "estimatedRevenueHigh"),
    ebitdaAvg: pickNum(r, "ebitdaAvg", "estimatedEbitdaAvg"),
    netIncomeAvg: pickNum(r, "netIncomeAvg", "estimatedNetIncomeAvg"),
    epsAvg: pickNum(r, "epsAvg", "estimatedEpsAvg"),
    epsLow: pickNum(r, "epsLow", "estimatedEpsLow"),
    epsHigh: pickNum(r, "epsHigh", "estimatedEpsHigh"),
    numAnalystsRevenue: int(r.numAnalystsRevenue ?? r.numberAnalystEstimatedRevenue),
    numAnalystsEps: int(r.numAnalystsEps ?? r.numberAnalystsEstimatedEps),
  };
}

export function mapPriceTarget(symbol: string, r: Raw): PriceTargetConsensus | null {
  const t: PriceTargetConsensus = {
    symbol: normalizeSymbol(symbol),
    targetHigh: num(r.targetHigh),
    targetLow: num(r.targetLow),
    targetMean: pickNum(r, "targetConsensus", "targetMean"),
    targetMedian: num(r.targetMedian),
    numAnalysts: null, // not provided by this endpoint
  };
  const any = [t.targetHigh, t.targetLow, t.targetMean, t.targetMedian].some((v) => v !== null);
  return any ? t : null;
}

export function mapRatingChange(symbol: string, r: Raw): RatingChange | null {
  const date = isoDate(r.date ?? r.publishedDate);
  const firm = pickStr(r, "gradingCompany", "analystCompany");
  if (!date || !firm) return null;
  return {
    symbol: normalizeSymbol(symbol),
    date,
    firm,
    action: str(r.action)?.toLowerCase() ?? null,
    fromGrade: str(r.previousGrade),
    toGrade: str(r.newGrade),
  };
}

// ── Company info ────────────────────────────────────────────────────

export const PROFILE_FIELDS = ["symbol", "companyName", "sector", "industry", "currency", "exchange", "isEtf"];

export function mapProfile(r: Raw): CompanyProfile | null {
  const symbol = str(r.symbol);
  if (!symbol) return null;
  let securityType: SecurityType = "stock";
  if (bool(r.isEtf)) securityType = "etf";
  else if (bool(r.isFund)) securityType = "fund";
  else if (bool(r.isAdr)) securityType = "adr";
  return {
    symbol: normalizeSymbol(symbol),
    name: pickStr(r, "companyName", "name"),
    securityType,
    exchange: pickStr(r, "exchange", "exchangeShortName"),
    currency: str(r.currency),
    country: str(r.country),
    sector: str(r.sector),
    industry: str(r.industry),
    description: str(r.description),
    website: str(r.website),
    ceo: str(r.ceo),
    cik: str(r.cik),
    isin: str(r.isin),
    cusip: str(r.cusip),
    ipoDate: isoDate(r.ipoDate),
    employees: int(r.fullTimeEmployees),
    beta: num(r.beta),
    isActivelyTrading: bool(r.isActivelyTrading),
  };
}

export function mapPeers(body: unknown): string[] {
  const rows = asRows(body);
  const out = new Set<string>();
  for (const r of rows) {
    if (Array.isArray(r.peersList)) {
      for (const p of r.peersList) if (typeof p === "string" && p.trim()) out.add(normalizeSymbol(p));
    } else {
      const s = str(r.symbol);
      if (s) out.add(normalizeSymbol(s));
    }
  }
  return [...out];
}

export function mapExecutive(r: Raw): Executive | null {
  const name = str(r.name);
  if (!name) return null;
  return {
    name,
    title: str(r.title),
    sinceYear: int(r.titleSince),
    pay: num(r.pay),
    payCurrency: pickStr(r, "currencyPay", "currency"),
  };
}

export function mapSearchResult(r: Raw): SymbolSearchResult | null {
  const symbol = str(r.symbol);
  if (!symbol) return null;
  return {
    symbol: normalizeSymbol(symbol),
    name: str(r.name),
    exchange: pickStr(r, "exchange", "exchangeShortName", "exchangeFullName"),
    currency: str(r.currency),
  };
}

// ── Events ──────────────────────────────────────────────────────────

export function mapEarnings(r: Raw, fallbackSymbol?: string): EarningsEvent | null {
  const date = isoDate(r.date);
  const symbol = str(r.symbol) ?? fallbackSymbol ?? null;
  if (!date || !symbol) return null;
  const t = str(r.time)?.toLowerCase();
  return {
    symbol: normalizeSymbol(symbol),
    date,
    time: t === "bmo" || t === "amc" ? t : null,
    epsEstimate: pickNum(r, "epsEstimated"),
    epsActual: pickNum(r, "epsActual", "eps"),
    revenueEstimate: pickNum(r, "revenueEstimated"),
    revenueActual: pickNum(r, "revenueActual", "revenue"),
  };
}

export function mapDividend(symbol: string, r: Raw): DividendEvent | null {
  const exDate = isoDate(r.date);
  if (!exDate) return null;
  return {
    symbol: normalizeSymbol(symbol),
    exDate,
    recordDate: isoDate(r.recordDate),
    payDate: isoDate(r.paymentDate),
    declarationDate: isoDate(r.declarationDate),
    amount: num(r.dividend),
    adjustedAmount: num(r.adjDividend),
  };
}

export function mapSplit(symbol: string, r: Raw): SplitEvent | null {
  const date = isoDate(r.date);
  const n = num(r.numerator);
  const d = num(r.denominator);
  if (!date || n === null || d === null || n <= 0 || d <= 0) return null;
  return { symbol: normalizeSymbol(symbol), date, numerator: n, denominator: d };
}

const ACCESSION_RE = /(\d{10}-\d{2}-\d{6})/;
const ACCESSION_COMPACT_RE = /\/(\d{18})\//;

export function accessionFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = ACCESSION_RE.exec(url);
  if (m) return m[1];
  const c = ACCESSION_COMPACT_RE.exec(url);
  if (c) return `${c[1].slice(0, 10)}-${c[1].slice(10, 12)}-${c[1].slice(12)}`;
  return null;
}

export function mapFiling(symbol: string, r: Raw): Filing | null {
  const formType = pickStr(r, "formType", "type");
  const filedAt = isoDate(r.filingDate ?? r.fillingDate);
  if (!formType || !filedAt) return null;
  const url = pickStr(r, "finalLink", "link");
  return {
    symbol: normalizeSymbol(symbol),
    formType,
    filedAt,
    acceptedAt: isoDateTime(r.acceptedDate),
    accession: accessionFromUrl(pickStr(r, "link", "finalLink")),
    url,
  };
}

// ── News ────────────────────────────────────────────────────────────

export function mapNews(r: Raw): NewsItem | null {
  const url = str(r.url);
  const title = str(r.title);
  const publishedAt = isoDateTime(r.publishedDate);
  if (!url || !title || !publishedAt) return null;
  const sym = str(r.symbol);
  return {
    symbols: sym ? [normalizeSymbol(sym)] : [],
    title,
    publisher: pickStr(r, "publisher", "site"),
    publishedAt,
    url,
    summary: str(r.text),
    imageUrl: str(r.image),
    sentiment: null, // FMP stock news does not include sentiment; never inferred here
  };
}

// ── Insider / institutional ─────────────────────────────────────────

export function mapInsider(symbol: string, r: Raw): InsiderTransaction | null {
  const transactionDate = isoDate(r.transactionDate);
  const insiderName = str(r.reportingName);
  if (!transactionDate || !insiderName) return null;
  const type = str(r.transactionType); // e.g. "P-Purchase", "S-Sale"
  const code = type ? type.split("-")[0].trim().toUpperCase() || null : null;
  const ad = str(r.acquisitionOrDisposition)?.toUpperCase();
  const shares = num(r.securitiesTransacted);
  const price = num(r.price);
  return {
    symbol: normalizeSymbol(symbol),
    filingDate: isoDate(r.filingDate),
    transactionDate,
    insiderName,
    insiderTitle: str(r.typeOfOwner),
    transactionCode: code,
    acquiredDisposed: ad === "A" || ad === "D" ? ad : null,
    shares,
    price,
    // value is a deterministic product of two reported fields; null if either missing
    value: shares !== null && price !== null ? shares * price : null,
    sharesOwnedAfter: num(r.securitiesOwned),
    url: str(r.url),
  };
}

export function mapInstitutional(symbol: string, r: Raw): InstitutionalOwnershipSummary | null {
  const reportDate = isoDate(r.date);
  if (!reportDate) return null;
  return {
    symbol: normalizeSymbol(symbol),
    reportDate,
    institutionsCount: int(r.investorsHolding),
    sharesHeld: pickNum(r, "numberOf13Fshares"),
    ownershipPct: pctToFraction(r.ownershipPercent),
    sharesChange: pickNum(r, "numberOf13FsharesChange"),
    newPositions: int(r.newPositions),
    closedPositions: int(r.closedPositions),
  };
}

/** Most recent calendar quarter whose 13F filing deadline (45 days) has passed. */
export function latestReportedQuarter(today: Date): { year: number; quarter: number } {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - 46);
  const q = Math.floor(d.getUTCMonth() / 3); // quarter containing (today-46d); use previous completed
  let year = d.getUTCFullYear();
  let quarter = q; // previous quarter index (0 means Q4 of prior year)
  if (quarter === 0) {
    quarter = 4;
    year -= 1;
  }
  return { year, quarter };
}
