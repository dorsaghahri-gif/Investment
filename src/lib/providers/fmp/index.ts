/**
 * Financial Modeling Prep adapter. Implements every category interface.
 * This module (and ./mappers) is the ONLY place FMP endpoints appear.
 * Import restricted to src/lib/providers/registry.ts (see eslint.config.mjs).
 */
import "server-only";
import type { Provenance, Sourced } from "@/lib/domain/provenance";
import type { DataKind } from "@/lib/domain/provenance";
import type { Quote } from "@/lib/domain/market";
import type { StatementPeriod, StatementType } from "@/lib/domain/fundamentals";
import { ProviderError, type ProviderErrorClass } from "../errors";
import { HttpClient } from "../http";
import type {
  CompanyInfoProvider,
  EstimatesProvider,
  EventsProvider,
  FundamentalsProvider,
  InsiderDataProvider,
  MarketDataProvider,
  NewsProvider,
  ProviderBundle,
  ProviderCategory,
  ProviderRequestLogger,
} from "../interfaces";
import { missingKeys, normalizeSymbol } from "../parse";
import * as M from "./mappers";

export const FMP_BASE_URL = "https://financialmodelingprep.com/stable/";

export interface FmpOptions {
  apiKey: string;
  rateLimitPerMinute?: number;
  logger?: ProviderRequestLogger;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

/** FMP returns some errors as 200 + {"Error Message": "..."}; classify them. */
export function classifyFmpBody(status: number, body: unknown): { errorClass: ProviderErrorClass; message: string } | null {
  let msg: string | null = null;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const b = body as Record<string, unknown>;
    const m = b["Error Message"] ?? b["error"] ?? b["message"];
    if (typeof m === "string" && (status >= 400 || "Error Message" in b)) msg = m;
  } else if (typeof body === "string" && status >= 400) {
    msg = body;
  }
  if (!msg) return null;
  const lower = msg.toLowerCase();
  let errorClass: ProviderErrorClass = "unknown";
  if (/invalid api key|api key.*(missing|invalid)|unauthori[sz]ed/.test(lower)) errorClass = "auth";
  else if (/limit reach|too many|rate limit/.test(lower)) errorClass = "rate_limited";
  else if (/subscription|upgrade|premium|restricted|exclusive|not available under|special endpoint/.test(lower)) errorClass = "plan_restricted";
  else if (/not found|no data/.test(lower)) errorClass = "not_found";
  else if (status >= 500) errorClass = "unavailable";
  return { errorClass, message: `FMP: ${msg.slice(0, 300)}` };
}

export function createFmpProvider(opts: FmpOptions): ProviderBundle {
  if (!opts.apiKey) throw new ProviderError("fmp", "auth", "FMP_API_KEY is not configured", { tryNextProvider: true });

  const http = new HttpClient({
    provider: "fmp",
    baseUrl: FMP_BASE_URL,
    secretParams: { apikey: opts.apiKey },
    rateLimitPerMinute: opts.rateLimitPerMinute ?? 300,
    maxConcurrency: 8,
    timeoutMs: 15_000,
    maxRetries: 3,
    logger: opts.logger,
    fetchImpl: opts.fetchImpl,
    sleep: opts.sleep,
    classifyBody: classifyFmpBody,
  });
  const now = opts.now ?? (() => new Date());

  const get = async (
    category: ProviderCategory,
    path: string,
    params: Record<string, string | number | undefined>,
    expected: string[] = [],
    symbol?: string,
  ) => {
    const body = await http.getJson(path, params, {
      category,
      symbol,
      schemaCheck: expected.length ? (b) => missingKeys(M.asRows(b), expected) : undefined,
    });
    return M.asRows(body);
  };

  const prov = (sourceRef: string, dataKind: DataKind, asOf: string): Provenance => ({
    provider: "fmp",
    sourceRef,
    dataKind,
    asOf,
    fetchedAt: now().toISOString(),
  });
  const today = () => now().toISOString().slice(0, 10);
  const sourced = <T>(data: T, p: Provenance): Sourced<T> => ({ data, provenance: p });

  // ── Market data ───────────────────────────────────────────────────
  const market: MarketDataProvider = {
    id: "fmp",
    async getQuotes(symbols) {
      const uniq = [...new Set(symbols.map(normalizeSymbol))].filter(Boolean);
      const out: Sourced<Quote>[] = [];
      // FMP stable /quote accepts one symbol; /batch-quote accepts a comma list (plan-dependent).
      // Try batch first; on plan restriction fall back to per-symbol.
      const chunks: string[][] = [];
      for (let i = 0; i < uniq.length; i += 50) chunks.push(uniq.slice(i, i + 50));
      for (const chunk of chunks) {
        let rows: Record<string, unknown>[];
        try {
          rows = await get("market_data", "batch-quote", { symbols: chunk.join(",") }, M.QUOTE_FIELDS);
        } catch (e) {
          if (e instanceof ProviderError && (e.errorClass === "plan_restricted" || e.errorClass === "not_found")) {
            rows = [];
            const settled = await Promise.allSettled(
              chunk.map((s) => get("market_data", "quote", { symbol: s }, M.QUOTE_FIELDS, s)),
            );
            for (const r of settled) if (r.status === "fulfilled") rows.push(...r.value);
          } else throw e;
        }
        for (const r of rows) {
          const q = M.mapQuote(r);
          if (q) out.push(sourced(q, prov("/stable/quote", "reported", q.quoteTime ?? now().toISOString())));
        }
      }
      return out;
    },
    async getDailyBars(symbol, from, to) {
      const s = normalizeSymbol(symbol);
      const rows = await get("market_data", "historical-price-eod/full", { symbol: s, from, to }, M.BAR_FIELDS, s);
      const bars = rows
        .map((r) => M.mapBar(s, r))
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      const asOf = bars.at(-1)?.date ?? to;
      return sourced(bars, prov("/stable/historical-price-eod/full", "reported", asOf));
    },
  };

  // ── Fundamentals ──────────────────────────────────────────────────
  const statementPath: Record<StatementType, string> = {
    income: "income-statement",
    balance: "balance-sheet-statement",
    cash_flow: "cash-flow-statement",
  };
  const fundamentals: FundamentalsProvider = {
    id: "fmp",
    async getStatements(symbol, type, period, limit) {
      const s = normalizeSymbol(symbol);
      const path = statementPath[type];
      const rows = await get("fundamentals", path, { symbol: s, period, limit }, M.expectedStatementFields(type), s);
      return rows
        .map((r) => M.mapStatement(s, type, period, r))
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .map((st) => sourced(st, prov(`/stable/${path}`, "reported", st.periodEnd)));
    },
    async getProviderMetrics(symbol, period: Exclude<StatementPeriod, "ttm">, limit) {
      const s = normalizeSymbol(symbol);
      const [km, ra, gr] = await Promise.all([
        get("fundamentals", "key-metrics", { symbol: s, period, limit }, M.KEY_METRICS_FIELDS, s),
        get("fundamentals", "ratios", { symbol: s, period, limit }, M.RATIOS_FIELDS, s),
        get("fundamentals", "financial-growth", { symbol: s, period, limit }, M.GROWTH_FIELDS, s).catch((e) => {
          // growth is optional; keep metrics if only this endpoint fails
          if (e instanceof ProviderError && e.errorClass !== "auth") return [];
          throw e;
        }),
      ]);
      return M.mapProviderMetrics(s, period, km, ra, gr).map((m) =>
        sourced(m, prov("/stable/key-metrics+ratios+financial-growth", "provider_derived", m.asOf)),
      );
    },
  };

  // ── Estimates ─────────────────────────────────────────────────────
  const estimates: EstimatesProvider = {
    id: "fmp",
    async getEstimates(symbol, period, limit = 10) {
      const s = normalizeSymbol(symbol);
      const rows = await get("estimates", "analyst-estimates", { symbol: s, period, limit, page: 0 }, M.ESTIMATE_FIELDS, s);
      return rows
        .map((r) => M.mapEstimate(s, period, r))
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .map((e) => sourced(e, prov("/stable/analyst-estimates", "estimate", today())));
    },
    async getPriceTargetConsensus(symbol) {
      const s = normalizeSymbol(symbol);
      const rows = await get("estimates", "price-target-consensus", { symbol: s }, [], s);
      const t = rows[0] ? M.mapPriceTarget(s, rows[0]) : null;
      return t ? sourced(t, prov("/stable/price-target-consensus", "estimate", today())) : null;
    },
    async getRatingChanges(symbol, limit = 50) {
      const s = normalizeSymbol(symbol);
      const rows = await get("estimates", "grades", { symbol: s, limit }, [], s);
      return rows
        .map((r) => M.mapRatingChange(s, r))
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .map((g) => sourced(g, prov("/stable/grades", "reported", g.date)));
    },
  };

  // ── Company info ──────────────────────────────────────────────────
  const companyInfo: CompanyInfoProvider = {
    id: "fmp",
    async getProfile(symbol) {
      const s = normalizeSymbol(symbol);
      const rows = await get("company_info", "profile", { symbol: s }, M.PROFILE_FIELDS, s);
      const p = rows[0] ? M.mapProfile(rows[0]) : null;
      return p ? sourced(p, prov("/stable/profile", "reported", today())) : null;
    },
    async getPeers(symbol) {
      const s = normalizeSymbol(symbol);
      const rows = await get("company_info", "stock-peers", { symbol: s }, [], s);
      const peers = M.mapPeers(rows).filter((p) => p !== s);
      return sourced(peers, prov("/stable/stock-peers", "provider_derived", today()));
    },
    async getExecutives(symbol) {
      const s = normalizeSymbol(symbol);
      const rows = await get("company_info", "key-executives", { symbol: s }, [], s);
      const execs = rows.map(M.mapExecutive).filter((x): x is NonNullable<typeof x> => x !== null);
      return sourced(execs, prov("/stable/key-executives", "reported", today()));
    },
    async searchSymbols(query, limit = 10) {
      const q = query.trim();
      if (!q) return [];
      const rows = await get("company_info", "search-symbol", { query: q, limit });
      return rows.map(M.mapSearchResult).filter((x): x is NonNullable<typeof x> => x !== null);
    },
  };

  // ── Events ────────────────────────────────────────────────────────
  const events: EventsProvider = {
    id: "fmp",
    async getEarnings(symbol, limit = 12) {
      const s = normalizeSymbol(symbol);
      const rows = await get("events", "earnings", { symbol: s, limit }, [], s);
      return rows
        .map((r) => M.mapEarnings(r, s))
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .map((e) => sourced(e, prov("/stable/earnings", e.epsActual !== null ? "reported" : "estimate", e.date)));
    },
    async getEarningsCalendar(from, to) {
      const rows = await get("events", "earnings-calendar", { from, to });
      return rows
        .map((r) => M.mapEarnings(r))
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .map((e) => sourced(e, prov("/stable/earnings-calendar", e.epsActual !== null ? "reported" : "estimate", e.date)));
    },
    async getDividends(symbol) {
      const s = normalizeSymbol(symbol);
      const rows = await get("events", "dividends", { symbol: s }, [], s);
      return rows
        .map((r) => M.mapDividend(s, r))
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .map((d) => sourced(d, prov("/stable/dividends", "reported", d.exDate)));
    },
    async getSplits(symbol) {
      const s = normalizeSymbol(symbol);
      const rows = await get("events", "splits", { symbol: s }, [], s);
      return rows
        .map((r) => M.mapSplit(s, r))
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .map((d) => sourced(d, prov("/stable/splits", "reported", d.date)));
    },
    async getFilings(symbol, from, to) {
      const s = normalizeSymbol(symbol);
      const rows = await get("events", "sec-filings-search/symbol", { symbol: s, from, to, page: 0, limit: 100 }, [], s);
      return rows
        .map((r) => M.mapFiling(s, r))
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .map((f) => sourced(f, prov("/stable/sec-filings-search/symbol", "reported", f.filedAt)));
    },
  };

  // ── News ──────────────────────────────────────────────────────────
  const news: NewsProvider = {
    id: "fmp",
    async getNews(symbols, o = {}) {
      const syms = [...new Set(symbols.map(normalizeSymbol))];
      if (!syms.length) return [];
      const rows = await get("news", "news/stock", { symbols: syms.join(","), from: o.from, to: o.to, limit: o.limit ?? 50, page: 0 });
      return rows
        .map(M.mapNews)
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .map((n) => sourced(n, prov("/stable/news/stock", "reported", n.publishedAt)));
    },
  };

  // ── Insider / institutional ───────────────────────────────────────
  const insider: InsiderDataProvider = {
    id: "fmp",
    async getInsiderTransactions(symbol, limit = 100) {
      const s = normalizeSymbol(symbol);
      const rows = await get("insider", "insider-trading/search", { symbol: s, page: 0, limit }, [], s);
      return rows
        .map((r) => M.mapInsider(s, r))
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .map((t) => sourced(t, prov("/stable/insider-trading/search", "reported", t.transactionDate)));
    },
    async getInstitutionalOwnership(symbol) {
      const s = normalizeSymbol(symbol);
      const { year, quarter } = M.latestReportedQuarter(now());
      const rows = await get("insider", "institutional-ownership/symbol-positions-summary", { symbol: s, year, quarter }, [], s);
      const o = rows[0] ? M.mapInstitutional(s, rows[0]) : null;
      return o ? sourced(o, prov("/stable/institutional-ownership/symbol-positions-summary", "reported", o.reportDate)) : null;
    },
  };

  return {
    id: "fmp",
    market_data: market,
    fundamentals,
    estimates,
    company_info: companyInfo,
    events,
    news,
    insider,
  };
}
