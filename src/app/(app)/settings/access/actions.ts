"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/dal";
import { AccessError, inviteSchema, inviteUser, setRevoked, setRole } from "@/lib/auth/access-admin";
import { checkRateLimit } from "@/lib/security/rate-limit";

export interface FormState {
  ok: boolean;
  message?: string;
}

const fail = (e: unknown): FormState => {
  if (e instanceof AccessError) return { ok: false, message: e.message };
  console.error("[access action]", e);
  return { ok: false, message: "Something went wrong. No changes were made." };
};

export async function inviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireOwner();
  if (!(await checkRateLimit("access:invite", 3600, 20))) return { ok: false, message: "Invite limit reached (20 per hour)." };
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role") ?? "member",
    displayName: formData.get("displayName") ?? undefined,
    sendEmail: formData.get("sendEmail"),
  });
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  try {
    const r = await inviteUser(user, parsed.data);
    revalidatePath("/settings/access");
    return {
      ok: true,
      message: r.emailSent ? `Invite sent to ${parsed.data.email}.` : `${parsed.data.email} can now sign in. ${r.note ?? "Send them the app link."}`,
    };
  } catch (e) {
    return fail(e);
  }
}

const emailOnly = z.object({ email: z.email() });

export async function revokeAction(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const p = emailOnly.safeParse({ email: formData.get("email") });
  if (!p.success) return;
  try {
    await setRevoked(user, p.data.email, true);
  } catch (e) {
    console.error("[access] revoke failed", e);
  }
  revalidatePath("/settings/access");
}

export async function restoreAction(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const p = emailOnly.safeParse({ email: formData.get("email") });
  if (!p.success) return;
  await setRevoked(user, p.data.email, false).catch((e) => console.error("[access] restore failed", e));
  revalidatePath("/settings/access");
}

export async function roleAction(formData: FormData): Promise<void> {
  const user = await requireOwner();
  const p = z.object({ email: z.email(), role: z.enum(["owner", "member"]) }).safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!p.success) return;
  await setRole(user, p.data.email, p.data.role).catch((e) => console.error("[access] role change failed", e));
  revalidatePath("/settings/access");
}
