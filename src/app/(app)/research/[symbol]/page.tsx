import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { getCompanyResearch, type ComponentRow } from "@/lib/research/queries";
import { CATEGORIES, CATEGORY_LABEL, DEFAULT_CATEGORY_WEIGHTS, METRIC_BY_KEY, MODEL_VERSION } from "@/lib/research/definitions";
import { formatMetric, ratingLabel } from "@/lib/research/recommend";
import { formatMoney, formatPct, formatTimestamp, MISSING } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfidenceTag, RatingBadge, ScoreBar, scoreText } from "@/components/research/rating";
import { DataAsOf, ProvenanceTag, Value, toneOf } from "@/components/data/provenance";
import { LineChart } from "@/components/charts/line-chart";
import type { DataKind, ProviderId } from "@/lib/domain/provenance";

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol).toUpperCase()} · Research` };
}

const RULE_TEXT: Record<string, string> = {
  score_ge_85: "Personal score ≥ 85",
  score_ge_75: "Personal score ≥ 75",
  valuation_ge_60: "Valuation ≥ 60",
  valuation_ge_45: "Valuation ≥ 45",
  limits_ok: "A standard position fits your limits",
  valuation_below_45: "Valuation below 45 (or unavailable)",
  low_confidence: "Low data confidence caps the rating",
  score_rising: "Score rising ≥ 5 points in 30 days",
  score_55_75: "Held, score between thresholds",
  below_buy_thresholds: "Below the Buy thresholds",
  score_below_45: "Personal score below 45",
  score_below_50: "Held and score below 50",
  score_fell_10_in_30d: "Score fell ≥ 10 points in 30 days",
  position_over_max: "Position above your max position size",
  sector_over_max: "Sector above your max sector weight",
  fails_dna: "Fails an Investment DNA rule",
  held_fails_dna: "Held, but fails an Investment DNA rule",
  insufficient_data: "Not enough data to score",
  buy_blocked_by_limits: "Would rate Buy, but a standard position breaks your limits",
  hysteresis_hold: "Kept previous rating: change didn't clear the threshold by 2 points",
  fund_not_scored: "Funds aren't scored on company fundamentals",
  fund_over_max_position: "Fund above your max position size",
  fund_over_max_sector: "Fund's sector above your max sector weight",
};

export default async function CompanyResearchPage({ params }: { params: Promise<{ symbol: string }> }) {
  const user = await requireUser();
  const { symbol } = await params;
  const r = await getCompanyResearch(user.id, decodeURIComponent(symbol));
  if (!r) notFound();
  const { company: c, quote: q, rec, components } = r;
  const held = Boolean(rec?.portfolioImpact.held);
  const s = rec?.score ?? null;
  const byCat = (cat: string) => components.filter((x) => x.category === cat).sort((a, b) => (METRIC_BY_KEY[b.metricKey]?.weight ?? 0) - (METRIC_BY_KEY[a.metricKey]?.weight ?? 0));

  return (
    <>
      <div className="mb-2 text-xs"><Link href="/research" className="text-muted-foreground hover:underline">← Research</Link></div>
      <PageHeader
        title={`${c.symbol}${c.name ? ` · ${c.name}` : ""}`}
        description={[c.sector, c.industry, c.exchange].filter(Boolean).join(" · ") || "Profile not loaded yet"}
        actions={rec ? <div className="flex flex-col items-end gap-1"><RatingBadge rating={rec.rating} held={held} className="text-xs" /><ConfidenceTag confidence={rec.confidence} /></div> : undefined}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Price</div>
            <div className="text-xl font-semibold"><Value text={formatMoney(q?.price ?? null)} /></div>
            <div className="text-xs"><Value text={formatPct(q?.changePct ?? null, { signed: true })} tone={toneOf(q?.changePct)} /> today</div>
            <DataAsOf timestamp={q?.quoteTime ?? null} provider={(q?.provider as ProviderId) ?? null} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Market cap</div>
            <div className="text-xl font-semibold"><Value text={formatMoney(q?.marketCap ?? null, "USD", { compact: true })} /></div>
            <div className="text-[11px] text-muted-foreground">52-week range: {q?.yearLow != null && q?.yearHigh != null ? `${formatMoney(q.yearLow)} – ${formatMoney(q.yearHigh)}` : MISSING}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Personal score <ProvenanceTag kind="calculated" provider="calc" asOf={s?.snapshotDate} /></div>
            <div className="text-xl font-semibold">{s?.personal != null ? s.personal.toFixed(1) : <span className="text-base text-muted-foreground">Insufficient data</span>}</div>
            <div className="text-[11px] text-muted-foreground">Universal score {scoreText(s?.overall)} · tilted by your DNA preferences</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Data coverage</div>
            <div className="text-xl font-semibold">{s ? formatPct(s.coverage, { decimals: 0 }) : MISSING}</div>
            <div className="text-[11px] text-muted-foreground">Share of score inputs available (stale counts half). {s ? `Computed ${formatTimestamp(s.computedAt)}` : ""}</div>
          </CardContent>
        </Card>
      </div>

      {!rec && (
        <Card className="mb-4">
          <CardContent className="pt-4 text-sm text-muted-foreground">
            {c.inUniverse || held
              ? "This company hasn't been scored yet. Scores appear once its financial statements and price history have loaded."
              : "This company isn't in the research universe (S&P 500 + your holdings), so it isn't scored."}
          </CardContent>
        </Card>
      )}

      {rec && (
        <div className="mb-4 grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Why it scores well</CardTitle></CardHeader>
            <CardContent>
              {rec.positives.length === 0 ? <p className="text-sm text-muted-foreground">No component scores above the peer median.</p> : (
                <ul className="space-y-1.5 text-sm">
                  {rec.positives.map((f) => (
                    <li key={f.metricKey}><span className="font-medium">{f.label}</span> <span className="text-muted-foreground">{formatMetric(f.metricKey, f.rawValue)} · {f.subScore?.toFixed(0)}th pct-blend</span></li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>What could go wrong</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {rec.risks.map((x) => <li key={x} className="text-negative">{x}</li>)}
                {rec.negatives.map((f) => (
                  <li key={f.metricKey}><span className="font-medium">{f.label}</span> <span className="text-muted-foreground">{formatMetric(f.metricKey, f.rawValue)} · {f.subScore?.toFixed(0)}th pct-blend</span></li>
                ))}
                {rec.risks.length === 0 && rec.negatives.length === 0 && <li className="text-muted-foreground">No weak components or risk flags.</li>}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>What would change the rating</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {rec.upgradeTriggers.map((t) => <div key={t.text}>↑ {t.text}</div>)}
              {rec.downgradeTriggers.map((t) => <div key={t.text} className="text-muted-foreground">↓ {t.text}</div>)}
              {rec.upgradeTriggers.length + rec.downgradeTriggers.length === 0 && <p className="text-muted-foreground">No rule thresholds nearby.</p>}
              <div className="border-t pt-2 text-[11px] text-muted-foreground">
                Rules applied: {rec.rulesFired.map((x) => RULE_TEXT[x] ?? x).join("; ")}. Engine is deterministic; this rating is {ratingLabel(rec.rating, held)} as of {rec.snapshotDate}.
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {s && (s.dnaFailures.length > 0) && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Investment DNA check</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {s.dnaFailures.map((f) => (
                <li key={f.rule} className={f.status === "fail" ? "text-negative" : "text-muted-foreground"}>{f.status === "fail" ? "✕" : "?"} {f.detail}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {s && (
        <Card className="mb-4">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Score breakdown</CardTitle>
            <span className="text-[11px] text-muted-foreground">{MODEL_VERSION} · percentiles vs industry, sector, universe and own history</span>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {CATEGORIES.map((cat) => (
                <ScoreBar key={cat} label={`${CATEGORY_LABEL[cat]} (${DEFAULT_CATEGORY_WEIGHTS[cat]}%)`} value={s.categories[cat]} />
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Compared with</TableHead>
                  <TableHead className="text-right">Industry</TableHead>
                  <TableHead className="text-right">Sector</TableHead>
                  <TableHead className="text-right">Universe</TableHead>
                  <TableHead className="text-right">vs own history</TableHead>
                  <TableHead className="text-right">Sub-score</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Effect</TableHead>
                  <TableHead>As of</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CATEGORIES.map((cat) => (
                  <CategoryRows key={cat} title={`${CATEGORY_LABEL[cat]} — ${s.categories[cat] === null ? "insufficient data (excluded)" : s.categories[cat]!.toFixed(1)}`} rows={byCat(cat)} />
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Effect = points above/below a neutral 50 this metric adds to the overall score. Missing metrics are excluded and never counted as zero. Analyst estimates, revisions and insider data aren&apos;t in the current data plan.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {r.history.length > 1 && (
          <Card>
            <CardHeader><CardTitle>Personal score history</CardTitle></CardHeader>
            <CardContent>
              <LineChart
                ariaLabel={`${c.symbol} personal score over time`}
                height={180}
                formatY={(v) => v.toFixed(0)}
                series={[{ key: "p", label: "Personal score", color: "var(--viz-1)", points: r.history.filter((h) => h.personal !== null).map((h) => ({ date: h.date, value: h.personal! })) }]}
              />
              {r.ratingHistory.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                  {r.ratingHistory.map((h) => <li key={h.date + h.to}>{h.date}: {h.from ? ratingLabel(h.from, held) : "—"} → {ratingLabel(h.to, held)}</li>)}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
        {r.annuals.length > 0 && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Annual results</CardTitle>
              <ProvenanceTag kind="reported" provider={r.annuals[0].source as ProviderId} asOf={r.annuals[0].fetchedAt.slice(0, 10)} />
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader><TableRow><TableHead className="pl-4">Fiscal year end</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Net income</TableHead><TableHead className="text-right">Free cash flow</TableHead><TableHead className="text-right pr-4">EPS (diluted)</TableHead></TableRow></TableHeader>
                <TableBody>
                  {r.annuals.map((a) => (
                    <TableRow key={a.periodEnd}>
                      <TableCell className="pl-4 text-xs">{a.periodEnd}</TableCell>
                      <TableCell className="text-right text-xs"><Value text={formatMoney(a.revenue, "USD", { compact: true })} /></TableCell>
                      <TableCell className="text-right text-xs"><Value text={formatMoney(a.netIncome, "USD", { compact: true })} tone={toneOf(a.netIncome)} /></TableCell>
                      <TableCell className="text-right text-xs"><Value text={formatMoney(a.fcf, "USD", { compact: true })} tone={toneOf(a.fcf)} /></TableCell>
                      <TableCell className="pr-4 text-right text-xs"><Value text={a.epsDiluted === null ? MISSING : a.epsDiluted.toFixed(2)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="px-4 pt-2 text-[11px] text-muted-foreground">As reported to the data provider; fetched {formatTimestamp(r.annuals[0].fetchedAt)}.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {c.description && (
        <Card className="mt-4">
          <CardHeader><CardTitle>About</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{c.description}</CardContent>
        </Card>
      )}
      <p className="mt-4 text-[11px] text-muted-foreground">Research and decision support only — not personalized financial advice. This app never places trades.</p>
    </>
  );
}

function CategoryRows({ title, rows }: { title: string; rows: ComponentRow[] }) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={11} className="py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</TableCell>
      </TableRow>
      {rows.map((x) => {
        const def = METRIC_BY_KEY[x.metricKey];
        const pc = (v: number | null) => (v === null ? MISSING : v.toFixed(0));
        return (
          <TableRow key={x.metricKey} className={x.isMissing ? "text-muted-foreground" : undefined}>
            <TableCell className="text-xs" title={def?.help}>
              {def?.label ?? x.metricKey} {x.dataKind && !x.isMissing && <ProvenanceTag kind={x.dataKind as DataKind} provider="calc" asOf={x.asOf} />}
              {x.isStale && <Badge variant="warning" className="ml-1">stale</Badge>}
            </TableCell>
            <TableCell className="text-right text-xs">{x.isMissing ? <span title="Data unavailable">Data unavailable</span> : formatMetric(x.metricKey, x.rawValue)}</TableCell>
            <TableCell className="text-[11px]">{x.peerGroup ? `${x.peerGroup} (n=${x.peerCount})` : MISSING}</TableCell>
            <TableCell className="text-right text-xs num">{pc(x.percentileIndustry)}</TableCell>
            <TableCell className="text-right text-xs num">{pc(x.percentileSector)}</TableCell>
            <TableCell className="text-right text-xs num">{pc(x.percentileMarket)}</TableCell>
            <TableCell className="text-right text-xs num">{x.ownHistoryZ === null ? MISSING : `${x.ownHistoryZ >= 0 ? "+" : ""}${x.ownHistoryZ.toFixed(1)}σ`}</TableCell>
            <TableCell className="text-right text-xs num font-medium">{x.subScore === null ? MISSING : x.subScore.toFixed(0)}</TableCell>
            <TableCell className="text-right text-xs num">{x.weight ? x.weight.toFixed(1) : MISSING}</TableCell>
            <TableCell className="text-right text-xs num"><Value text={x.contribution === null ? MISSING : `${x.contribution >= 0 ? "+" : ""}${x.contribution.toFixed(2)}`} tone={toneOf(x.contribution)} /></TableCell>
            <TableCell className="text-[11px]">{x.asOf ?? MISSING}</TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
