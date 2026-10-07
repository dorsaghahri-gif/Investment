/**
 * Service-role Supabase client — BYPASSES RLS.
 * Only for scheduled jobs and server-side ingestion of shared market data.
 * Never import from a Client Component (server-only enforces this).
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

let admin: SupabaseClient | null = null;

export function createSupabaseAdminClient(): SupabaseClient {
  if (admin) return admin;
  const env = serverEnv();
  if (!env.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY is not configured (required for jobs).");
  admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
