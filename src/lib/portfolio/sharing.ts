/** Read-only portfolio sharing (any user can share their own portfolio with invited users). */
import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/auth/dal";

export interface ShareRow {
  id: string;
  viewer_email: string;
  include_transactions: boolean;
  created_at: string;
  revoked_at: string | null;
}

export const shareSchema = z.object({
  email: z.email().max(254).transform((e) => e.trim().toLowerCase()),
  includeTransactions: z
    .union([z.literal("on"), z.undefined(), z.null()])
    .transform((v) => v === "on"),
});

export class ShareError extends Error {}

export async function listMyShares(user: CurrentUser): Promise<ShareRow[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("portfolio_shares")
    .select("id, viewer_email, include_transactions, created_at, revoked_at")
    .eq("owner_id", user.id)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as ShareRow[];
}

export async function sharePortfolio(user: CurrentUser, input: z.infer<typeof shareSchema>) {
  if (input.email === user.email) throw new ShareError("You already see your own portfolio.");
  const db = await createSupabaseServerClient();
  const { error } = await db.from("portfolio_shares").upsert(
    { owner_id: user.id, viewer_email: input.email, include_transactions: input.includeTransactions, revoked_at: null },
    { onConflict: "owner_id,viewer_email" },
  );
  if (error) {
    // RLS rejects shares with people who are not on the access list
    if (error.code === "42501") throw new ShareError("You can only share with people who have been invited to the app.");
    throw new Error(error.message);
  }
}

export async function revokeShare(user: CurrentUser, shareId: string) {
  const db = await createSupabaseServerClient();
  const { error } = await db.from("portfolio_shares").update({ revoked_at: new Date().toISOString() }).eq("id", shareId).eq("owner_id", user.id);
  if (error) throw new Error(error.message);
}
