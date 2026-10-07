/**
 * Data Access Layer: the single entry point for "who is the current user".
 *
 * Access is invite-only. A valid Supabase session is not enough: the user's
 * email must be on the active `access_list` (checked here via the database,
 * and independently enforced by a restrictive RLS policy on every table and
 * by the before-user-created auth hook).
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AccessRole = "owner" | "member";

export interface CurrentUser {
  id: string;
  email: string;
  role: AccessRole;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  const { data: role, error: roleErr } = await supabase.rpc("current_access_role");
  if (roleErr || (role !== "owner" && role !== "member")) return null;
  return { id: data.user.id, email: data.user.email.toLowerCase(), role };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?error=not_authorized");
  return user;
}

export async function requireOwner(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/");
  return user;
}
