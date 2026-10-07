import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { hasMockData } from "@/lib/portfolio/repository";
import { getDataFreshness, overallStatus, type FreshnessStatus } from "@/lib/ops/freshness";
import { MobileNav, Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/utils";

const STATUS: Record<FreshnessStatus, { label: string; dot: string }> = {
  healthy: { label: "Market data current", dot: "bg-positive" },
  stale: { label: "Market data stale", dot: "bg-warning" },
  critical: { label: "Market data critically stale", dot: "bg-negative" },
  no_data: { label: "No market data yet", dot: "bg-muted-foreground/50" },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [mock, freshness] = await Promise.all([hasMockData().catch(() => false), getDataFreshness().catch(() => [])]);
  const status = overallStatus(freshness);

  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        {mock && (
          <div className="flex items-center gap-2 bg-warning/90 px-4 py-1.5 text-xs font-semibold text-black">
            <AlertTriangle className="size-3.5" />
            MOCK DATA — some prices shown are synthetic development data, not real market data.
          </div>
        )}
        <header className="flex h-12 items-center justify-between border-b bg-card px-4">
          <div className="text-xs text-muted-foreground">Research &amp; decision support · never places trades</div>
          {user.role === "owner" ? (
            <Link href="/settings/data-health" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <span className={cn("size-2 rounded-full", STATUS[status].dot)} aria-hidden />
              {STATUS[status].label}
            </Link>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn("size-2 rounded-full", STATUS[status].dot)} aria-hidden />
              {STATUS[status].label}
            </span>
          )}
        </header>
        <MobileNav />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 md:px-6">{children}</main>
      </div>
    </div>
  );
}
