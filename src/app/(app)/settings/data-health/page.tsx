import type { Metadata } from "next";
import { requireOwner } from "@/lib/auth/dal";
import { getDataFreshness, type FreshnessStatus } from "@/lib/ops/freshness";
import { getProviderConfigView, getRecentJobRuns, getRecentProviderFailures, getResearchCoverage, getSchemaWarnings } from "@/lib/ops/health";
import { PROVIDER_LABEL } from "@/lib/domain/provenance";
import { formatAge, formatTimestamp } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RunRefreshButton, RunResearchButton } from "./run-button";

export const metadata: Metadata = { title: "Data Health" };
// manual research refresh runs as a server action on this page
export const maxDuration = 300;

const STATUS_BADGE: Record<FreshnessStatus, { label: string; variant: "positive" | "warning" | "negative" | "secondary" }> = {
  healthy: { label: "HEALTHY", variant: "positive" },
  stale: { label: "STALE", variant: "warning" },
  critical: { label: "CRITICAL", variant: "negative" },
  no_data: { label: "NO DATA", variant: "secondary" },
};
const JOB_BADGE = {
  success: "positive",
  partial: "warning",
  failed: "negative",
  running: "secondary",
  skipped: "secondary",
} as const;

export default async function DataHealthPage() {
  const me = await requireOwner();
  const [freshness, runs, failures, warnings, research] = await Promise.all([
    getDataFreshness(),
    getRecentJobRuns(20),
    getRecentProviderFailures(50),
    getSchemaWarnings(),
    getResearchCoverage(me.id),
  ]);
  const cfg = getProviderConfigView();
  const lastRefresh = runs.find((r) => r.job_name === "refresh-prices" && r.finished_at);

  return (
    <>
      <PageHeader
        title="Data Health"
        description="Recommendations built on stale data are dangerous. This page shows exactly how fresh every dataset is and what failed."
        actions={<RunRefreshButton />}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {freshness.map((f) => (
          <Card key={f.dataset}>
            <CardContent className="pt-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{f.label}</span>
                <Badge variant={STATUS_BADGE[f.status].variant}>{STATUS_BADGE[f.status].label}</Badge>
              </div>
              <div className="mt-2 text-xs" title={f.last_fetched_at ? formatTimestamp(f.last_fetched_at) : undefined}>
                Last refreshed: <span className="font-medium">{f.last_fetched_at ? formatAge(f.last_fetched_at) : "never"}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">Latest data point: {f.latest_as_of ?? "—"}</div>
              <div className="text-[11px] text-muted-foreground">SLA: {f.max_age_hours}h (critical {f.critical_age_hours}h)</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Research data</CardTitle>
          <RunResearchButton />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">Universe</div>
              <div className="text-base font-semibold num">{research.universeSize}</div>
              <div className="text-[11px] text-muted-foreground">
                {research.universeSource === "sp500" ? "S&P 500 members" : research.universeSource === "core100" ? "~100 large US companies (index list not in data plan)" : "not synced yet"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Company profiles</div>
              <div className="text-base font-semibold num">{research.withProfile} / {research.universeSize}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Financial statements</div>
              <div className="text-base font-semibold num">{research.withFinancials} / {research.universeSize}</div>
              <div className="text-[11px] text-muted-foreground">Annual, up to 6 years; refreshed monthly</div>
            </div>
            <div>
              <div className="text-muted-foreground">Scored (latest run)</div>
              <div className="text-base font-semibold num">{research.scoredCount}</div>
              <div className="text-[11px] text-muted-foreground">{research.latestScoreDate ?? "no scores yet"}</div>
            </div>
          </div>
          {research.capabilities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {research.capabilities.filter((c) => c.capability !== "universe_sync").map((c) => (
                <Badge key={c.capability} variant={c.available ? "positive" : "secondary"} title={`${c.detail ?? ""} (checked ${formatTimestamp(c.checked_at)})`}>
                  {c.capability.replaceAll("_", " ")}: {c.available ? "available" : "not in data plan"}
                </Badge>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Research data refreshes automatically every day at 10:00 UTC. The first full load takes a few runs; each click works for up to ~3 minutes and picks up where the last one stopped.
          </p>
        </CardContent>
      </Card>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Provider configuration</CardTitle></CardHeader>
          <CardContent>
            {cfg.error && <p className="mb-2 text-xs text-destructive">{cfg.error}</p>}
            <Table>
              <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Configured chain</TableHead><TableHead>Active</TableHead></TableRow></TableHeader>
              <TableBody>
                {cfg.categories.map((c) => (
                  <TableRow key={c.category}>
                    <TableCell className="text-xs font-medium">{c.category.replace("_", " ")}</TableCell>
                    <TableCell className="text-xs">{c.configured.join(" → ")}</TableCell>
                    <TableCell className="text-xs">
                      {c.effective.length ? (
                        c.effective.map((p) => <Badge key={p} variant={p === "mock" ? "warning" : "secondary"} className="mr-1">{PROVIDER_LABEL[p]}</Badge>)
                      ) : (
                        <Badge variant="negative">none (missing credentials)</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {Object.entries(cfg.credentials).map(([k, v]) => (
                <Badge key={k} variant={v ? "positive" : "secondary"}>{k}: {v ? "configured" : "not set"}</Badge>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">Secrets are never displayed; only whether each is present on the server.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Provider schema warnings (7 days)</CardTitle></CardHeader>
          <CardContent>
            {warnings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No missing fields detected in provider responses.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {warnings.map((w) => (
                  <li key={w.endpoint}>
                    <span className="font-mono">{w.endpoint}</span>
                    <div className="text-muted-foreground">Missing fields: {w.fields.join(", ")} — affected values are stored as unavailable (null).</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Job runs</CardTitle>
          <span className="text-[11px] text-muted-foreground">
            Last price refresh: {lastRefresh?.finished_at ? `${formatTimestamp(lastRefresh.finished_at)} (${lastRefresh.status})` : "never"}
          </span>
        </CardHeader>
        <CardContent className="px-0">
          {runs.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">No jobs have run yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Job</TableHead><TableHead>Trigger</TableHead><TableHead>Status</TableHead><TableHead>Started</TableHead>
                  <TableHead className="text-right">Duration</TableHead><TableHead className="text-right">Records</TableHead><TableHead className="text-right">Failed items</TableHead><TableHead>Error / first failures</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4 text-xs font-medium">{r.job_name}</TableCell>
                    <TableCell className="text-xs">{r.trigger}</TableCell>
                    <TableCell><Badge variant={JOB_BADGE[r.status]}>{r.status}</Badge></TableCell>
                    <TableCell className="text-xs">{formatTimestamp(r.started_at)}</TableCell>
                    <TableCell className="text-right text-xs">{r.finished_at ? `${((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000).toFixed(1)}s` : "—"}</TableCell>
                    <TableCell className="text-right text-xs">{r.records_updated}</TableCell>
                    <TableCell className="text-right text-xs">{r.items_failed}{r.items_total !== null ? ` / ${r.items_total}` : ""}</TableCell>
                    <TableCell className="max-w-md whitespace-normal text-[11px] text-muted-foreground">
                      {r.error ?? r.failures.slice(0, 3).map((f) => `${f.item}: ${f.errorClass}`).join("; ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent failed provider requests</CardTitle></CardHeader>
        <CardContent className="px-0">
          {failures.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">No failed requests recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow><TableHead className="pl-4">Time</TableHead><TableHead>Provider</TableHead><TableHead>Category</TableHead><TableHead>Endpoint</TableHead><TableHead>Symbol</TableHead><TableHead>HTTP</TableHead><TableHead>Class</TableHead><TableHead>Message</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {failures.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="pl-4 text-xs">{formatAge(f.requested_at)}</TableCell>
                    <TableCell className="text-xs">{f.provider}</TableCell>
                    <TableCell className="text-xs">{f.category}</TableCell>
                    <TableCell className="max-w-56 truncate font-mono text-[11px]" title={f.endpoint}>{f.endpoint.split("?")[0]}</TableCell>
                    <TableCell className="text-xs">{f.symbol ?? "—"}</TableCell>
                    <TableCell className="text-xs">{f.http_status ?? "—"}</TableCell>
                    <TableCell><Badge variant={f.error_class === "plan_restricted" ? "warning" : "negative"}>{f.error_class}</Badge></TableCell>
                    <TableCell className="max-w-md whitespace-normal text-[11px] text-muted-foreground">{f.error_message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
