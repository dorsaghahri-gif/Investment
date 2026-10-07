import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listAccounts, listHoldings } from "@/lib/portfolio/repository";
import { valuePortfolio } from "@/lib/portfolio/valuation";
import { riskFreeRateFromEnv } from "@/lib/jobs/portfolio-snapshots";
import { computePortfolioAnalytics } from "./portfolio";
import { isoDaysAgo, latestMarketDate, loadCloses, loadPortfolioSnapshots } from "./load";

/** Everything the Command Center needs, computed on request from stored data (no provider calls). */
export async function getDashboardData(ownerId: string) {
  const db = await createSupabaseServerClient();
  const [accounts, holdings, marketDate] = await Promise.all([listAccounts(ownerId), listHoldings(ownerId), latestMarketDate(db)]);
  const cash = accounts.reduce((s, a) => s + a.cash_balance, 0);
  const live = valuePortfolio(holdings, cash);
  if (!marketDate) return { live, accounts, holdings, analytics: null, snapshots: [], closes: {} as Record<string, { date: string; value: number }[]>, marketDate: null };

  const agg = new Map<string, (typeof holdings)[number] & { qty: number }>();
  for (const h of holdings) {
    const cur = agg.get(h.symbol);
    agg.set(h.symbol, cur ? { ...cur, qty: cur.qty + h.quantity } : { ...h, qty: h.quantity });
  }
  const { data: meta } = await db.from("companies").select("symbol, industry, asset_class").in("symbol", [...agg.keys()]);
  const metaBy = new Map((meta ?? []).map((m) => [m.symbol as string, m]));

  const [closes, snapshots] = await Promise.all([loadCloses(db, [...agg.keys(), "SPY", "QQQ"], isoDaysAgo(marketDate, 400)), loadPortfolioSnapshots(db, ownerId)]);
  const analytics = computePortfolioAnalytics({
    asOf: marketDate,
    holdings: [...agg.values()].map((h) => ({
      symbol: h.symbol,
      quantity: h.qty,
      sector: h.sector,
      industry: (metaBy.get(h.symbol)?.industry as string | null) ?? null,
      securityType: h.securityType,
      assetClass: (metaBy.get(h.symbol)?.asset_class as string | null) ?? null,
    })),
    cash,
    closes,
    benchmarks: { SPY: closes.SPY ?? [], QQQ: closes.QQQ ?? [] },
    snapshots,
    riskFreeRate: riskFreeRateFromEnv(),
  });
  return { live, accounts, holdings, analytics, snapshots, closes, marketDate };
}
