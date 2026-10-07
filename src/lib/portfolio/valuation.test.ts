import { describe, expect, it } from "vitest";
import { valuePortfolio } from "./valuation";

const h = (p: Partial<Parameters<typeof valuePortfolio>[0][number]>) => ({
  id: "x",
  symbol: "X",
  quantity: 1,
  costBasisTotal: null,
  price: null,
  changePct: null,
  previousClose: null,
  quoteTime: null,
  ...p,
});

describe("valuePortfolio", () => {
  it("values priced positions and excludes unpriced ones from totals", () => {
    const v = valuePortfolio(
      [
        h({ symbol: "NVDA", quantity: 10, price: 130, previousClose: 120, costBasisTotal: 1000, quoteTime: "2026-10-05T20:00:00Z" }),
        h({ symbol: "QXO", quantity: 100, price: null }),
      ],
      700,
    );
    expect(v.investedValue).toBe(1300);
    expect(v.totalValue).toBe(2000);
    expect(v.unpricedSymbols).toEqual(["QXO"]);
    expect(v.holdings[0].weight).toBeCloseTo(0.65);
    expect(v.holdings[1].weight).toBeNull();
    expect(v.unrealizedPnlKnown).toBe(300);
    expect(v.dayChange).toBe(100);
    expect(v.dayChangePct).toBeCloseTo(100 / 1900);
  });
  it("reports unknown P&L when no cost basis is known", () => {
    const v = valuePortfolio([h({ price: 10 })], 0);
    expect(v.unrealizedPnlKnown).toBeNull();
    expect(v.unknownCostSymbols).toEqual(["X"]);
  });

  it("excludes non-base-currency positions instead of mixing currencies", () => {
    const v = valuePortfolio([h({ symbol: "SHOP", price: 100, currency: "CAD" }), h({ symbol: "A", price: 10 })], 0);
    expect(v.investedValue).toBe(10);
    expect(v.foreignCurrencySymbols).toEqual(["SHOP (CAD)"]);
    expect(v.unpricedSymbols).toEqual([]);
  });
});
