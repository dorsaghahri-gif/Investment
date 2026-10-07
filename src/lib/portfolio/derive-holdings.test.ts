import { describe, expect, it } from "vitest";
import { deriveHoldings } from "./derive-holdings";
import type { TransactionInput } from "./types";

const tx = (p: Partial<TransactionInput> & Pick<TransactionInput, "type" | "tradeDate" | "amount">): TransactionInput => ({
  symbol: null,
  quantity: null,
  price: null,
  fees: 0,
  currency: "USD",
  splitRatio: null,
  description: null,
  externalId: null,
  ...p,
});

describe("deriveHoldings", () => {
  it("computes average cost through buys, partial sell and split", () => {
    const r = deriveHoldings([
      tx({ type: "deposit", tradeDate: "2026-01-01", amount: 10_000 }),
      tx({ type: "buy", symbol: "NVDA", tradeDate: "2026-01-02", quantity: 10, price: 100, amount: -1_000 }),
      tx({ type: "buy", symbol: "NVDA", tradeDate: "2026-02-02", quantity: 10, price: 200, amount: -2_000 }),
      tx({ type: "sell", symbol: "NVDA", tradeDate: "2026-03-01", quantity: 5, price: 250, amount: 1_250 }),
      tx({ type: "split", symbol: "NVDA", tradeDate: "2026-04-01", splitRatio: 2, amount: 0 }),
      tx({ type: "dividend", symbol: "NVDA", tradeDate: "2026-05-01", amount: 12 }),
    ]);
    expect(r.issues).toEqual([]);
    expect(r.positions).toEqual([{ symbol: "NVDA", quantity: 30, costBasisTotal: 2_250, firstAcquired: "2026-01-02" }]);
    expect(r.cash).toBe(10_000 - 3_000 + 1_250 + 12);
  });

  it("reports oversells instead of clamping", () => {
    const r = deriveHoldings([
      tx({ type: "buy", symbol: "A", tradeDate: "2026-01-01", quantity: 1, amount: -10 }),
      tx({ type: "sell", symbol: "A", tradeDate: "2026-01-02", quantity: 2, amount: 20 }),
    ]);
    expect(r.issues).toHaveLength(1);
    expect(r.positions[0].quantity).toBe(1);
  });

  it("marks cost basis unknown when a lot has no cost information", () => {
    const r = deriveHoldings([tx({ type: "transfer_in", symbol: "A", tradeDate: "2026-01-01", quantity: 5, amount: 0 })]);
    expect(r.positions[0].costBasisTotal).toBeNull();
  });

  it("sorts by date regardless of input order and drops closed positions", () => {
    const r = deriveHoldings([
      tx({ type: "sell", symbol: "A", tradeDate: "2026-01-02", quantity: 1, amount: 11 }),
      tx({ type: "buy", symbol: "A", tradeDate: "2026-01-01", quantity: 1, amount: -10 }),
    ]);
    expect(r.issues).toEqual([]);
    expect(r.positions).toEqual([]);
    expect(r.cash).toBe(1);
  });
});
