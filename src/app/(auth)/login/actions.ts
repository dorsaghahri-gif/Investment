"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isInvited } from "@/lib/auth/access";
import { publicEnv } from "@/lib/public-env";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
}

const schema = z.object({ email: z.email().max(254) });

// Identical response for allowed and non-allowed emails (no account enumeration).
const SENT: LoginState = {
  status: "sent",
  message: "If this email has been invited, a sign-in link is on its way. It expires in 1 hour.",
};

export async function requestMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  const email = parsed.data.email.toLowerCase();

  if (!(await isInvited(email))) {
    console.warn("[auth] sign-in requested for an email that is not on the access list");
    return SENT;
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${publicEnv.siteUrl}/auth/callback`, shouldCreateUser: true },
  });
  if (error) {
    console.error("[auth] signInWithOtp failed:", error.message);
    return { status: "error", message: "Could not send the sign-in link. Try again in a minute." };
  }
  return SENT;
}
