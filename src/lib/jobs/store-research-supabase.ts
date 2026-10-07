import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResearchStore, ResearchTarget } from "./refresh-research";
import { supabaseMarketStore } from "./store-market-supabase";

const chunk = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Page through a PostgREST select (1000-row server limit). `make` must apply a stable order. */
export async function selectAll<T>(make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, page = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await make(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

export function supabaseResearchStore(db: SupabaseClient): ResearchStore {
  const market = supabaseMarketStore(db);
  return {
    ensureCompanies: market.ensureCompanies,
    upsertQuotes: market.upsertQuotes,
    upsertBars: market.upsertBars,
    upsertProfile: market.upsertProfile,

    async getCapability(capability) {
      const { data, error } = await db.from("provider_capabilities").select("available, checked_at").eq("provider", "fmp").eq("capability", capability).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { available: data.available as boolean, checkedAt: data.checked_at as string } : null;
    },

    async setCapability(capability, available, detail) {
      const { error } = await db
        .from("provider_capabilities")
        .upsert({ provider: "fmp", capability, available, detail: detail ?? null, checked_at: new Date().toISOString() }, { onConflict: "provider,capability" });
      if (error) throw new Error(error.message);
    },

    async setUniverse(symbols, tag) {
      const ids = await market.ensureCompanies(symbols);
      const keep = [...ids.values()];
      for (const part of chunk(keep, 300)) {
        const { error } = await db.from("companies").update({ in_universe: true, universe_tags: [tag] }).in("id", part);
        if (error) throw new Error(error.message);
      }
      // members that left the index stay in the database (history) but leave the universe
      const current = await selectAll<{ id: string }>((a, b) => db.from("companies").select("id").eq("in_universe", true).order("id").range(a, b));
      const keepSet = new Set(keep);
      const drop = current.map((r) => r.id).filter((id) => !keepSet.has(id));
      for (const part of chunk(drop, 300)) {
        const { error } = await db.from("companies").update({ in_universe: false, universe_tags: [] }).in("id", part);
        if (error) throw new Error(error.message);
      }
      return keep.length;
    },

    async listTargets() {
      const [universe, held] = await Promise.all([
        selectAll<Record<string, unknown>>((a, b) =>
          db.from("companies").select("id, symbol, security_type, in_universe, fetched_at, fundamentals_fetched_at, estimates_fetched_at").eq("in_universe", true).order("symbol").range(a, b),
        ),
        selectAll<{ symbol: string }>((a, b) => db.from("portfolio_holdings").select("symbol").gt("quantity", 0).order("symbol").range(a, b)),
      ]);
      const heldSymbols = [...new Set(held.map((h) => h.symbol.toUpperCase()))];
      const heldIds = heldSymbols.length ? await market.ensureCompanies(heldSymbols) : new Map<string, string>();
      const heldRows = heldIds.size
        ? (await db.from("companies").select("id, symbol, security_type, in_universe, fetched_at, fundamentals_fetched_at, estimates_fetched_at").in("id", [...heldIds.values()])).data ?? []
        : [];
      const bySymbol = new Map<string, ResearchTarget>();
      for (const r of [...universe, ...heldRows] as Record<string, unknown>[]) {
        const symbol = r.symbol as string;
        bySymbol.set(symbol, {
          id: r.id as string,
          symbol,
          securityType: (r.security_type as string) ?? null,
          held: heldIds.has(symbol),
          inUniverse: Boolean(r.in_universe),
          profileFetchedAt: (r.fetched_at as string) ?? null,
          fundamentalsFetchedAt: (r.fundamentals_fetched_at as string) ?? null,
          estimatesFetchedAt: (r.estimates_fetched_at as string) ?? null,
        });
      }
      return [...bySymbol.values()];
    },

    async latestPriceDates(ids) {
      const out = new Map<string, string>();
      for (const part of chunk(ids, 500)) {
        const { data, error } = await db.rpc("latest_price_dates", { p_ids: part });
        if (error) throw new Error(error.message);
        for (const r of (data ?? []) as { company_id: string; last_date: string }[]) out.set(r.company_id, r.last_date);
      }
      return out;
    },

    async upsertStatements(companyId, rows, jobRunId) {
      if (!rows.length) return 0;
      const { error } = await db.from("financial_statements").upsert(
        rows.map(({ data: s, provenance: p }) => ({
          company_id: companyId,
          statement_type: s.type,
          period: s.period,
          fiscal_year: s.fiscalYear,
          fiscal_quarter: s.fiscalQuarter,
          period_end: s.periodEnd,
          filed_at: s.filedAt,
          currency: s.currency,
          line_items: s.lineItems,
          data_kind: p.dataKind,
          source_provider: p.provider,
          source_ref: p.sourceRef,
          fetched_at: p.fetchedAt,
          ingested_job_id: jobRunId,
        })),
        { onConflict: "company_id,statement_type,period,period_end,source_provider" },
      );
      if (error) throw new Error(error.message);
      return rows.length;
    },

    async markFundamentalsFetched(companyId) {
      const { error } = await db.from("companies").update({ fundamentals_fetched_at: new Date().toISOString() }).eq("id", companyId);
      if (error) throw new Error(error.message);
    },

    async upsertEstimates(companyId, rows, snapshotDate, jobRunId) {
      if (!rows.length) return 0;
      const { error } = await db.from("analyst_estimates").upsert(
        rows.map(({ data: e, provenance: p }) => ({
          company_id: companyId,
          period: e.period,
          fiscal_period_end: e.fiscalPeriodEnd,
          snapshot_date: snapshotDate,
          revenue_avg: e.revenueAvg,
          revenue_low: e.revenueLow,
          revenue_high: e.revenueHigh,
          ebitda_avg: e.ebitdaAvg,
          net_income_avg: e.netIncomeAvg,
          eps_avg: e.epsAvg,
          eps_low: e.epsLow,
          eps_high: e.epsHigh,
          num_analysts_revenue: e.numAnalystsRevenue,
          num_analysts_eps: e.numAnalystsEps,
          data_kind: "estimate",
          source_provider: p.provider,
          source_ref: p.sourceRef,
          fetched_at: p.fetchedAt,
          ingested_job_id: jobRunId,
        })),
        { onConflict: "company_id,period,fiscal_period_end,snapshot_date,source_provider" },
      );
      if (error) throw new Error(error.message);
      return rows.length;
    },

    async upsertPriceTarget(companyId, { data: t, provenance: p }, snapshotDate, jobRunId) {
      const { error } = await db.from("price_targets").upsert(
        {
          company_id: companyId,
          snapshot_date: snapshotDate,
          target_high: t.targetHigh,
          target_low: t.targetLow,
          target_mean: t.targetMean,
          target_median: t.targetMedian,
          num_analysts: t.numAnalysts,
          data_kind: "estimate",
          source_provider: p.provider,
          fetched_at: p.fetchedAt,
          ingested_job_id: jobRunId,
        },
        { onConflict: "company_id,snapshot_date,source_provider" },
      );
      if (error) throw new Error(error.message);
    },

    async markEstimatesFetched(companyId) {
      const { error } = await db.from("companies").update({ estimates_fetched_at: new Date().toISOString() }).eq("id", companyId);
      if (error) throw new Error(error.message);
    },
  };
}
