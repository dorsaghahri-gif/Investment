/** Wiring: real stores + registry providers for each job. */
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getProviders } from "@/lib/providers/registry";
import { runJob, type JobTrigger } from "./runner";
import { supabaseJobStore } from "./store-supabase";
import { supabaseMarketStore } from "./store-market-supabase";
import { refreshPrices } from "./refresh-prices";
import { runPortfolioSnapshots } from "./portfolio-snapshots";

export const JOBS = {
  "refresh-prices": "Quotes, daily prices & profiles",
  "portfolio-snapshots": "Daily portfolio snapshots & risk metrics",
} as const;
export type JobName = keyof typeof JOBS;

export async function runRefreshPrices(opts: { trigger: JobTrigger; triggeredBy?: string | null; symbols?: string[] }) {
  const db = createSupabaseAdminClient();
  const store = supabaseJobStore(db);
  return runJob(
    "refresh-prices",
    async (ctx) => {
      const providers = getProviders({ logger: ctx.logger });
      await refreshPrices(ctx, {
        store: supabaseMarketStore(db),
        market: providers.market_data,
        companyInfo: providers.company_info,
        today: new Date().toISOString().slice(0, 10),
        symbols: opts.symbols,
      });
    },
    { store, trigger: opts.trigger, triggeredBy: opts.triggeredBy ?? null },
  );
}

export async function runPortfolioSnapshotsJob(opts: { trigger: JobTrigger; triggeredBy?: string | null }) {
  const db = createSupabaseAdminClient();
  return runJob("portfolio-snapshots", (ctx) => runPortfolioSnapshots(ctx, db), {
    store: supabaseJobStore(db),
    trigger: opts.trigger,
    triggeredBy: opts.triggeredBy ?? null,
  });
}

/** Retention: provider request logs older than 30 days are pruned. */
export async function pruneOperationalLogs(days = 30) {
  const db = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  await db.from("provider_requests").delete().lt("requested_at", cutoff);
}
