import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/jobs/cron-auth";
import { runComputeScores, runRefreshResearch } from "@/lib/jobs";

export const maxDuration = 300;

/** Daily: refresh research data within a time budget, then recompute scores & recommendations. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const research = await runRefreshResearch({ trigger: "cron", budgetMs: 200_000 });
  const scores = await runComputeScores({ trigger: "chained" });
  const brief = (s: { status: string; recordsUpdated: number; itemsFailed: number; runId: string }) => ({ status: s.status, recordsUpdated: s.recordsUpdated, itemsFailed: s.itemsFailed, runId: s.runId });
  return NextResponse.json({ "refresh-research": { ...brief(research.summary), progress: research.progress }, "compute-scores": { ...brief(scores.summary), result: scores.result } });
}
