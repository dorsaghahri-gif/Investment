import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Postgres-backed fixed-window rate limit (shared across serverless instances).
 * Keyed per user by the database function. Fails closed on errors.
 */
export async function checkRateLimit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
  if (error) {
    console.error("[rate-limit] check failed", error.message);
    return false;
  }
  return data === true;
}
