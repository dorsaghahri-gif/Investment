import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { listRecommendations, searchCompanies } from "@/lib/research/queries";
import { RATING_RANK } from "@/lib/research/recommend";
import { formatPct } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfidenceTag, RatingBadge, ScoreBar } from "@/components/research/rating";
import { Value } from "@/components/data/provenance";

export const metadata = { title: "Research" };

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const [recs, results] = await Promise.all([listRecommendations(user.id), q ? searchCompanies(q) : Promise.resolve([])]);
  const held = recs
    .filter((r) => r.portfolioImpact.held)
    .sort((a, b) => RATING_RANK[a.rating] - RATING_RANK[b.rating] || (b.portfolioImpact.currentWeight ?? 0) - (a.portfolioImpact.currentWeight ?? 0));
  const asOf = recs[0]?.snapshotDate ?? null;

  return (
    <>
      <PageHeader
        title="Research"
        description="Every holding reviewed against its peers and your Investment DNA. Ratings are rule-based and explainable — research support, not advice."
        actions={
          <form className="flex gap-2" action="/research">
            <Input name="q" defaultValue={q ?? ""} placeholder="Search symbol or company" className="w-56" aria-label="Search companies" />
            <Button size="sm" variant="outline">Search</Button>
          </form>
        }
      />

      {q && (
        <Card className="mb-4">
          <CardHeader><CardTitle>Search results for “{q}”</CardTitle></CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching company in the research universe or your holdings.</p>
            ) : (
              <ul className="grid gap-1 sm:grid-cols-2">
                {results.map((r) => (
                  <li key={r.symbol}>
                    <Link href={`/research/${encodeURIComponent(r.symbol)}`} className="text-sm hover:underline">
                      <span className="font-medium">{r.symbol}</span> <span className="text-muted-foreground">{r.name ?? ""}{r.sector ? ` · ${r.sector}` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Your holdings — review</CardTitle>
          <span className="text-[11px] text-muted-foreground">{asOf ? `Ratings as of ${asOf}` : ""}</span>
        </CardHeader>
        <CardContent className="px-0">
          {held.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">
              No ratings yet. They appear after the research data loads (daily at 10:00 UTC, or Settings → Data Health → Refresh research data).
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Holding</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Personal score</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead>Main reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {held.map((r) => {
                  const reason = r.portfolioImpact.isFund
                    ? r.rating === "reduce"
                      ? r.risks[0] ?? "Above your limits"
                      : r.portfolioImpact.isBroad
                        ? "Diversified fund — not scored on company fundamentals"
                        : `Fund (${r.portfolioImpact.bucket ?? "unclassified"}) — not scored on company fundamentals`
                    : r.rating === "reduce" || r.rating === "avoid"
                      ? r.risks[0] ?? r.negatives[0]?.label ?? "Below thresholds"
                      : r.positives[0]
                        ? `Strongest: ${r.positives[0].label}`
                        : "Insufficient data";
                  return (
                    <TableRow key={r.companyId}>
                      <TableCell className="pl-4">
                        <Link href={`/research/${encodeURIComponent(r.symbol)}`} className="font-medium hover:underline">{r.symbol}</Link>
                        <div className="max-w-56 truncate text-[11px] text-muted-foreground">{r.name}</div>
                      </TableCell>
                      <TableCell>
                        <RatingBadge rating={r.rating} held />
                        <div><ConfidenceTag confidence={r.confidence} /></div>
                      </TableCell>
                      <TableCell>{r.portfolioImpact.isFund ? <span className="text-xs text-muted-foreground">Not scored (fund)</span> : <ScoreBar value={r.score?.personal ?? null} />}</TableCell>
                      <TableCell className="text-right text-xs"><Value text={formatPct(r.portfolioImpact.currentWeight ?? null)} /></TableCell>
                      <TableCell className="max-w-sm whitespace-normal text-xs text-muted-foreground">{reason}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {held.length > 0 && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Scores compare each company with its industry, its sector and the whole research universe, plus its own history. Open a holding to see every input with its source and date.
        </p>
      )}
    </>
  );
}
