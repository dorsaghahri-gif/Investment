import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getDashboardData } from "@/lib/analytics/dashboard";
import { getDataFreshness } from "@/lib/ops/freshness";
import { listRecommendations } from "@/lib/research/queries";
import { RatingBadge } from "@/components/research/rating";
import type { Metric } from "@/lib/analytics/portfolio";
import { formatMoney, formatNumber, formatPct, formatSignedMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataAsOf, ProvenanceTag, Value, toneOf } from "@/components/data/provenance";
import { ComparisonChart, ValueChart } from "@/components/charts/performance-panel";
import { AllocationPanel } from "@/components/charts/allocation-panel";
import { CorrelationHeatmap } from "@/components/charts/heatmap";
import type { DataKind } from "@/lib/domain/provenance";

export const metadata: Metadata = { title: "Dashboard" };

const BASIS_LABEL: Record<Metric["basis"], string> = { actual: "Actual", backtest: "Backtest", market: "Market" };

function Kpi({ label, text, sub, tone, kind = "calculated", note, basis }: { label: string; text: string; sub?: string; tone?: "positive" | "negative" | null; kind?: DataKind; note?: string; basis?: Metric["basis"] }) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-3 py-2.5" title={note}>
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <ProvenanceTag kind={kind} />
      </div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight"><Value text={text} tone={tone} /></div>
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {basis && <span>{BASIS_LABEL[basis]}</span>}
        {sub && <span className="truncate">{sub}</span>}
        {note && <Info className="size-3 shrink-0" aria-label={note} />}
      </div>
    </div>
  );
}

function Planned({ title, phase, text }: { title: string; phase: number; text: string }) {
  return (
    <Card className="border-dashed">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge variant="secondary">Phase {phase}</Badge>
      </CardHeader>
      <CardContent><p className="text-xs text-muted-foreground">{text}</p></CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [{ live, holdings, analytics: a, snapshots, closes, marketDate }, freshness, recs] = await Promise.all([
    getDashboardData(user.id),
    getDataFreshness().catch(() => []),
    listRecommendations(user.id).catch(() => []),
  ]);
  const heldRecs = recs.filter((r) => r.portfolioImpact.held);
  const needsAttention = heldRecs.filter((r) => r.rating === "reduce" || r.rating === "avoid");
  const addable = heldRecs.filter((r) => r.rating === "buy" || r.rating === "strong_buy");
  const newIdeas = recs.filter((r) => !r.portfolioImpact.held && (r.rating === "buy" || r.rating === "strong_buy")).length;
  const quotes = freshness.find((f) => f.dataset === "quotes");

  if (holdings.length === 0 && live.cash === 0) {
    return (
      <Card className="mx-auto mt-10 max-w-lg">
        <CardContent className="space-y-3 pt-6 text-center">
          <h1 className="text-lg font-semibold">Welcome to your Command Center</h1>
          <p className="text-sm text-muted-foreground">Add your accounts and holdings to see portfolio value, risk, allocation and benchmarks.</p>
          <div className="flex justify-center gap-2">
            <Button asChild><Link href="/portfolio">Add holdings</Link></Button>
            <Button asChild variant="outline"><Link href="/settings/dna">Set Investment DNA</Link></Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const movers = live.holdings.filter((h) => h.dayChange !== null).sort((x, y) => (y.dayChange ?? 0) - (x.dayChange ?? 0));
  const contributors = movers.filter((h) => (h.dayChange ?? 0) > 0).slice(0, 5);
  const detractors = movers.filter((h) => (h.dayChange ?? 0) < 0).slice(-5).reverse();
  const biggestPct = live.holdings.filter((h) => h.changePct !== null).sort((x, y) => Math.abs(y.changePct!) - Math.abs(x.changePct!)).slice(0, 5);
  const valuePoints = snapshots.map((s) => ({ date: s.date, value: s.totalValue }));

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">My portfolio <ProvenanceTag kind="calculated" provider="calc" /></div>
          <div className="num text-3xl font-semibold tracking-tight">{formatMoney(live.totalValue)}</div>
          <div className="flex items-center gap-2 text-sm">
            <Value text={formatSignedMoney(live.dayChange)} tone={toneOf(live.dayChange)} />
            <Value text={formatPct(live.dayChangePct, { signed: true })} tone={toneOf(live.dayChangePct)} />
            <span className="text-muted-foreground">today</span>
          </div>
        </div>
        <div className="space-y-0.5 text-right">
          <DataAsOf timestamp={live.oldestQuoteTime} prefix="Quotes as of" />
          <div><DataAsOf timestamp={quotes?.last_fetched_at ?? null} prefix="Refreshed" /></div>
          {marketDate && <div className="text-[11px] text-muted-foreground">Analytics use closes through {marketDate}</div>}
        </div>
      </section>
      {(live.unpricedSymbols.length > 0 || live.foreignCurrencySymbols.length > 0) && (
        <p className="mb-3 text-xs text-muted-foreground">
          {live.unpricedSymbols.length > 0 && <>Excluded (no price yet): {live.unpricedSymbols.join(", ")}. </>}
          {live.foreignCurrencySymbols.length > 0 && <>Excluded (non-USD, FX pending): {live.foreignCurrencySymbols.join(", ")}.</>}
        </p>
      )}

      {/* ── KPI row ──────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        <Kpi label="Total value" text={formatMoney(live.totalValue)} />
        <Kpi label="Today's change" text={formatSignedMoney(live.dayChange)} sub={formatPct(live.dayChangePct, { signed: true })} tone={toneOf(live.dayChange)} />
        <Kpi label="Unrealized gain" text={formatSignedMoney(live.unrealizedPnlKnown)} tone={toneOf(live.unrealizedPnlKnown)} note={live.unknownCostSymbols.length ? `Excludes positions with unknown cost: ${live.unknownCostSymbols.join(", ")}` : "On positions with known cost basis"} />
        <Kpi label="Cash" text={formatMoney(live.cash)} kind="reported" sub={formatPct(a?.concentration.cashWeight.value ?? null, { decimals: 1 })} />
        <Kpi label="YTD return" text={formatPct(a?.performance.ytd.value ?? null, { signed: true })} tone={toneOf(a?.performance.ytd.value)} basis="actual" note={a?.performance.ytd.note} />
        <Kpi label="S&P 500 YTD (SPY)" text={formatPct(a?.benchmarks.SPY.ytd.value ?? null, { signed: true })} tone={toneOf(a?.benchmarks.SPY.ytd.value)} basis="market" note={a?.benchmarks.SPY.ytd.note} />
        <Kpi label="Excess vs SPY" text={formatPct(a?.performance.excessVsSpyYtd.value ?? null, { signed: true })} tone={toneOf(a?.performance.excessVsSpyYtd.value)} basis="actual" note="Portfolio YTD time-weighted return minus SPY YTD price return" />
      </div>

      {heldRecs.length > 0 && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 text-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Holdings review · {heldRecs[0].snapshotDate}</span>
            <span>
              {needsAttention.length === 0 ? <span className="text-muted-foreground">No holding rated Reduce.</span> : needsAttention.map((r) => (
                <Link key={r.companyId} href={`/research/${encodeURIComponent(r.symbol)}`} className="mr-2 inline-flex items-center gap-1 hover:underline">{r.symbol} <RatingBadge rating={r.rating} held /></Link>
              ))}
            </span>
            {addable.length > 0 && (
              <span>
                {addable.map((r) => (
                  <Link key={r.companyId} href={`/research/${encodeURIComponent(r.symbol)}`} className="mr-2 inline-flex items-center gap-1 hover:underline">{r.symbol} <RatingBadge rating={r.rating} held /></Link>
                ))}
              </span>
            )}
            <span className="ml-auto flex gap-3">
              <Link href="/research" className="underline">Review all holdings</Link>
              <Link href="/opportunities" className="underline">{newIdeas} new ideas</Link>
              <Link href="/planner" className="underline">Plan new money</Link>
            </span>
          </CardContent>
        </Card>
      )}

      {!a ? (
        <Card className="mb-4"><CardContent className="pt-4 text-sm text-muted-foreground">Analytics appear after the first price refresh stores benchmark history (SPY/QQQ). Owners can run it from Settings → Data Health.</CardContent></Card>
      ) : (
        <>
          {/* ── Benchmarks + health ─────────────────────────── */}
          <div className="mb-4 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Market pulse · current holdings vs benchmarks</CardTitle>
                <p className="text-[11px] text-muted-foreground">Hypothetical backtest: today&apos;s holdings and weights applied to past prices, indexed to 100. Not your historical performance. Price returns, dividends excluded.</p>
              </CardHeader>
              <CardContent>
                <ComparisonChart asOf={a.asOf} portfolio={a.backtestSeries} spy={closes.SPY ?? []} qqq={closes.QQQ ?? []} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Portfolio health</CardTitle>
                <span className="text-[10px] text-muted-foreground">1Y backtest · {a.risk.observations} days</span>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Kpi label="Volatility (ann.)" text={formatPct(a.risk.volatility.value, { decimals: 1 })} note={a.risk.note} basis="backtest" />
                <Kpi label="Beta vs SPY" text={formatNumber(a.risk.beta.value, 2)} note={a.risk.note} basis="backtest" />
                <Kpi label="Sharpe" text={formatNumber(a.risk.sharpe.value, 2)} note={a.risk.sharpe.note} basis="backtest" kind={a.risk.sharpe.value === null ? "calculated" : "scenario_assumption"} />
                <Kpi label="Sortino" text={formatNumber(a.risk.sortino.value, 2)} note={a.risk.sortino.note} basis="backtest" />
                <Kpi label="Max drawdown" text={formatPct(a.risk.maxDrawdown.value, { decimals: 1 })} tone={toneOf(a.risk.maxDrawdown.value)} note={a.risk.maxDrawdown.note} basis="backtest" />
                <Kpi label="Downside dev." text={formatPct(a.risk.downsideDeviation.value, { decimals: 1 })} basis="backtest" />
                {a.risk.missingHistory.length > 0 && <p className="col-span-2 text-[11px] text-warning">Limited price history: {a.risk.missingHistory.join(", ")}</p>}
              </CardContent>
            </Card>
          </div>

          {/* ── Value + movers ──────────────────────────────── */}
          <div className="mb-4 grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Portfolio value (actual)</CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  {snapshots.length ? `Daily snapshots since ${snapshots[0].date}. ` : "No daily snapshots yet — the first is recorded after the next refresh. "}
                  Return since tracking: <Value text={formatPct(a.performance.sinceTracking.value, { signed: true })} tone={toneOf(a.performance.sinceTracking.value)} /> (time-weighted, holdings-based)
                </p>
              </CardHeader>
              <CardContent><ValueChart asOf={a.asOf} points={valuePoints} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Today&apos;s movers</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <div className="mb-1 font-medium text-muted-foreground">Top contributors</div>
                  {contributors.length ? contributors.map((h) => (
                    <div key={h.id} className="flex justify-between py-0.5"><span>{h.symbol}</span><Value text={formatSignedMoney(h.dayChange)} tone="positive" /></div>
                  )) : <p className="text-muted-foreground">None</p>}
                </div>
                <div>
                  <div className="mb-1 font-medium text-muted-foreground">Top detractors</div>
                  {detractors.length ? detractors.map((h) => (
                    <div key={h.id} className="flex justify-between py-0.5"><span>{h.symbol}</span><Value text={formatSignedMoney(h.dayChange)} tone="negative" /></div>
                  )) : <p className="text-muted-foreground">None</p>}
                </div>
                <div>
                  <div className="mb-1 font-medium text-muted-foreground">Biggest % moves</div>
                  {biggestPct.map((h) => (
                    <div key={h.id} className="flex justify-between py-0.5"><span>{h.symbol}</span><Value text={formatPct(h.changePct, { signed: true })} tone={toneOf(h.changePct)} /></div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">Quantity × (latest quote − previous close), from stored quotes.</p>
              </CardContent>
            </Card>
          </div>

          {/* ── Allocation + diversification ───────────────── */}
          <div className="mb-4 grid gap-4 xl:grid-cols-3">
            <Card>
              <CardHeader><CardTitle>Allocation</CardTitle></CardHeader>
              <CardContent>
                <AllocationPanel byCompany={a.concentration.byCompany} bySector={a.concentration.bySector} byIndustry={a.concentration.byIndustry} byAssetClass={a.concentration.byAssetClass} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Concentration</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Kpi label="Largest position" text={a.concentration.largestPosition ? `${a.concentration.largestPosition.symbol} ${formatPct(a.concentration.largestPosition.weight, { decimals: 1 })}` : "—"} />
                <Kpi label="Top 5 weight" text={formatPct(a.concentration.top5Weight.value, { decimals: 1 })} />
                <Kpi label="Effective # positions" text={formatNumber(a.concentration.effectiveN.value, 1)} note="1 / Herfindahl index of position weights" />
                <Kpi label="Largest sector" text={a.concentration.bySector[0] ? `${formatPct(a.concentration.bySector[0].weight, { decimals: 1 })}` : "—"} sub={a.concentration.bySector[0]?.group} />
                {a.correlation.highlyCorrelated.length > 0 && (
                  <div className="col-span-2 rounded-md border border-warning/50 bg-warning/10 p-2 text-[11px]">
                    <b>Highly correlated (ρ ≥ 0.8):</b> {a.correlation.highlyCorrelated.map((p) => `${p.a}/${p.b} ${p.rho.toFixed(2)}`).join(", ")}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Correlation (1Y daily returns)</CardTitle></CardHeader>
              <CardContent><CorrelationHeatmap keys={a.correlation.keys} matrix={a.correlation.matrix} /></CardContent>
            </Card>
          </div>
        </>
      )}

      {/* ── Later phases (no placeholder numbers) ─────────────── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Planned title="Upcoming events" phase={3} text="Earnings and dividend dates for your holdings, once events ingestion runs." />
        <Planned title="AI investment committee" phase={5} text="Grounded commentary on what changed and why — every number traced to stored data." />
        <Planned title="Opportunity radar" phase={4} text="New screener entrants, improving and deteriorating names, revisions." />
        <Planned title="Today's action board" phase={7} text="Review now / Watch / No action. “No action today” is a valid result." />
      </div>
    </>
  );
}
