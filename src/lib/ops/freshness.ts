import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FreshnessStatus = "healthy" | "stale" | "critical" | "no_data";

export interface DatasetFreshness {
  dataset: string;
  label: string;
  category: string;
  last_fetched_at: string | null;
  latest_as_of: string | null;
  max_age_hours: number;
  critical_age_hours: number;
  status: FreshnessStatus;
}

export async function getDataFreshness(): Promise<DatasetFreshness[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("data_freshness").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as DatasetFreshness[];
}

/** Worst status across the datasets that matter for portfolio display. */
export function overallStatus(rows: DatasetFreshness[], datasets = ["quotes", "daily_prices"]): FreshnessStatus {
  const order: FreshnessStatus[] = ["healthy", "stale", "critical", "no_data"];
  const relevant = rows.filter((r) => datasets.includes(r.dataset));
  if (!relevant.length) return "no_data";
  return relevant.reduce<FreshnessStatus>((w, r) => (order.indexOf(r.status) > order.indexOf(w) ? r.status : w), "healthy");
}
