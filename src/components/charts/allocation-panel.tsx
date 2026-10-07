"use client";

import { useState } from "react";
import { BarList } from "./bar-list";
import { cn } from "@/lib/utils";

type G = { group: string; weight: number }[];

export function AllocationPanel({ byCompany, bySector, byIndustry, byAssetClass }: { byCompany: G; bySector: G; byIndustry: G; byAssetClass: G }) {
  const tabs = { Company: byCompany, Sector: bySector, Industry: byIndustry, "Asset class": byAssetClass } as const;
  const [tab, setTab] = useState<keyof typeof tabs>("Company");
  return (
    <div>
      <div className="mb-3 inline-flex rounded-md border p-0.5" role="tablist">
        {(Object.keys(tabs) as (keyof typeof tabs)[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded px-2 py-0.5 text-[11px] font-medium", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}>
            {k}
          </button>
        ))}
      </div>
      <BarList items={tabs[tab].map((g) => ({ label: g.group, value: g.weight }))} format={(v) => `${(v * 100).toFixed(1)}%`} />
    </div>
  );
}
