"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { revokeShare, shareSchema, sharePortfolio, ShareError } from "@/lib/portfolio/sharing";

export interface FormState {
  ok: boolean;
  message?: string;
}

export async function shareAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = shareSchema.safeParse({ email: formData.get("email"), includeTransactions: formData.get("includeTransactions") });
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  try {
    await sharePortfolio(user, parsed.data);
  } catch (e) {
    if (e instanceof ShareError) return { ok: false, message: e.message };
    console.error("[sharing]", e);
    return { ok: false, message: "Could not share. Nothing was changed." };
  }
  revalidatePath("/settings/sharing");
  return { ok: true, message: `${parsed.data.email} can now view your portfolio (read-only).` };
}

export async function revokeShareAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.uuid().safeParse(formData.get("shareId"));
  if (!id.success) return;
  await revokeShare(user, id.data);
  revalidatePath("/settings/sharing");
}
