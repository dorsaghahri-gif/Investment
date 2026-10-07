/**
 * Job: refresh quotes, daily price history and stale company profiles for
 * every tracked symbol (holdings ∪ watchlists ∪ benchmarks).
 * Provider-agnostic: receives normalized providers from the registry.
 */
import type { Sourced } from "@/lib/domain/provenance";
import type { PriceBar, Quote } from "@/lib/domain/market";
import type { CompanyProfile } from "@/lib/domain/research";
import type { CompanyInfoProvider, MarketDataProvider } from "@/lib/providers/interfaces";
import type { JobContext } from "./runner";

export const BENCHMARK_SYMBOLS = ["SPY", "QQQ"] as const;
export const DEFAULT_HISTORY_YEARS = 5;
const PROFILE_MAX_AGE_DAYS = 14;

export interface MarketStore {
  listTrackedSymbols(): Promise<string[]>;
  /** Ensures a companies row exists for each symbol; returns symbol → id. */
  ensureCompanies(symbols: string[]): Promise<Map<string, string>>;
  upsertQuotes(rows: { companyId: string; quote: Sourced<Quote> }[], jobRunId: string): Promise<number>;
  lastPriceDates(companyIds: string[]): Promise<Map<string, string>>;
  upsertBars(companyId: string, bars: Sourced<PriceBar[]>, jobRunId: string): Promise<number>;
  symbolsNeedingProfile(symbols: string[], maxAgeDays: number): Promise<string[]>;
  upsertProfile(profile: Sourced<CompanyProfile>, jobRunId: string): Promise<void>;
}

export interface RefreshPricesDeps {
  store: MarketStore;
  market: MarketDataProvider;
  companyInfo: CompanyInfoProvider;
  today: string; // YYYY-MM-DD
  historyYears?: number;
  /** Restrict to these symbols (on-demand refresh); default = all tracked. */
  symbols?: string[];
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function refreshPrices(ctx: JobContext, deps: RefreshPricesDeps): Promise<void> {
  const { store, market, companyInfo, today } = deps;
  const tracked = deps.symbols ?? (await store.listTrackedSymbols());
  const symbols = [...new Set([...tracked, ...(deps.symbols ? [] : BENCHMARK_SYMBOLS)].map((s) => s.toUpperCase()))].sort();
  ctx.setItemsTotal(symbols.length);
  if (!symbols.length) return;

  const ids = await store.ensureCompanies(symbols);

  // 1) Quotes — batched; a batch failure is recorded per symbol in that batch.
  try {
    const quotes = await market.getQuotes(symbols);
    const rows = quotes.filter((q) => ids.has(q.data.symbol)).map((q) => ({ companyId: ids.get(q.data.symbol)!, quote: q }));
    ctx.addRecords(await store.upsertQuotes(rows, ctx.runId));
    const got = new Set(quotes.map((q) => q.data.symbol));
    for (const s of symbols) if (!got.has(s)) ctx.recordFailure(`quote:${s}`, new Error("No quote returned"));
  } catch (e) {
    for (const s of symbols) ctx.recordFailure(`quote:${s}`, e);
  }

  // 2) Daily bars — incremental from the last stored date.
  const last = await store.lastPriceDates([...ids.values()]);
  const years = deps.historyYears ?? DEFAULT_HISTORY_YEARS;
  await ctx.forEachIsolated(
    symbols,
    4,
    (s) => `bars:${s}`,
    async (s) => {
      const id = ids.get(s)!;
      const lastDate = last.get(id);
      // re-fetch the last stored day too, so late corrections are captured as revisions
      const from = lastDate ?? addDays(today, -Math.round(years * 365.25));
      if (from > today) return;
      const bars = await market.getDailyBars(s, from, today);
      ctx.addRecords(await store.upsertBars(id, bars, ctx.runId));
    },
  );

  // 3) Profiles that are missing or older than PROFILE_MAX_AGE_DAYS.
  const needProfile = await store.symbolsNeedingProfile(symbols, PROFILE_MAX_AGE_DAYS);
  await ctx.forEachIsolated(
    needProfile,
    4,
    (s) => `profile:${s}`,
    async (s) => {
      const p = await companyInfo.getProfile(s);
      if (!p) throw new Error("No profile returned");
      await store.upsertProfile(p, ctx.runId);
      ctx.addRecords(1);
    },
  );
}
