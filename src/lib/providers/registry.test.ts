import { describe, expect, it } from "vitest";
import { parseChain, resolveChains, withFallback, type RegistryConfig } from "./registry";
import { ProviderError } from "./errors";
import type { MarketDataProvider } from "./interfaces";
import { PROVIDER_CATEGORIES } from "./interfaces";

const allFmp = Object.fromEntries(PROVIDER_CATEGORIES.map((c) => [c, ["fmp"]])) as RegistryConfig["chains"];

describe("registry config", () => {
  it("parses chains and rejects unknown providers", () => {
    expect(parseChain("fmp, mock")).toEqual(["fmp", "mock"]);
    expect(parseChain("")).toEqual(["fmp"]);
    expect(() => parseChain("bloomberg")).toThrow(/Unknown/);
  });
  it("drops providers without credentials; uses mock only when allowed", () => {
    expect(resolveChains({ chains: allFmp, credentials: {}, allowMock: false }).market_data).toEqual([]);
    expect(resolveChains({ chains: allFmp, credentials: {}, allowMock: true }).market_data).toEqual(["mock"]);
    expect(resolveChains({ chains: allFmp, credentials: { fmpApiKey: "k" }, allowMock: true }).news).toEqual(["fmp"]);
  });
});

describe("withFallback", () => {
  const ok: MarketDataProvider = {
    id: "mock",
    getQuotes: async () => [],
    getDailyBars: async () => ({ data: [], provenance: { provider: "mock", sourceRef: "x", dataKind: "reported", asOf: "2026-01-01", fetchedAt: "2026-01-01T00:00:00Z" } }),
  };
  it("moves to the next provider on recoverable errors", async () => {
    const failing: MarketDataProvider = { ...ok, id: "fmp", getQuotes: async () => { throw new ProviderError("fmp", "unavailable", "down"); } };
    const p = withFallback("market_data", [failing, ok]);
    await expect(p.getQuotes(["A"])).resolves.toEqual([]);
  });
  it("stops on non-fallback errors", async () => {
    const fatal: MarketDataProvider = { ...ok, id: "fmp", getQuotes: async () => { throw new ProviderError("fmp", "schema", "bad", { tryNextProvider: false }); } };
    const p = withFallback("market_data", [fatal, ok]);
    await expect(p.getQuotes(["A"])).rejects.toMatchObject({ errorClass: "schema" });
  });
  it("errors clearly when no provider is configured", async () => {
    const p = withFallback("news", []);
    await expect(p.getNews(["A"])).rejects.toThrow(/No provider configured/);
  });
});
