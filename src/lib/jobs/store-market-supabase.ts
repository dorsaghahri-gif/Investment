import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketStore } from "./refresh-prices";

const chunk = <T>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export function supabaseMarketStore(db: SupabaseClient): MarketStore {
  return {
    async listTrackedSymbols() {
      const [h, w] = await Promise.all([
        db.from("portfolio_holdings").select("symbol").gt("quantity", 0),
        db.from("watchlist_members").select("companies(symbol)").is("removed_at", null),
      ]);
      if (h.error) throw new Error(h.error.message);
      if (w.error) throw new Error(w.error.message);
      const out = new Set<string>();
      for (const r of h.data ?? []) out.add(String(r.symbol));
      for (const r of (w.data ?? []) as { companies: { symbol: string } | { symbol: string }[] | null }[]) {
        const c = Array.isArray(r.companies) ? r.companies[0] : r.companies;
        if (c?.symbol) out.add(c.symbol);
      }
      return [...out];
    },

    async ensureCompanies(symbols) {
      const map = new Map<string, string>();
      for (const part of chunk(symbols, 500)) {
        // insert-if-missing without clobbering existing profile fields
        const ins = await db
          .from("companies")
          .upsert(part.map((symbol) => ({ symbol })), { onConflict: "symbol", ignoreDuplicates: true });
        if (ins.error) throw new Error(ins.error.message);
        const sel = await db.from("companies").select("id, symbol").in("symbol", part);
        if (sel.error) throw new Error(sel.error.message);
        for (const r of sel.data ?? []) map.set(r.symbol as string, r.id as string);
      }
      return map;
    },

    async upsertQuotes(rows, jobRunId) {
      if (!rows.length) return 0;
      const { error } = await db.from("security_quotes").upsert(
        rows.map(({ companyId, quote: { data: q, provenance: p } }) => ({
          company_id: companyId,
          price: q.price,
          change: q.change,
          change_pct: q.changePct,
          previous_close: q.previousClose,
          open: q.open,
          day_high: q.dayHigh,
          day_low: q.dayLow,
          volume: q.volume,
          market_cap: q.marketCap,
          year_high: q.yearHigh,
          year_low: q.yearLow,
          currency: q.currency,
          quote_time: q.quoteTime,
          source_provider: p.provider,
          source_ref: p.sourceRef,
          fetched_at: p.fetchedAt,
          ingested_job_id: jobRunId,
        })),
        { onConflict: "company_id" },
      );
      if (error) throw new Error(error.message);
      return rows.length;
    },

    async lastPriceDates(companyIds) {
      const out = new Map<string, string>();
      // one small query per company keeps this simple and index-friendly
      await Promise.all(
        companyIds.map(async (id) => {
          const { data, error } = await db
            .from("security_prices")
            .select("price_date")
            .eq("company_id", id)
            .order("price_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (data?.price_date) out.set(id, data.price_date as string);
        }),
      );
      return out;
    },

    async upsertBars(companyId, { data: bars, provenance: p }, jobRunId) {
      let n = 0;
      for (const part of chunk(bars, 1000)) {
        const { error } = await db.from("security_prices").upsert(
          part.map((b) => ({
            company_id: companyId,
            price_date: b.date,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            adj_close: b.adjClose,
            volume: b.volume,
            vwap: b.vwap,
            source_provider: p.provider,
            source_ref: p.sourceRef,
            fetched_at: p.fetchedAt,
            ingested_job_id: jobRunId,
          })),
          { onConflict: "company_id,price_date" },
        );
        if (error) throw new Error(error.message);
        n += part.length;
      }
      return n;
    },

    async symbolsNeedingProfile(symbols, maxAgeDays) {
      const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
      const { data, error } = await db
        .from("companies")
        .select("symbol, fetched_at, name")
        .in("symbol", symbols)
        .or(`fetched_at.is.null,fetched_at.lt.${cutoff},name.is.null`);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.symbol as string);
    },

    async upsertProfile({ data: c, provenance: p }) {
      const { error } = await db
        .from("companies")
        .update({
          name: c.name,
          security_type: c.securityType,
          asset_class: c.securityType === "cash" ? "cash" : "equity",
          exchange: c.exchange,
          currency: c.currency,
          country: c.country,
          sector: c.sector,
          industry: c.industry,
          description: c.description,
          website: c.website,
          cik: c.cik,
          isin: c.isin,
          cusip: c.cusip,
          ipo_date: c.ipoDate,
          employees: c.employees,
          is_active: c.isActivelyTrading ?? true,
          source_provider: p.provider,
          source_ref: p.sourceRef,
          fetched_at: p.fetchedAt,
        })
        .eq("symbol", c.symbol);
      if (error) throw new Error(error.message);
    },
  };
}
