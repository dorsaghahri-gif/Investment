import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/dal";
import { listMyShares } from "@/lib/portfolio/sharing";
import { listPortfoliosSharedWithMe } from "@/lib/portfolio/repository";
import { formatTimestamp } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShareForm } from "./share-form";
import { revokeShareAction } from "./actions";

export const metadata: Metadata = { title: "Sharing" };

export default async function SharingPage() {
  const user = await requireUser();
  const [mine, withMe] = await Promise.all([listMyShares(user), listPortfoliosSharedWithMe(user.email)]);
  const active = mine.filter((s) => !s.revoked_at);
  return (
    <>
      <PageHeader title="Sharing" description="Give specific people read-only access to your portfolio: accounts, holdings, values and (optionally) transactions. They can never edit anything." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Share my portfolio</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ShareForm />
            {active.length > 0 && (
              <ul className="divide-y rounded-md border text-sm">
                {active.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      {s.viewer_email}
                      <div className="text-[11px] text-muted-foreground">since {formatTimestamp(s.created_at)} · {s.include_transactions ? "incl. transactions" : "holdings only"}</div>
                    </div>
                    <form action={revokeShareAction}>
                      <input type="hidden" name="shareId" value={s.id} />
                      <Button size="xs" variant="ghost">Stop sharing</Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Shared with me</CardTitle></CardHeader>
          <CardContent>
            {withMe.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody has shared a portfolio with you yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {withMe.map((p) => (
                  <li key={p.ownerId} className="flex items-center justify-between">
                    <span>{p.ownerName ?? p.ownerEmail} <Badge variant="secondary" className="ml-1">read-only</Badge></span>
                    <Link className="text-xs text-primary hover:underline" href={`/portfolio?owner=${p.ownerId}`}>Open</Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
