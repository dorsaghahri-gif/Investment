"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LineChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENT_PHASE, NAV } from "./nav";

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <LineChart className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-white">Stock Intel</span>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2" aria-label="Main">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white",
              )}
            >
              <Icon className="size-4 shrink-0 opacity-80" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.phase > CURRENT_PHASE && <span className="text-[9px] uppercase tracking-wider text-sidebar-muted">P{item.phase}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-4 py-3">
        <div className="truncate text-[11px] text-sidebar-muted" title={email}>
          {email}
        </div>
        <form action="/auth/signout" method="post">
          <button className="mt-1 text-[11px] text-sidebar-foreground/80 hover:text-white" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b bg-card px-2 py-1.5 md:hidden" aria-label="Main">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("whitespace-nowrap rounded px-2 py-1 text-xs", active ? "bg-accent font-medium" : "text-muted-foreground")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
