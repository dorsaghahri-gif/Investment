"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dnaFormSchema, formDataToDnaInput, toProfileRow } from "@/lib/profile/dna";

export interface DnaState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  version?: number;
}

export async function saveDnaAction(_prev: DnaState, formData: FormData): Promise<DnaState> {
  const user = await requireUser();
  const parsed = dnaFormSchema.safeParse(formDataToDnaInput(formData));
  if (!parsed.success) {
    return { ok: false, message: "Some values need attention.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("investment_profiles")
    .upsert({ user_id: user.id, ...toProfileRow(parsed.data) }, { onConflict: "user_id" })
    .select("version")
    .single();
  if (error) {
    console.error("[dna] save failed", error.message);
    return { ok: false, message: "Could not save. Nothing was changed." };
  }
  revalidatePath("/settings/dna");
  return { ok: true, version: data.version as number, message: `Saved as version ${data.version}. Earlier versions are kept for history.` };
}
