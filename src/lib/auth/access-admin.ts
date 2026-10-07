/**
 * Invite-list management (owner only). Writes go through the RLS-scoped
 * client, so the database itself enforces that only owners can change the
 * list. The service role is used only to send the Supabase invite email.
 */
import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/public-env";
import type { AccessRole, CurrentUser } from "./dal";

export interface AccessEntry {
  email: string;
  role: AccessRole;
  display_name: string | null;
  invited_at: string;
  revoked_at: string | null;
  note: string | null;
}

export const inviteSchema = z.object({
  email: z.email().max(254).transform((e) => e.trim().toLowerCase()),
  role: z.enum(["member", "owner"]).default("member"),
  displayName: z.string().trim().max(80).optional().transform((v) => v || null),
  sendEmail: z
    .union([z.literal("on"), z.literal("true"), z.undefined(), z.null()])
    .transform((v) => v === "on" || v === "true"),
});

export class AccessError extends Error {}

function assertOwner(user: CurrentUser) {
  if (user.role !== "owner") throw new AccessError("Only owners can manage access.");
}

export async function listAccess(user: CurrentUser): Promise<AccessEntry[]> {
  assertOwner(user);
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("access_list")
    .select("email, role, display_name, invited_at, revoked_at, note")
    .order("revoked_at", { nullsFirst: true })
    .order("invited_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as AccessEntry[];
}

export async function inviteUser(user: CurrentUser, input: z.infer<typeof inviteSchema>): Promise<{ emailSent: boolean; note?: string }> {
  assertOwner(user);
  const db = await createSupabaseServerClient();
  const { error } = await db.from("access_list").upsert(
    {
      email: input.email,
      role: input.role,
      display_name: input.displayName,
      invited_by: user.id,
      invited_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "email" },
  );
  if (error) throw new Error(error.message);

  if (!input.sendEmail) return { emailSent: false };
  const admin = createSupabaseAdminClient();
  const res = await admin.auth.admin.inviteUserByEmail(input.email, { redirectTo: `${publicEnv.siteUrl}/auth/callback` });
  if (res.error) {
    // Most common: the person already has an account — they can simply sign in.
    if (/already/i.test(res.error.message)) return { emailSent: false, note: "They already have an account and can sign in directly." };
    console.error("[access] invite email failed", res.error.message);
    return { emailSent: false, note: "Added to the access list, but the invite email could not be sent. They can sign in from the login page." };
  }
  return { emailSent: true };
}

export async function setRevoked(user: CurrentUser, email: string, revoked: boolean) {
  assertOwner(user);
  if (revoked && email.toLowerCase() === user.email) throw new AccessError("You can't revoke your own access.");
  const db = await createSupabaseServerClient();
  const { error } = await db
    .from("access_list")
    .update({ revoked_at: revoked ? new Date().toISOString() : null })
    .eq("email", email.toLowerCase());
  if (error) {
    if (/last owner/i.test(error.message)) throw new AccessError("You can't remove the last owner.");
    throw new Error(error.message);
  }
}

export async function setRole(user: CurrentUser, email: string, role: AccessRole) {
  assertOwner(user);
  const db = await createSupabaseServerClient();
  const { error } = await db.from("access_list").update({ role }).eq("email", email.toLowerCase());
  if (error) {
    if (/last owner/i.test(error.message)) throw new AccessError("You can't demote the last owner.");
    throw new Error(error.message);
  }
}
