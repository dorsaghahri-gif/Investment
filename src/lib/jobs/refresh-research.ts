/**
 * Job: keep the research universe's raw data current, within a time budget.
 * Order of work (each step yields when the budget runs out; the next run resumes
 * because selection is always "stalest first"):
 *   1. universe membership (weekly)  2. quotes  3. profiles  4. price history
 *   5. annual statements (monthly)    6. analyst estimates/targets (weekly, plan-dependent)
 * Provider-agnostic: uses normalized providers; plan-restricted endpoints are
 * remembered in provider_capabilities and skipped for a week.
 */
import type { Sourced } from "@/lib/domain/provenance";
import type { FinancialStatement, StatementType } from "@/lib/domain/fundamentals";
import type { AnalystEstimate, PriceTargetConsensus } from "@/lib/domain/research";
import type { CompanyInfoProvider, EstimatesProvider, FundamentalsProvider, MarketDataProvider } from "@/lib/providers/interfaces";
import { isProviderError } from "@/lib/providers/errors";
import { FALLBACK_UNIVERSE, UNIVERSE_SYNC_DAYS } from "@/lib/research/universe";
import type { MarketStore } from "./refresh-prices";
import { addDays } from "./refresh-prices";
import type { JobContext } from "./runner";

export const STATEMENT_YEARS = 6;
export const FUNDAMENTALS_MAX_AGE_DAYS = 30;
export const ESTIMATES_MAX_AGE_DAYS = 7;
export const PROFILE_MAX_AGE_DAYS = 30;
export const UNIVERSE_HISTORY_DAYS = 400;
export const CAPABILITY_RECHECK_DAYS = 7;

export interface ResearchTarget {
  id: string;
  symbol: string;
  securityType: string | null;
  held: boolean;
  inUniverse: boolean;
  profileFetchedAt: string | null;
  fundamentalsFetchedAt: string | null;
  estimatesFetchedAt: string | null;
}

export interface ResearchStore extends Pick<MarketStore, "ensureCompanies" | "upsertQuotes" | "upsertBars" | "upsertProfile"> {
  getCapability(capability: string): Promise<{ available: boolean; checkedAt: string } | null>;
  setCapability(capability: string, available: boolean, detail?: string): Promise<void>;
  setUniverse(symbols: string[], tag: string): Promise<number>;
  listTargets(): Promise<ResearchTarget[]>;
  latestPriceDates(ids: string[]): Promise<Map<string, string>>;
  upsertStatements(companyId: string, rows: Sourced<FinancialStatement>[], jobRunId: string): Promise<number>;
  markFundamentalsFetched(companyId: string): Promise<void>;
  upsertEstimates(companyId: string, rows: Sourced<AnalystEstimate>[], snapshotDate: string, jobRunId: string): Promise<number>;
  upsertPriceTarget(companyId: string, row: Sourced<PriceTargetConsensus>, snapshotDate: string, jobRunId: string): Promise<void>;
  markEstimatesFetched(companyId: string): Promise<void>;
}

export interface RefreshResearchDeps {
  store: ResearchStore;
  market: MarketDataProvider;
  companyInfo: CompanyInfoProvider;
  fundamentals: FundamentalsProvider;
  estimates: EstimatesProvider;
  today: string;
  /** Wall-clock budget in ms; work stops being scheduled after it. */
  budgetMs: number;
  now?: () => number;
}

export interface ResearchProgress {
  universe: { synced: boolean; source: string | null; size: number };
  pending: { profiles: number; prices: number; fundamentals: number; estimates: number };
  done: { profiles: number; prices: number; fundamentals: number; estimates: number };
}

const isPlanRestricted = (e: unknown) => isProviderError(e) && e.errorClass === "plan_restricted";
const olderThan = (iso: string | null, days: number, nowMs: number) => !iso || nowMs - Date.parse(iso) > days * 86_400_000;
const isStock = (t: ResearchTarget) => t.securityType === "stock" || t.securityType === "adr";

export async function refreshResearch(ctx: JobContext, deps: RefreshResearchDeps): Promise<ResearchProgress> {
  const { store, today } = deps;
  const now = deps.now ?? (() => Date.now());
  const deadline = now() + deps.budgetMs;
  const timeLeft = () => now() < deadline;
  const progress: ResearchProgress = {
    universe: { synced: false, source: null, size: 0 },
    pending: { profiles: 0, prices: 0, fundamentals: 0, estimates: 0 },
    done: { profiles: 0, prices: 0, fundamentals: 0, estimates: 0 },
  };

  // 1) Universe membership (weekly)
  const sync = await store.getCapability("universe_sync");
  if (!sync || olderThan(sync.checkedAt, UNIVERSE_SYNC_DAYS, now())) {
    const idx = await store.getCapability("index_sp500");
    let symbols: string[] | null = null;
    let tag = "sp500";
    if (!idx || idx.available || olderThan(idx.checkedAt, CAPABILITY_RECHECK_DAYS, now())) {
      try {
        const res = await deps.companyInfo.getIndexConstituents("sp500");
        if (res.data.length >= 100) {
          symbols = res.data.map((c) => c.symbol);
          await store.setCapability("index_sp500", true);
        }
      } catch (e) {
        if (isPlanRestricted(e)) await store.setCapability("index_sp500", false, "Not included in the current data plan");
        else ctx.recordFailure("universe:sp500", e);
      }
    }
    if (!symbols) {
      symbols = [...FALLBACK_UNIVERSE];
      tag = "core100";
    }
    progress.universe.size = await store.setUniverse(symbols, tag);
    progress.universe.source = tag;
    progress.universe.synced = true;
    await store.setCapability("universe_sync", true, `${tag}:${symbols.length}`);
  }

  const targets = await store.listTargets();
  ctx.setItemsTotal(targets.length);
  if (!targets.length) return progress;
  const priority = (t: ResearchTarget) => (t.held ? 0 : 1);

  // 2) Quotes for everything (batched by the provider; cheap)
  if (timeLeft()) {
    const bySymbol = new Map(targets.map((t) => [t.symbol, t.id]));
    try {
      const quotes = await deps.market.getQuotes(targets.map((t) => t.symbol));
      const rows = quotes.filter((q) => bySymbol.has(q.data.symbol)).map((q) => ({ companyId: bySymbol.get(q.data.symbol)!, quote: q }));
      ctx.addRecords(await store.upsertQuotes(rows, ctx.runId));
    } catch (e) {
      ctx.recordFailure("quotes:universe", e);
    }
  }

  // 3) Profiles (needed to know stock vs fund, sector and industry)
  const needProfile = targets.filter((t) => olderThan(t.profileFetchedAt, PROFILE_MAX_AGE_DAYS, now())).sort((a, b) => priority(a) - priority(b));
  progress.pending.profiles = needProfile.length;
  await ctx.forEachIsolated(needProfile, 6, (t) => `profile:${t.symbol}`, async (t) => {
    if (!timeLeft()) return;
    const p = await deps.companyInfo.getProfile(t.symbol);
    if (!p) throw new Error("No profile returned");
    await store.upsertProfile(p, ctx.runId);
    t.securityType = p.data.securityType;
    progress.done.profiles++;
    ctx.addRecords(1);
  });

  // 4) Price history for universe stocks (held symbols are covered by refresh-prices)
  const priceTargets = targets.filter((t) => t.inUniverse && !t.held && isStock(t));
  const last = await store.latestPriceDates(priceTargets.map((t) => t.id));
  const yesterday = addDays(today, -1);
  const needPrices = priceTargets
    .filter((t) => !last.has(t.id) || last.get(t.id)! < yesterday)
    .sort((a, b) => (last.get(a.id) ?? "") .localeCompare(last.get(b.id) ?? ""));
  progress.pending.prices = needPrices.length;
  await ctx.forEachIsolated(needPrices, 6, (t) => `bars:${t.symbol}`, async (t) => {
    if (!timeLeft()) return;
    const from = last.get(t.id) ?? addDays(today, -UNIVERSE_HISTORY_DAYS);
    const bars = await deps.market.getDailyBars(t.symbol, from, today);
    ctx.addRecords(await store.upsertBars(t.id, bars, ctx.runId));
    progress.done.prices++;
  });

  // 5) Annual statements (stocks only; held first, then never-fetched, then oldest)
  const needFund = targets
    .filter((t) => isStock(t) && olderThan(t.fundamentalsFetchedAt, FUNDAMENTALS_MAX_AGE_DAYS, now()))
    .sort((a, b) => priority(a) - priority(b) || (a.fundamentalsFetchedAt ?? "").localeCompare(b.fundamentalsFetchedAt ?? ""));
  progress.pending.fundamentals = needFund.length;
  const types: StatementType[] = ["income", "balance", "cash_flow"];
  await ctx.forEachIsolated(needFund, 4, (t) => `fundamentals:${t.symbol}`, async (t) => {
    if (!timeLeft()) return;
    let n = 0;
    for (const type of types) {
      const rows = await deps.fundamentals.getStatements(t.symbol, type, "annual", STATEMENT_YEARS);
      n += await store.upsertStatements(t.id, rows, ctx.runId);
    }
    await store.markFundamentalsFetched(t.id);
    ctx.addRecords(n);
    progress.done.fundamentals++;
  });

  // 6) Analyst estimates & price targets (skipped while the plan doesn't include them)
  const capOk = async (cap: string) => {
    const c = await store.getCapability(cap);
    return !c || c.available || olderThan(c.checkedAt, CAPABILITY_RECHECK_DAYS, now());
  };
  let estimatesOk = await capOk("estimates");
  let targetsOk = await capOk("price_target_consensus");
  if (estimatesOk || targetsOk) {
    const needEst = targets
      .filter((t) => isStock(t) && olderThan(t.estimatesFetchedAt, ESTIMATES_MAX_AGE_DAYS, now()))
      .sort((a, b) => priority(a) - priority(b) || (a.estimatesFetchedAt ?? "").localeCompare(b.estimatesFetchedAt ?? ""));
    progress.pending.estimates = needEst.length;
    // probe sequentially first so a restricted plan costs one call, not hundreds
    await ctx.forEachIsolated(needEst, 4, (t) => `estimates:${t.symbol}`, async (t) => {
      if (!timeLeft() || (!estimatesOk && !targetsOk)) return;
      if (estimatesOk) {
        try {
          const rows = await deps.estimates.getEstimates(t.symbol, "annual", 4);
          ctx.addRecords(await store.upsertEstimates(t.id, rows, today, ctx.runId));
          await store.setCapability("estimates", true);
        } catch (e) {
          if (isPlanRestricted(e)) {
            estimatesOk = false;
            await store.setCapability("estimates", false, "Not included in the current data plan");
          } else throw e;
        }
      }
      if (targetsOk) {
        try {
          const pt = await deps.estimates.getPriceTargetConsensus(t.symbol);
          if (pt) await store.upsertPriceTarget(t.id, pt, today, ctx.runId);
          await store.setCapability("price_target_consensus", true);
        } catch (e) {
          if (isPlanRestricted(e)) {
            targetsOk = false;
            await store.setCapability("price_target_consensus", false, "Not included in the current data plan");
          } else throw e;
        }
      }
      await store.markEstimatesFetched(t.id);
      progress.done.estimates++;
    });
  }

  return progress;
}
