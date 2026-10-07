import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toFormDefaults, type ProfileRow } from "@/lib/profile/dna";
import { formatTimestamp } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DnaWizard } from "./wizard";

export const metadata: Metadata = { title: "My Investment DNA" };

export default async function DnaPage() {
  const user = await requireUser();
  const db = await createSupabaseServerClient();
  const { data } = await db.from("investment_profiles").select("*").eq("user_id", user.id).maybeSingle();
  const row = data as (ProfileRow & { version: number; updated_at: string }) | null;
  return (
    <>
      <PageHeader
        title="My Investment DNA"
        description="Your criteria, limits and preferences. They drive personal fit, recommendations and alerts. Change them any time; every version is kept."
        actions={row ? <Badge variant="secondary">v{row.version} · updated {formatTimestamp(row.updated_at)}</Badge> : <Badge variant="outline">Not set yet</Badge>}
      />
      <Card>
        <CardContent className="pt-5">
          <DnaWizard defaults={toFormDefaults(row)} />
        </CardContent>
      </Card>
    </>
  );
}
