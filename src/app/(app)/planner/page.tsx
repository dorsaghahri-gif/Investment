import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { loadPlanInputs } from "@/lib/research/plan-data";
import { planContribution, PLANNER_VERSION } from "@/lib/research/planner";
import { formatMoney, formatPct, formatTimestamp } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProvenanceTag } from "@/components/data/provenance";

export const metadata = { title: "New money planner" };

const KIND_LABEL = { cash: "Cash", core: "Core fund", add: "Add to holding", new: "New position" } as const;

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ amount?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const raw = Number(String(sp.amount ?? "").replace(/[$,\s]/g, ""));
  const amount = Number.isFinite(raw) && raw > 0 && raw <= 10_000_000 ? Math.round(raw * 100) / 100 : null;

  const data = amount ? await loadPlanInputs(user.id, amount) : null;
  const plan = data ? planContribution(data.input) : null;

  return (
    <>
      <PageHeader
        title="New money planner"
        description="Enter an amount you plan to invest. The planner splits it between cash, a diversified core fund and your best-rated stocks — without breaking your Investment DNA limits."
      />

      <Card className="mb-4">
        <CardContent className="pt-4">
          <form action="/planner" className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Amount to invest (USD)</span>
              <Input name="amount" inputMode="decimal" defaultValue={amount ?? ""} placeholder="1,000" className="w-40" required />
            </label>
            <Button size="sm">Build plan</Button>
            <span className="text-[11px] text-muted-foreground">Nothing is executed — this app never places trades.</span>
          </form>
        </CardContent>
      </Card>

      {data && !data.hasDna && (
        <Alert className="mb-4 text-sm">
          You haven&apos;t filled in your <Link href="/settings/dna" className="underline">Investment DNA</Link>. The plan uses defaults (60% core, 5% positions, no sector limit) until you do.
        </Alert>
      )}
      {data && !data.hasScores && (
        <Alert className="mb-4 text-sm">No stock ratings yet, so everything goes to the core fund. Ratings appear after research data loads (Settings → Data Health).</Alert>
      )}

      {plan && (
        <>
          <Card className="mb-4">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Suggested split of {formatMoney(plan.amount)}</CardTitle>
              <span className="text-[11px] text-muted-foreground">{PLANNER_VERSION} · portfolio {formatMoney(plan.totalBefore)} → {formatMoney(plan.totalAfter)}</span>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Where</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">≈ Shares</TableHead>
                    <TableHead className="text-right">Weight before → after</TableHead>
                    <TableHead>Why</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.lines.map((l) => (
                    <TableRow key={l.symbol}>
                      <TableCell className="pl-4">
                        {l.kind === "cash" ? <span className="font-medium">Cash</span> : <Link href={`/research/${encodeURIComponent(l.symbol)}`} className="font-medium hover:underline">{l.symbol}</Link>}
                        <div className="max-w-48 truncate text-[11px] text-muted-foreground">{l.kind === "cash" ? "" : l.name}</div>
                      </TableCell>
                      <TableCell><Badge variant={l.kind === "new" ? "positive" : "secondary"}>{KIND_LABEL[l.kind]}</Badge></TableCell>
                      <TableCell className="text-right text-sm font-medium num">{formatMoney(l.amount)}</TableCell>
                      <TableCell className="text-right text-xs num" title={l.priceAsOf ? `At ${formatMoney(l.price)} (${formatTimestamp(l.priceAsOf)})` : undefined}>
                        {l.approxShares === null ? "—" : l.approxShares.toFixed(3)}
                      </TableCell>
                      <TableCell className="text-right text-xs num">{formatPct(l.weightBefore)} → {formatPct(l.weightAfter)}</TableCell>
                      <TableCell className="max-w-md whitespace-normal text-[11px] text-muted-foreground">
                        <ul className="space-y-0.5">{l.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="px-4 pt-2 text-[11px] text-muted-foreground">
                Share counts use the latest stored price and are approximate (fractional shares depend on your broker). <ProvenanceTag kind="calculated" provider="calc" />
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Sector weights after this plan</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                {plan.sectorWeightsAfter.map((s) => (
                  <div key={s.bucket} className="flex justify-between gap-2">
                    <span className="truncate">{s.bucket}</span>
                    <span className={s.limit !== null && s.after > s.limit ? "num text-negative" : "num"}>
                      {formatPct(s.before)} → {formatPct(s.after)}{s.limit !== null ? ` (limit ${formatPct(s.limit)})` : ""}
                    </span>
                  </div>
                ))}
                <p className="pt-1 text-[11px] text-muted-foreground">Sector funds are classified by name; broad index and target-date funds count as diversified.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Considered but not included</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">
                {plan.skipped.length === 0 && plan.notes.length === 0 && <p className="text-muted-foreground">Nothing was excluded.</p>}
                {plan.skipped.map((s) => <div key={s.symbol}><span className="font-medium">{s.symbol}</span> <span className="text-muted-foreground">— {s.reason}</span></div>)}
                {plan.notes.map((n) => <p key={n} className="text-muted-foreground">{n}</p>)}
                {data!.unpriced.length > 0 && <p className="text-muted-foreground">No current price for {data!.unpriced.join(", ")}; excluded from weights.</p>}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <p className="mt-4 text-[11px] text-muted-foreground">
        How it works: cash is topped up to your DNA cash target first; then a share set by your risk tolerance (80% at 1 → 35% at 10) goes to your largest diversified fund; the rest goes to stocks rated Buy or better for you (medium+ confidence), each sized toward your standard position and capped by your position and sector limits. Unused money rolls into the core fund. Research and decision support only — not personalized financial advice.
      </p>
    </>
  );
}
