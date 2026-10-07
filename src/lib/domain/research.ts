/** Normalized estimates, company info, events, news, insider/institutional data. */

export interface AnalystEstimate {
  symbol: string;
  period: "annual" | "quarter";
  fiscalPeriodEnd: string;
  revenueAvg: number | null;
  revenueLow: number | null;
  revenueHigh: number | null;
  ebitdaAvg: number | null;
  netIncomeAvg: number | null;
  epsAvg: number | null;
  epsLow: number | null;
  epsHigh: number | null;
  numAnalystsRevenue: number | null;
  numAnalystsEps: number | null;
}

export interface PriceTargetConsensus {
  symbol: string;
  targetHigh: number | null;
  targetLow: number | null;
  targetMean: number | null;
  targetMedian: number | null;
  numAnalysts: number | null;
}

export interface RatingChange {
  symbol: string;
  date: string;
  firm: string;
  action: string | null; // upgrade | downgrade | maintain | initiate | reiterate
  fromGrade: string | null;
  toGrade: string | null;
}

export type SecurityType = "stock" | "etf" | "fund" | "adr" | "index" | "cash" | "crypto" | "other";

export interface CompanyProfile {
  symbol: string;
  name: string | null;
  securityType: SecurityType;
  exchange: string | null;
  currency: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  website: string | null;
  ceo: string | null;
  cik: string | null;
  isin: string | null;
  cusip: string | null;
  ipoDate: string | null;
  employees: number | null;
  beta: number | null;
  isActivelyTrading: boolean | null;
}

export interface Executive {
  name: string;
  title: string | null;
  sinceYear: number | null;
  pay: number | null;
  payCurrency: string | null;
}

export interface SymbolSearchResult {
  symbol: string;
  name: string | null;
  exchange: string | null;
  currency: string | null;
}

export interface EarningsEvent {
  symbol: string;
  date: string;
  time: "bmo" | "amc" | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}

export interface DividendEvent {
  symbol: string;
  exDate: string;
  recordDate: string | null;
  payDate: string | null;
  declarationDate: string | null;
  amount: number | null;
  adjustedAmount: number | null;
}

export interface SplitEvent {
  symbol: string;
  date: string;
  numerator: number;
  denominator: number;
}

export interface Filing {
  symbol: string;
  formType: string;
  filedAt: string; // ISO date/datetime
  acceptedAt: string | null;
  accession: string | null;
  url: string | null;
}

export interface NewsItem {
  symbols: string[];
  title: string;
  publisher: string | null;
  publishedAt: string;
  url: string;
  summary: string | null;
  imageUrl: string | null;
  /** -1..1 when the provider supplies it; null otherwise (never inferred here). */
  sentiment: number | null;
}

export interface InsiderTransaction {
  symbol: string;
  filingDate: string | null;
  transactionDate: string;
  insiderName: string;
  insiderTitle: string | null;
  transactionCode: string | null;
  acquiredDisposed: "A" | "D" | null;
  shares: number | null;
  price: number | null;
  value: number | null;
  sharesOwnedAfter: number | null;
  url: string | null;
}

export interface InstitutionalOwnershipSummary {
  symbol: string;
  reportDate: string;
  institutionsCount: number | null;
  sharesHeld: number | null;
  ownershipPct: number | null; // decimal fraction
  sharesChange: number | null;
  newPositions: number | null;
  closedPositions: number | null;
}
