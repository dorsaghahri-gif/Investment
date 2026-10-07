import { describe, expect, it } from "vitest";
import { refreshPrices, type MarketStore } from "./refresh-prices";
import { runJob, type JobStore } from "./runner";
import { createMockProvider } from "@/lib/providers/mock";
import { ProviderError } from "@/lib/providers/errors";
import type { MarketDataProvider } from "@/lib/providers/interfaces";

function memoryStores(tracked: string[]) {
  const runs: Record<string, unknown>[] = [];
  const logs: unknown[] = [];
  const quotes = new Map<string, number | null>();
  const bars = new Map<string, number>();
  const profiles = new Set<string>();
  const jobStore: JobStore = {
    async createRun() {
      return "run-1";
    },
    async finishRun(s) {
      runs.push(s as unknown as Record<string, unknown>);
    },
    async insertProviderRequests(_id, l) {
      logs.push(...l);
    },
  };
  const market: MarketStore = {
    async listTrackedSymbols() {
      return tracked;
    },
    async ensureCompanies(symbols) {
      return new Map(symbols.map((s) => [s, `id-${s}`]));
    },
    async upsertQuotes(rows) {
      for (const r of rows) quotes.set(r.quote.data.symbol, r.quote.data.price);
      return rows.length;
    },
    async lastPriceDates() {
      return new Map();
    },
    async upsertBars(id, b) {
      bars.set(id, b.data.length);
      return b.data.length;
    },
    async symbolsNeedingProfile(symbols) {
      return symbols;
    },
    async upsertProfile(p) {
      profiles.add(p.data.symbol);
    },
  };
  return { jobStore, market, runs, quotes, bars, profiles, logs };
}

describe("refresh-prices job", () => {
  const mock = createMockProvider(() => new Date("2026-10-05T22:00:00Z"));

  it("refreshes holdings plus benchmarks", async () => {
    const s = memoryStores(["NVDA", "msft"]);
    const summary = await runJob(
      "refresh-prices",
      (ctx) => refreshPrices(ctx, { store: s.market, market: mock.market_data!, companyInfo: mock.company_info!, today: "2026-10-05", historyYears: 1 }),
      { store: s.jobStore },
    );
    expect(summary.status).toBe("success");
    expect([...s.quotes.keys()].sort()).toEqual(["MSFT", "NVDA", "QQQ", "SPY"]);
    expect(s.bars.get("id-NVDA")).toBeGreaterThan(200);
    expect(s.profiles.size).toBe(4);
  });

  it("isolates one failing symbol and reports a partial run", async () => {
    const s = memoryStores(["NVDA", "BAD"]);
    const flaky: MarketDataProvider = {
      ...mock.market_data!,
      async getDailyBars(symbol, from, to) {
        if (symbol === "BAD") throw new ProviderError("fmp", "not_found", "unknown symbol");
        return mock.market_data!.getDailyBars(symbol, from, to);
      },
    };
    const summary = await runJob(
      "refresh-prices",
      (ctx) => refreshPrices(ctx, { store: s.market, market: flaky, companyInfo: mock.company_info!, today: "2026-10-05", historyYears: 1 }),
      { store: s.jobStore },
    );
    expect(summary.status).toBe("partial");
    expect(summary.failures.find((f) => f.item === "bars:BAD")?.errorClass).toBe("not_found");
    expect(s.bars.get("id-NVDA")).toBeGreaterThan(0);
    expect(s.bars.get("id-SPY")).toBeGreaterThan(0);
  });

  it("marks the run failed when the job itself throws", async () => {
    const s = memoryStores([]);
    const summary = await runJob("x", async () => {
      throw new Error("db down");
    }, { store: s.jobStore });
    expect(summary.status).toBe("failed");
    expect(summary.error).toBe("db down");
    expect(s.runs).toHaveLength(1);
  });
});
