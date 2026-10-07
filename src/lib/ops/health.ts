import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { configFromEnv, resolveChains } from "@/lib/providers/registry";
import { PROVIDER_CATEGORIES, type ProviderCategory } from "@/lib/providers/interfaces";
import type { ProviderId } from "@/lib/domain/provenance";

export interface JobRunRow {
  id: string;
  job_name: string;
  trigger: string;
  status: "running" | "success" | "partial" | "failed" | "skipped";
  started_at: string;
  finished_at: string | null;
  records_updated: number;
  items_total: number | null;
  items_failed: number;
  error: string | null;
  failures: { item: string; provider: string | null; errorClass: string; message: string }[];
}

export interface ProviderFailureRow {
  id: number;
  provider: ProviderId;
  category: string;
  endpoint: string;
  symbol: string | null;
  http_status: number | null;
  error_class: string | null;
  error_message: string | null;
  requested_at: string;
}

export async function getRecentJobRuns(limit = 20): Promise<JobRunRow[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("job_runs")
    .select("id, job_name, trigger, status, started_at, finished_at, records_updated, items_total, items_failed, error, failures")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as JobRunRow[];
}

export async function getRecentProviderFailures(limit = 50): Promise<ProviderFailureRow[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("provider_requests")
    .select("id, provider, category, endpoint, symbol, http_status, error_class, error_message, requested_at")
    .eq("ok", false)
    .order("requested_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProviderFailureRow[];
}

export async function getSchemaWarnings(limit = 200): Promise<{ endpoint: string; fields: string[]; last: string }[]> {
  const db = await createSupabaseServerClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await db
    .from("provider_requests")
    .select("endpoint, schema_warnings, requested_at")
    .not("schema_warnings", "is", null)
    .gte("requested_at", since)
    .order("requested_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const byEndpoint = new Map<string, { fields: Set<string>; last: string }>();
  for (const r of data ?? []) {
    const path = String(r.endpoint).split("?")[0];
    const e = byEndpoint.get(path) ?? { fields: new Set<string>(), last: r.requested_at as string };
    for (const f of (r.schema_warnings as string[]) ?? []) e.fields.add(f);
    byEndpoint.set(path, e);
  }
  return [...byEndpoint.entries()].map(([endpoint, e]) => ({ endpoint, fields: [...e.fields], last: e.last }));
}

export interface ProviderConfigView {
  categories: { category: ProviderCategory; configured: ProviderId[]; effective: ProviderId[] }[];
  credentials: { fmp: boolean; anthropic: boolean; plaid: boolean; secEdgarUserAgent: boolean };
  error: string | null;
}

/** Describes provider configuration without exposing any secret values. */
export function getProviderConfigView(): ProviderConfigView {
  const credentials = {
    fmp: !!process.env.FMP_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    plaid: !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
    secEdgarUserAgent: !!process.env.SEC_EDGAR_USER_AGENT,
  };
  try {
    const cfg = configFromEnv();
    const eff = resolveChains(cfg);
    return {
      categories: PROVIDER_CATEGORIES.map((c) => ({ category: c, configured: cfg.chains[c], effective: eff[c] })),
      credentials,
      error: null,
    };
  } catch (e) {
    return { categories: [], credentials, error: e instanceof Error ? e.message : String(e) };
  }
}
