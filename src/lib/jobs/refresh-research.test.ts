import { describe, expect, it } from "vitest";
import { refreshResearch, type ResearchStore, type ResearchTarget } from "./refresh-research";
import { runJob, type JobStore } from "./runner";
import { createMockProvider } from "@/lib/providers/mock";
import { ProviderError } from "@/lib/providers/errors";
import type { CompanyInfoProvider, EstimatesProvider } from "@/lib/providers/interfaces";
import { FALLBACK_UNIVERSE } from "@/lib/research/universe";

const jobStore: JobStore = { createRun: async () => "run", finishRun: async () => {}, insertProviderRequests: async () => {} };

function memStore(seed: ResearchTarget[] = []) {
  const caps = new Map<string, { available: boolean; checkedAt: string }>();
  const targets = new Map(seed.map((t) => [t.symbol, t]));
  const calls = { statements: 0, estimates: 0, bars: 0, universeTag: "" };
  const store: ResearchStore = {
    ensureCompanies: async (symbols) => new Map(symbols.map((s) => [s, `id-${s}`])),
    upsertQuotes: async (rows) => rows.length,
    upsertBars: async (_id, b) => {
      calls.bars++;
      return b.data.length;
    },
    upsertProfile: async () => {},
    getCapability: async (c) => caps.get(c) ?? null,
    setCapability: async (c, available) => void caps.set(c, { available, checkedAt: new Date().toISOString() }),
    setUniverse: async (symbols, tag) => {
      calls.universeTag = tag;
      for (const s of symbols)
        if (!targets.has(s)) targets.set(s, { id: `id-${s}`, symbol: s, securityType: "stock", held: false, inUniverse: true, profileFetchedAt: new Date().toISOString(), fundamentalsFetchedAt: null, estimatesFetchedAt: null });
      return symbols.length;
    },
    listTargets: async () => [...targets.values()].map((t) => ({ ...t })),
    latestPriceDates: async () => new Map(),
    upsertStatements: async (_id, rows) => {
      calls.statements++;
      return rows.length;
    },
    markFundamentalsFetched: async () => {},
    upsertEstimates: async (_id, rows) => rows.length,
    upsertPriceTarget: async () => {},
    markEstimatesFetched: async () => {},
  };
  return { store, caps, calls };
}

const restricted = () => new ProviderError("fmp", "plan_restricted", "Restricted Endpoint: upgrade your plan");

describe("refresh-research job", () => {
  const mock = createMockProvider(() => new Date("2026-10-05T22:00:00Z"));

  it("falls back to the built-in universe when the index list is plan-restricted, and remembers it", async () => {
    const m = memStore();
    const companyInfo: CompanyInfoProvider = { ...mock.company_info!, getIndexConstituents: async () => { throw restricted(); } };
    let estimateCalls = 0;
    const estimates: EstimatesProvider = {
      ...mock.estimates!,
      getEstimates: async () => {
        estimateCalls++;
        throw restricted();
      },
      getPriceTargetConsensus: async () => { throw restricted(); },
    };
    const summary = await runJob("refresh-research", (ctx) =>
      refreshResearch(ctx, { store: m.store, market: mock.market_data!, companyInfo, fundamentals: mock.fundamentals!, estimates, today: "2026-10-05", budgetMs: 60_000 }).then(() => {}),
      { store: jobStore },
    );
    expect(m.calls.universeTag).toBe("core100");
    expect(m.caps.get("index_sp500")?.available).toBe(false);
    expect(m.caps.get("estimates")?.available).toBe(false);
    // a restricted plan costs a handful of calls (bounded by concurrency), not one per company
    expect(estimateCalls).toBeLessThanOrEqual(4);
    expect(m.calls.statements).toBe(FALLBACK_UNIVERSE.length * 3);
    expect(summary.status).not.toBe("failed");
  });

  it("stops scheduling work once the time budget is spent", async () => {
    const m = memStore();
    let t = 0;
    const now = () => t;
    const fundamentals = {
      ...mock.fundamentals!,
      getStatements: async (...a: Parameters<NonNullable<typeof mock.fundamentals>["getStatements"]>) => {
        t += 1000; // each call "takes" 1s
        return mock.fundamentals!.getStatements(...a);
      },
    };
    await runJob("refresh-research", (ctx) =>
      refreshResearch(ctx, { store: m.store, market: mock.market_data!, companyInfo: mock.company_info!, fundamentals, estimates: mock.estimates!, today: "2026-10-05", budgetMs: 10_000, now }).then(() => {}),
      { store: jobStore },
    );
    expect(m.calls.statements).toBeGreaterThan(0);
    expect(m.calls.statements).toBeLessThan(40);
  });
});
