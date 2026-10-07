import { describe, expect, it } from "vitest";
import { createFmpProvider } from "./index";
import type { ProviderRequestLog } from "../interfaces";

function routeFetch(routes: Record<string, { status: number; body: unknown }>) {
  const seen: string[] = [];
  const impl = (async (url: string) => {
    const u = new URL(url);
    seen.push(u.pathname + "?" + u.searchParams.toString());
    const key = u.pathname.replace("/stable/", "");
    const r = routes[key] ?? { status: 404, body: { "Error Message": "not found" } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, seen };
}

describe("FMP provider", () => {
  it("falls back to per-symbol quotes when batch endpoint is plan-restricted", async () => {
    const logs: ProviderRequestLog[] = [];
    const { impl, seen } = routeFetch({
      "batch-quote": { status: 402, body: { "Error Message": "Restricted Endpoint: not available under your current subscription" } },
      quote: { status: 200, body: [{ symbol: "AAPL", price: 200, changePercentage: 1 }] },
    });
    const p = createFmpProvider({ apiKey: "KEY", fetchImpl: impl, sleep: async () => {}, logger: (l) => logs.push(l), rateLimitPerMinute: 60_000 });
    const quotes = await p.market_data!.getQuotes(["aapl"]);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].data.changePct).toBeCloseTo(0.01);
    expect(quotes[0].provenance.provider).toBe("fmp");
    expect(seen.some((s) => s.startsWith("/stable/quote?symbol=AAPL"))).toBe(true);
    expect(logs.find((l) => !l.ok)?.errorClass).toBe("plan_restricted");
    expect(JSON.stringify(logs)).not.toContain("KEY&");
  });

  it("refuses to construct without an API key", () => {
    expect(() => createFmpProvider({ apiKey: "" })).toThrow(/FMP_API_KEY/);
  });

  it("tags statements as reported and metrics as provider_derived", async () => {
    const { impl } = routeFetch({
      "income-statement": { status: 200, body: [{ date: "2025-12-31", revenue: 10 }] },
      "key-metrics": { status: 200, body: [{ date: "2025-12-31", returnOnEquity: 0.3 }] },
      ratios: { status: 200, body: [] },
      "financial-growth": { status: 402, body: { "Error Message": "premium endpoint" } },
    });
    const p = createFmpProvider({ apiKey: "KEY", fetchImpl: impl, sleep: async () => {}, rateLimitPerMinute: 60_000 });
    const st = await p.fundamentals!.getStatements("x", "income", "annual", 5);
    expect(st[0].provenance.dataKind).toBe("reported");
    const m = await p.fundamentals!.getProviderMetrics("x", "annual", 5);
    expect(m[0].provenance.dataKind).toBe("provider_derived");
    expect(m[0].data.metrics.roe).toBe(0.3);
  });
});
