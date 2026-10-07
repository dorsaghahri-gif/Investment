import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobStore, JobSummary, JobTrigger } from "./runner";
import type { ProviderRequestLog } from "@/lib/providers/interfaces";

export function supabaseJobStore(db: SupabaseClient): JobStore {
  return {
    async createRun(jobName: string, trigger: JobTrigger, triggeredBy: string | null) {
      const { data, error } = await db
        .from("job_runs")
        .insert({ job_name: jobName, trigger, status: "running", triggered_by: triggeredBy })
        .select("id")
        .single();
      if (error) throw new Error(`job_runs insert failed: ${error.message}`);
      return data.id as string;
    },
    async finishRun(s: JobSummary) {
      const { error } = await db
        .from("job_runs")
        .update({
          status: s.status,
          finished_at: s.finishedAt,
          records_updated: s.recordsUpdated,
          items_total: s.itemsTotal,
          items_failed: s.itemsFailed,
          failures: s.failures,
          provider_stats: s.providerStats,
          error: s.error,
        })
        .eq("id", s.runId);
      if (error) console.error("[jobs] finishRun failed", error.message);
    },
    async insertProviderRequests(runId: string, logs: ProviderRequestLog[]) {
      if (!logs.length) return;
      const { error } = await db.from("provider_requests").insert(
        logs.map((l) => ({
          provider: l.provider,
          category: l.category,
          endpoint: l.endpoint,
          symbol: l.symbol ?? null,
          http_status: l.httpStatus ?? null,
          ok: l.ok,
          error_class: l.errorClass ?? null,
          error_message: l.errorMessage ?? null,
          duration_ms: l.durationMs,
          schema_warnings: l.schemaWarnings ?? null,
          job_run_id: runId,
        })),
      );
      if (error) throw new Error(error.message);
    },
  };
}
