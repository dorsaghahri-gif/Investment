/**
 * Job: daily portfolio snapshot + analytics metrics for every user.
 * Runs after refresh-prices. Uses the service role (writes owner-read-only
 * tables); every row is keyed by user_id so RLS isolation is preserved.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSnapshot, computePortfolioAnalytics, ANALYTICS_VERSION, type SnapshotPosition } from "@/lib/analytics/portfolio";
import { isoDaysAgo, latestMarketDate, loadCloses, loadPortfolioSnapshots } from "@/lib/analytics/load";
import type { JobContext } from "./runner";

type HoldingRow = { user_id: string; symbol: string; quantity: number; cost_basis_total: number | null; companies: unknown };

export function riskFreeRateFromEnv(): number | null {
  const v = process.env.RISK_FREE_RATE;
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > -0.05 && n < 0.25 ? n : null;
}

export async function runPortfolioSnapshots(ctx: JobContext, db: SupabaseClient) {
  const marketDate = await latestMarketDate(db);
  if (!marketDate) throw new Error("No benchmark (SPY) prices stored yet — run refresh-prices first.");

  const [{ data: holdings, error: hErr }, { data: accounts, error: aErr }] = await Promise.all([
    db.from("portfolio_holdings").select("user_id, symbol, quantity, cost_basis_total, companies(sector, industry, security_type, asset_class)"),
    db.from("accounts").select("user_id, cash_balance").eq("is_archived", false),
  ]);
  if (hErr) throw new Error(hErr.message);
  if (aErr) throw new Error(aErr.message);

  const users = new Set<string>([...(holdings ?? []).map((h) => h.user_id as string), ...(accounts ?? []).map((a) => a.user_id as string)]);
  ctx.setItemsTotal(users.size);
  const from = isoDaysAgo(marketDate, 400);
  const allSymbols = [...new Set((holdings ?? []).map((h) => h.symbol as string)), "SPY", "QQQ"];
  const closes = await loadCloses(db, allSymbols, from);
  const rf = riskFreeRateFromEnv();

  await ctx.forEachIsolated([...users], 2, (u) => `user:${u.slice(0, 8)}`, async (userId) => {
    // aggregate across accounts by symbol
    const agg = new Map<string, { qty: number; cost: number | null; meta: Record<string, string | null> }>();
    for (const h of (holdings ?? []) as HoldingRow[]) {
      if (h.user_id !== userId) continue;
      const meta = (Array.isArray(h.companies) ? h.companies[0] : h.companies) as Record<string, string | null> | null;
      const cur = agg.get(h.symbol) ?? { qty: 0, cost: 0 as number | null, meta: meta ?? {} };
      cur.qty += Number(h.quantity);
      cur.cost = cur.cost === null || h.cost_basis_total === null ? null : cur.cost + Number(h.cost_basis_total);
      agg.set(h.symbol, cur);
    }
    const cash = (accounts ?? []).filter((a) => a.user_id === userId).reduce((s, a) => s + Number(a.cash_balance), 0);

    const { data: prevRow } = await db
      .from("portfolio_daily_snapshots")
      .select("snapshot_date, total_value, positions")
      .eq("user_id", userId)
      .is("account_id", null)
      .lt("snapshot_date", marketDate)
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: flows } = await db
      .from("portfolio_transactions")
      .select("type, amount")
      .eq("user_id", userId)
      .eq("trade_date", marketDate)
      .in("type", ["deposit", "withdrawal", "dividend", "interest", "fee"]);
    const sum = (types: string[]) => (flows ?? []).filter((f) => types.includes(f.type as string)).reduce((s, f) => s + Number(f.amount), 0);

    const snap = buildSnapshot({
      snapshotDate: marketDate,
      holdings: [...agg.entries()].map(([symbol, v]) => ({ symbol, quantity: v.qty, costBasisTotal: v.cost })),
      cash,
      closes,
      previous: prevRow ? { totalValue: Number(prevRow.total_value), positions: prevRow.positions as SnapshotPosition[] } : null,
    });

    const { error: sErr } = await db.from("portfolio_daily_snapshots").upsert(
      {
        user_id: userId,
        account_id: null,
        snapshot_date: snap.snapshotDate,
        market_value: snap.marketValue,
        cash_value: snap.cashValue,
        total_value: snap.totalValue,
        cost_basis: snap.costBasis,
        net_external_flow: sum(["deposit", "withdrawal"]),
        dividends: sum(["dividend", "interest"]),
        fees: Math.abs(sum(["fee"])),
        daily_return: snap.dailyReturn,
        positions: snap.positions,
        price_staleness: snap.priceStaleness,
        calc_version: ANALYTICS_VERSION,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,account_key,snapshot_date" },
    );
    if (sErr) throw new Error(sErr.message);

    const snapshots = await loadPortfolioSnapshots(db, userId);
    const a = computePortfolioAnalytics({
      asOf: marketDate,
      holdings: [...agg.entries()].map(([symbol, v]) => ({
        symbol,
        quantity: v.qty,
        sector: v.meta.sector ?? null,
        industry: v.meta.industry ?? null,
        securityType: v.meta.security_type ?? null,
        assetClass: v.meta.asset_class ?? null,
      })),
      cash,
      closes,
      benchmarks: { SPY: closes.SPY ?? [], QQQ: closes.QQQ ?? [] },
      snapshots,
      riskFreeRate: rf,
    });

    const metric = (key: string, window: string, value: number | null, inputs: object, benchmark: string | null = null, unit = "ratio") => ({
      user_id: userId,
      snapshot_date: marketDate,
      metric_key: key,
      window_label: window,
      benchmark,
      value,
      unit,
      data_kind: "calculated",
      calc_version: ANALYTICS_VERSION,
      inputs,
    });
    const bt = { basis: "backtest", observations: a.risk.observations, note: a.risk.note };
    const rows = [
      metric("volatility_ann", "1y", a.risk.volatility.value, bt),
      metric("beta", "1y", a.risk.beta.value, bt, "SPY", "x"),
      metric("sharpe", "1y", a.risk.sharpe.value, { ...bt, riskFreeRate: rf }, null, "x"),
      metric("sortino", "1y", a.risk.sortino.value, { ...bt, riskFreeRate: rf }, null, "x"),
      metric("downside_deviation_ann", "1y", a.risk.downsideDeviation.value, bt),
      metric("max_drawdown", "1y", a.risk.maxDrawdown.value, bt),
      metric("hhi", "na", a.concentration.hhi.value, { basis: "actual" }),
      metric("top5_weight", "na", a.concentration.top5Weight.value, { basis: "actual" }),
      metric("twr", "ytd", a.performance.ytd.value, { basis: "actual", note: a.performance.ytd.note }),
      metric("twr", "tracking", a.performance.sinceTracking.value, { basis: "actual", note: a.performance.sinceTracking.note }),
      metric("benchmark_return", "ytd", a.benchmarks.SPY.ytd.value, { basis: "market" }, "SPY"),
    ];
    const { error: mErr } = await db.from("portfolio_metrics").upsert(rows, { onConflict: "user_id,snapshot_date,metric_key,window_label" });
    if (mErr) throw new Error(mErr.message);
    ctx.addRecords(1 + rows.length);
  });
}
