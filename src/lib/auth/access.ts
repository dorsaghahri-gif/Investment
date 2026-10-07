/**
 * Invite-list checks that run before a user has a session (login form).
 * Uses the service role because anonymous callers cannot read access_list.
 */
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function isInvited(email: string): Promise<boolean> {
  let db;
  try {
    db = createSupabaseAdminClient();
  } catch (e) {
    console.error("[auth] cannot check access list:", (e as Error).message);
    return false; // fail closed when the server is misconfigured
  }
  const { data, error } = await db
    .from("access_list")
    .select("email")
    .eq("email", email.trim().toLowerCase())
    .is("revoked_at", null)
    .maybeSingle();
  if (error) {
    console.error("[auth] access_list lookup failed", error.message);
    return false; // fail closed
  }
  return !!data;
}
