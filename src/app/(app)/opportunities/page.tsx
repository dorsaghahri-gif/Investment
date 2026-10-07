import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { listRecommendations } from "@/lib/research/queries";
import { formatMetric } from "@/lib/research/recommend";
import { SECTORS } from "@/lib/profile/dna";
import { formatMoney, formatPct } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfidenceTag, RatingBadge, ScoreBar } from "@/components/research/rating";
import { Value } from "@/components/data/provenance";

export const metadata = { title: "Opportunities" };

type Show = "buy" | "watch" | "all";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ sector?: string; show?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const show: Show = sp.show === "watch" || sp.show === "all" ? sp.show : "buy";
  const sector = sp.sector && (SECTORS as readonly string[]).includes(sp.sector) ? sp.sector : "";
  const recs = await listRecommendations(user.id);

  const notHeld = recs.filter((r) => !r.portfolioImpact.held && !r.portfolioImpact.isFund && r.score?.personal !== null && r.score?.personal !== undefined);
  const wanted = (r: (typeof recs)[number]) =>
    show === "all" ? r.rating !== "avoid" : show === "watch" ? r.rating === "watch" : r.rating === "buy" || r.rating === "strong_buy";
  const list = notHeld
    .filter(wanted)
    .filter((r) => !sector || r.sector === sector)
    .sort((a, b) => (b.score!.personal ?? 0) - (a.score!.personal ?? 0))
    .slice(0, 60);
  const failingDna = notHeld.filter((r) => r.rating === "avoid" && r.rulesFired.includes("fails_dna")).length;

  // your sector exposure (from held positions' recommendation context)
  const exposure = new Map<string, number>();
  for (const r of recs.filter((x) => x.portfolioImpact.held && !x.portfolioImpact.isBroad)) {
    const b = r.portfolioImpact.bucket ?? r.sector ?? "Unknown";
    exposure.set(b, Math.max(exposure.get(b) ?? 0, r.portfolioImpact.sectorWeight ?? 0));
  }
  const maxSector = recs.find((r) => r.portfolioImpact.maxSectorWeight != null)?.portfolioImpact.maxSectorWeight ?? null;

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Companies you don't own, ranked by your personal score. Only names that pass your Investment DNA rules can rate Buy."
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{show === "buy" ? "Rated Buy for you" : show === "watch" ? "On watch" : "All scored (excluding Avoid)"}{sector ? ` · ${sector}` : ""}</CardTitle>
            <form className="flex items-center gap-2" action="/opportunities">
              <NativeSelect name="show" defaultValue={show} className="h-8 w-36 text-xs" aria-label="Rating filter">
                <option value="buy">Buy / Strong buy</option>
                <option value="watch">Watch</option>
                <option value="all">All except Avoid</option>
              </NativeSelect>
              <NativeSelect name="sector" defaultValue={sector} className="h-8 w-44 text-xs" aria-label="Sector filter">
                <option value="">All sectors</option>
                {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
              </NativeSelect>
              <Button size="sm" variant="outline">Apply</Button>
            </form>
          </CardHeader>
          <CardContent className="px-0">
            {recs.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">No scores yet — they appear after the research data loads (Settings → Data Health).</p>
            ) : list.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground">
                Nothing matches right now. {show === "buy" ? "Try the Watch list — names that score well but look expensive or have lower confidence." : ""}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Company</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Personal score</TableHead>
                    <TableHead>Valuation</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Top strengths</TableHead>
                    <TableHead>Watch out</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((r) => (
                    <TableRow key={r.companyId}>
                      <TableCell className="pl-4">
                        <Link href={`/research/${encodeURIComponent(r.symbol)}`} className="font-medium hover:underline">{r.symbol}</Link>
                        <div className="max-w-48 truncate text-[11px] text-muted-foreground">{r.name} · {r.sector ?? "—"}</div>
                      </TableCell>
                      <TableCell><RatingBadge rating={r.rating} held={false} /><div><ConfidenceTag confidence={r.confidence} /></div></TableCell>
                      <TableCell><ScoreBar value={r.score!.personal} /></TableCell>
                      <TableCell><ScoreBar value={r.score!.categories.valuation} /></TableCell>
                      <TableCell className="text-right text-xs"><Value text={formatMoney(r.price)} /></TableCell>
                      <TableCell className="max-w-56 whitespace-normal text-[11px]">
                        {r.positives.slice(0, 2).map((f) => `${f.label} ${formatMetric(f.metricKey, f.rawValue)}`).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="max-w-56 whitespace-normal text-[11px] text-muted-foreground">
                        {r.risks[0] ?? (r.negatives.slice(0, 1).map((f) => `${f.label} ${formatMetric(f.metricKey, f.rawValue)}`).join("") || "—")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Your sector exposure</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-xs">
              {exposure.size === 0 ? <p className="text-muted-foreground">No scored holdings yet.</p> : [...exposure.entries()].sort((a, b) => b[1] - a[1]).map(([b, w]) => (
                <div key={b} className="flex justify-between gap-2">
                  <Link href={`/opportunities?show=${show}&sector=${encodeURIComponent(b)}`} className="truncate hover:underline">{b}</Link>
                  <span className={maxSector !== null && w > maxSector ? "num text-negative" : "num"}>{formatPct(w)}</span>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground">
                {maxSector !== null ? `Your max sector weight is ${formatPct(maxSector)}; Buy ratings are blocked where a standard position would exceed it.` : "Set a max sector weight in Investment DNA to enforce diversification."} Broad index funds are excluded; sector funds are classified by name (approximate).
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-xs text-muted-foreground">
              {failingDna > 0 && <p className="mb-2">{failingDna} companies are excluded by your Investment DNA rules.</p>}
              <p>Ready to put money to work? The <Link href="/planner" className="text-foreground underline">New money planner</Link> splits a contribution across a core fund and these names within your limits.</p>
            </CardContent>
          </Card>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Research and decision support only — not personalized financial advice. Scores rank companies relative to each other; they don&apos;t predict returns.</p>
    </>
  );
}
