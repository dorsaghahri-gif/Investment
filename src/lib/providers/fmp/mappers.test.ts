import { describe, expect, it } from "vitest";
import * as M from "./mappers";
import { classifyFmpBody } from "./index";

describe("FMP quote mapping", () => {
  it("converts percent change to fraction and keeps missing as null", () => {
    const q = M.mapQuote({ symbol: "nvda", price: 120.5, changePercentage: 2.5, change: 2.94, timestamp: 1_760_000_000 })!;
    expect(q.symbol).toBe("NVDA");
    expect(q.changePct).toBeCloseTo(0.025);
    expect(q.marketCap).toBeNull();
    expect(q.volume).toBeNull();
    expect(q.quoteTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it("accepts the legacy changesPercentage field", () => {
    expect(M.mapQuote({ symbol: "A", changesPercentage: -1 })!.changePct).toBeCloseTo(-0.01);
  });
  it("rejects rows without symbol", () => {
    expect(M.mapQuote({ price: 1 })).toBeNull();
  });
});

describe("FMP bars", () => {
  it("requires date and close", () => {
    expect(M.mapBar("x", { date: "2026-01-02", close: null })).toBeNull();
    expect(M.mapBar("x", { date: "2026-01-02", close: 10 })!.open).toBeNull();
  });
  it("unwraps v3 {historical: []} payloads", () => {
    expect(M.asRows({ symbol: "A", historical: [{ date: "2026-01-02" }] })).toHaveLength(1);
  });
});

describe("FMP statements", () => {
  it("maps line items with fallbacks; unknown => null", () => {
    const st = M.mapStatement("aapl", "income", "quarter", {
      date: "2026-06-27",
      period: "Q3",
      fiscalYear: "2026",
      reportedCurrency: "USD",
      fillingDate: "2026-08-01",
      revenue: 94_000_000_000,
      epsdiluted: 1.57,
    })!;
    expect(st.fiscalQuarter).toBe(3);
    expect(st.fiscalYear).toBe(2026);
    expect(st.filedAt).toBe("2026-08-01");
    expect(st.lineItems.revenue).toBe(94e9);
    expect(st.lineItems.eps_diluted).toBe(1.57);
    expect(st.lineItems.net_income).toBeNull();
  });
  it("keeps capex sign as reported", () => {
    const st = M.mapStatement("x", "cash_flow", "annual", { date: "2025-12-31", capitalExpenditure: -500 })!;
    expect(st.lineItems.capital_expenditure).toBe(-500);
  });
});

describe("FMP provider metrics merge", () => {
  it("joins key-metrics, ratios and growth by date", () => {
    const out = M.mapProviderMetrics(
      "x",
      "annual",
      [{ date: "2025-12-31", returnOnInvestedCapital: 0.21, marketCap: 1e12 }],
      [{ date: "2025-12-31", grossProfitMargin: 0.46, priceToEarningsRatio: 30 }, { date: "2024-12-31", grossProfitMargin: 0.44 }],
      [],
    );
    expect(out).toHaveLength(2);
    expect(out[0].asOf).toBe("2025-12-31");
    expect(out[0].metrics.roic).toBe(0.21);
    expect(out[0].metrics.pe).toBe(30);
    expect(out[0].metrics.revenue_growth).toBeNull();
    expect(out[1].metrics.roic).toBeNull();
  });
});

describe("FMP insider / filings / institutional", () => {
  it("parses transaction code and computes value only when both inputs exist", () => {
    const t = M.mapInsider("x", {
      transactionDate: "2026-09-01",
      reportingName: "Jane Doe",
      transactionType: "S-Sale",
      acquisitionOrDisposition: "D",
      securitiesTransacted: 1000,
      price: 50,
    })!;
    expect(t.transactionCode).toBe("S");
    expect(t.acquiredDisposed).toBe("D");
    expect(t.value).toBe(50_000);
    const u = M.mapInsider("x", { transactionDate: "2026-09-01", reportingName: "J", securitiesTransacted: 1000 })!;
    expect(u.value).toBeNull();
  });
  it("extracts accession numbers from EDGAR urls", () => {
    expect(M.accessionFromUrl("https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/0000320193-25-000079-index.htm")).toBe(
      "0000320193-25-000079",
    );
    expect(M.accessionFromUrl("https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl.htm")).toBe("0000320193-25-000079");
    expect(M.accessionFromUrl(null)).toBeNull();
  });
  it("converts institutional ownership percent", () => {
    expect(M.mapInstitutional("x", { date: "2026-06-30", ownershipPercent: 62.5 })!.ownershipPct).toBeCloseTo(0.625);
  });
  it("chooses the latest quarter past the 13F deadline", () => {
    expect(M.latestReportedQuarter(new Date("2026-10-06T00:00:00Z"))).toEqual({ year: 2026, quarter: 2 });
    expect(M.latestReportedQuarter(new Date("2026-08-20T00:00:00Z"))).toEqual({ year: 2026, quarter: 2 });
    expect(M.latestReportedQuarter(new Date("2026-08-10T00:00:00Z"))).toEqual({ year: 2026, quarter: 1 });
    expect(M.latestReportedQuarter(new Date("2026-02-01T00:00:00Z"))).toEqual({ year: 2025, quarter: 3 });
  });
});

describe("news & peers", () => {
  it("never invents sentiment", () => {
    const n = M.mapNews({ title: "t", url: "https://x", publishedDate: "2026-10-05 10:00:00", symbol: "msft", site: "x.com" })!;
    expect(n.sentiment).toBeNull();
    expect(n.symbols).toEqual(["MSFT"]);
    expect(n.publisher).toBe("x.com");
  });
  it("supports both peers payload shapes", () => {
    expect(M.mapPeers([{ symbol: "AMD" }, { symbol: "intc" }])).toEqual(["AMD", "INTC"]);
    expect(M.mapPeers([{ symbol: "NVDA", peersList: ["AMD", "AVGO"] }])).toEqual(["AMD", "AVGO"]);
  });
});

describe("classifyFmpBody", () => {
  it("classifies plan restrictions, auth and rate limits", () => {
    expect(classifyFmpBody(402, { "Error Message": "Restricted Endpoint: This endpoint is not available under your current subscription" })?.errorClass).toBe(
      "plan_restricted",
    );
    expect(classifyFmpBody(401, { "Error Message": "Invalid API KEY. Feel free to create a Free API Key" })?.errorClass).toBe("auth");
    expect(classifyFmpBody(429, { "Error Message": "Limit Reach . Please upgrade your plan" })?.errorClass).toBe("rate_limited");
    expect(classifyFmpBody(200, [{ symbol: "A" }])).toBeNull();
  });
});
