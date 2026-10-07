import Link from "next/link";
import { Activity, Dna, Share2, SlidersHorizontal, Users } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Settings" };

const ITEMS = [
  { href: "/settings/data-health", title: "Data Health", desc: "Provider status, freshness, job runs and failed requests.", icon: Activity, badge: null, ownerOnly: true },
  { href: "/settings/access", title: "Access", desc: "Invite people, change roles, revoke access.", icon: Users, badge: null, ownerOnly: true },
  { href: "/settings/sharing", title: "Sharing", desc: "Share your portfolio read-only, or open portfolios shared with you.", icon: Share2, badge: null, ownerOnly: false },
  { href: "/settings/dna", title: "My Investment DNA", desc: "Your criteria, limits and preferences.", icon: Dna, badge: null, ownerOnly: false },
  { href: "/settings", title: "Scoring weights", desc: "Category weights for the investment score.", icon: SlidersHorizontal, badge: "Phase 3", ownerOnly: false },
];

export default async function SettingsPage() {
  const user = await requireUser();
  const items = ITEMS.filter((i) => !i.ownerOnly || user.role === "owner");
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((i) => (
          <Link key={i.title} href={i.href}>
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardContent className="flex gap-3 pt-4">
                <i.icon className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">{i.title}{i.badge && <Badge variant="secondary">{i.badge}</Badge>}</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{i.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
