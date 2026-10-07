/**
 * Normalized provider interfaces.
 *
 * RULE: application code (UI, scoring, calc, AI) never depends on a concrete
 * provider. Jobs obtain implementations from `registry.ts`; everything else
 * reads normalized rows from Postgres.
 */
import type { ProviderId, Sourced } from "@/lib/domain/provenance";
import type { PriceBar, Quote } from "@/lib/domain/market";
import type { FinancialStatement, ProviderMetricSet, StatementPeriod, StatementType } from "@/lib/domain/fundamentals";
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
  SplitEvent,
  SymbolSearchResult,
} from "@/lib/domain/research";

export type ProviderCategory =
  | "market_data"
  | "fundamentals"
  | "estimates"
  | "company_info"
  | "events"
  | "news"
  | "insider";

export const PROVIDER_CATEGORIES: readonly ProviderCategory[] = [
  "market_data",
  "fundamentals",
  "estimates",
  "company_info",
  "events",
  "news",
  "insider",
];

interface ProviderBase {
  readonly id: ProviderId;
}

export interface MarketDataProvider extends ProviderBase {
  /** Batched where the provider supports it. Symbols with no data are omitted (not zero-filled). */
  getQuotes(symbols: string[]): Promise<Sourced<Quote>[]>;
  /** Inclusive date range, ascending by date. */
  getDailyBars(symbol: string, from: string, to: string): Promise<Sourced<PriceBar[]>>;
}

export interface FundamentalsProvider extends ProviderBase {
  getStatements(
    symbol: string,
    type: StatementType,
    period: Exclude<StatementPeriod, "ttm">,
    limit: number,
  ): Promise<Sourced<FinancialStatement>[]>;
  /** Provider-computed ratios/metrics (data_kind = provider_derived). */
  getProviderMetrics(
    symbol: string,
    period: Exclude<StatementPeriod, "ttm">,
    limit: number,
  ): Promise<Sourced<ProviderMetricSet>[]>;
}

export interface EstimatesProvider extends ProviderBase {
  getEstimates(symbol: string, period: "annual" | "quarter", limit?: number): Promise<Sourced<AnalystEstimate>[]>;
  getPriceTargetConsensus(symbol: string): Promise<Sourced<PriceTargetConsensus> | null>;
  getRatingChanges(symbol: string, limit?: number): Promise<Sourced<RatingChange>[]>;
}

export interface CompanyInfoProvider extends ProviderBase {
  getProfile(symbol: string): Promise<Sourced<CompanyProfile> | null>;
  getPeers(symbol: string): Promise<Sourced<string[]>>;
  getExecutives(symbol: string): Promise<Sourced<Executive[]>>;
  searchSymbols(query: string, limit?: number): Promise<SymbolSearchResult[]>;
}

export interface EventsProvider extends ProviderBase {
  getEarnings(symbol: string, limit?: number): Promise<Sourced<EarningsEvent>[]>;
  getEarningsCalendar(from: string, to: string): Promise<Sourced<EarningsEvent>[]>;
  getDividends(symbol: string): Promise<Sourced<DividendEvent>[]>;
  getSplits(symbol: string): Promise<Sourced<SplitEvent>[]>;
  getFilings(symbol: string, from: string, to: string): Promise<Sourced<Filing>[]>;
}

export interface NewsProvider extends ProviderBase {
  getNews(symbols: string[], opts?: { from?: string; to?: string; limit?: number }): Promise<Sourced<NewsItem>[]>;
}

export interface InsiderDataProvider extends ProviderBase {
  getInsiderTransactions(symbol: string, limit?: number): Promise<Sourced<InsiderTransaction>[]>;
  getInstitutionalOwnership(symbol: string): Promise<Sourced<InstitutionalOwnershipSummary> | null>;
}

export interface ProviderCategoryMap {
  market_data: MarketDataProvider;
  fundamentals: FundamentalsProvider;
  estimates: EstimatesProvider;
  company_info: CompanyInfoProvider;
  events: EventsProvider;
  news: NewsProvider;
  insider: InsiderDataProvider;
}

/** A provider implementation may serve any subset of categories. */
export type ProviderBundle = { id: ProviderId } & Partial<ProviderCategoryMap>;

/** Observability hook — jobs pass one that writes to `provider_requests`. */
export interface ProviderRequestLog {
  provider: ProviderId;
  category: ProviderCategory;
  endpoint: string;
  symbol?: string | null;
  httpStatus?: number | null;
  ok: boolean;
  errorClass?: string | null;
  errorMessage?: string | null;
  durationMs: number;
  schemaWarnings?: string[];
}
export type ProviderRequestLogger = (entry: ProviderRequestLog) => void;
