import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/jobs/cron-auth";
import { pruneOperationalLogs, runPortfolioSnapshotsJob, runRefreshPrices } from "@/lib/jobs";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const prices = await runRefreshPrices({ trigger: "cron" });
  // Snapshots depend on prices; run them even after a partial price refresh
  // (stale prices are recorded per position in price_staleness).
  const snaps = prices.status === "failed" ? null : await runPortfolioSnapshotsJob({ trigger: "chained" });
  await pruneOperationalLogs().catch((e) => console.error("[cron] prune failed", e));
  const brief = (s: typeof prices | null) => (s ? { status: s.status, recordsUpdated: s.recordsUpdated, itemsFailed: s.itemsFailed, runId: s.runId } : { status: "skipped" });
  // Compact summary only (no provider payloads).
  return NextResponse.json({ "refresh-prices": brief(prices), "portfolio-snapshots": brief(snaps) });
}
