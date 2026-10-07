/**
 * Data loading for portfolio analytics. Works with either the RLS-scoped
 * user client (dashboard) or the service-role client (jobs).
 * PostgREST caps responses (default 1000 rows), so price history is paged.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatedValue } from "@/lib/calc/series";
import type { SnapshotPoint } from "./portfolio";

const PAGE = 1000;

export async function loadCloses(db: SupabaseClient, symbols: string[], fromDate: string): Promise<Record<string, DatedValue[]>> {
  const uniq = [...new Set(symbols)];
  if (!uniq.length) return {};
  const { data: cos, error } = await db.from("companies").select("id, symbol").in("symbol", uniq);
  if (error) throw new Error(error.message);
  const out: Record<string, DatedValue[]> = {};
  await Promise.all(
    (cos ?? []).map(async (c) => {
      const rows: DatedValue[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error: e } = await db
          .from("security_prices")
          .select("price_date, close")
          .eq("company_id", c.id)
          .gte("price_date", fromDate)
          .order("price_date")
          .range(from, from + PAGE - 1);
        if (e) throw new Error(e.message);
        for (const r of data ?? []) rows.push({ date: r.price_date as string, value: Number(r.close) });
        if (!data || data.length < PAGE) break;
      }
      out[c.symbol as string] = rows;
    }),
  );
  return out;
}

/** Latest market date = latest SPY close we hold (null when no prices yet). */
export async function latestMarketDate(db: SupabaseClient): Promise<string | null> {
  const { data } = await db
    .from("security_prices")
    .select("price_date, companies!inner(symbol)")
    .eq("companies.symbol", "SPY")
    .order("price_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.price_date as string | undefined) ?? null;
}

export async function loadPortfolioSnapshots(db: SupabaseClient, userId: string, fromDate?: string): Promise<SnapshotPoint[]> {
  let q = db
    .from("portfolio_daily_snapshots")
    .select("snapshot_date, total_value, net_external_flow, daily_return")
    .eq("user_id", userId)
    .is("account_id", null)
    .order("snapshot_date");
  if (fromDate) q = q.gte("snapshot_date", fromDate);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    date: r.snapshot_date as string,
    totalValue: Number(r.total_value),
    netFlow: Number(r.net_external_flow),
    dailyReturn: r.daily_return === null ? null : Number(r.daily_return),
  }));
}

export function isoDaysAgo(date: string, days: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
