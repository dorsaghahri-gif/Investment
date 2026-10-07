"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { runComputeScores, runPortfolioSnapshotsJob, runRefreshPrices, runRefreshResearch } from "@/lib/jobs";

export interface RunState {
  ok: boolean;
  message?: string;
}

export async function runPriceRefreshAction(_prev: RunState): Promise<RunState> {
  const user = await requireOwner();
  if (!(await checkRateLimit("job:refresh-prices", 600, 3))) {
    return { ok: false, message: "Rate limit: at most 3 manual refreshes per 10 minutes." };
  }
  try {
    const s = await runRefreshPrices({ trigger: "manual", triggeredBy: user.id });
    const p = s.status === "failed" ? null : await runPortfolioSnapshotsJob({ trigger: "chained", triggeredBy: user.id });
    revalidatePath("/settings/data-health");
    revalidatePath("/");
    return {
      ok: s.status !== "failed",
      message: `Prices ${s.status} (${s.recordsUpdated} records, ${s.itemsFailed} failures) · Snapshots ${p?.status ?? "skipped"}${p?.error ? `: ${p.error}` : ""}.`,
    };
  } catch (e) {
    console.error("[data-health] manual refresh failed", e);
    return { ok: false, message: "Refresh could not start. Check server configuration (SUPABASE_SECRET_KEY, provider keys)." };
  }
}

/** Owner-only: refresh research data for ~3 minutes, then recompute scores. Safe to click repeatedly during the initial backfill. */
export async function runResearchRefreshAction(_prev: RunState): Promise<RunState> {
  const user = await requireOwner();
  if (!(await checkRateLimit("job:refresh-research", 600, 4))) {
    return { ok: false, message: "Rate limit: at most 4 research refreshes per 10 minutes." };
  }
  try {
    const r = await runRefreshResearch({ trigger: "manual", triggeredBy: user.id, budgetMs: 180_000 });
    const s = await runComputeScores({ trigger: "chained", triggeredBy: user.id });
    revalidatePath("/settings/data-health");
    revalidatePath("/");
    revalidatePath("/research");
    revalidatePath("/opportunities");
    revalidatePath("/planner");
    const p = r.progress;
    const left = p ? p.pending.fundamentals - p.done.fundamentals : null;
    return {
      ok: r.summary.status !== "failed" && s.summary.status !== "failed",
      message:
        `Research ${r.summary.status}: ${p?.done.fundamentals ?? 0} companies' financials, ${p?.done.prices ?? 0} price histories updated` +
        (left && left > 0 ? ` · ${left} companies still queued — run again to continue` : " · universe up to date") +
        ` · Scores ${s.summary.status} (${s.result?.scored ?? 0} scored).`,
    };
  } catch (e) {
    console.error("[data-health] research refresh failed", e);
    return { ok: false, message: "Research refresh could not start. Check server configuration (SUPABASE_SECRET_KEY, provider keys)." };
  }
}
