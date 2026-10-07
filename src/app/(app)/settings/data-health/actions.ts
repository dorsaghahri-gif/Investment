"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { runPortfolioSnapshotsJob, runRefreshPrices } from "@/lib/jobs";

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
