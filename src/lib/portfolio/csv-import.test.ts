import { describe, expect, it } from "vitest";
import { detectKind, normalizeAction, parseDate, parseMoney, parsePositionsCsv, parseTransactionsCsv } from "./csv-import";

describe("value parsing", () => {
  it("parses broker money formats", () => {
    expect(parseMoney("$1,234.56")).toBe(1234.56);
    expect(parseMoney("(12.50)")).toBe(-12.5);
    expect(parseMoney("--")).toBeNull();
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("12%")).toBeNull();
  });
  it("parses ISO and US dates and rejects impossible ones", () => {
    expect(parseDate("2026-09-30")).toBe("2026-09-30");
    expect(parseDate("9/30/2026")).toBe("2026-09-30");
    expect(parseDate("02/30/2026")).toBeNull();
  });
  it("normalizes broker action text", () => {
    expect(normalizeAction("YOU BOUGHT NVIDIA CORP")).toBe("buy");
    expect(normalizeAction("Sell")).toBe("sell");
    expect(normalizeAction("REINVESTMENT")).toBe("reinvest");
    expect(normalizeAction("DIVIDEND RECEIVED")).toBe("dividend");
    expect(normalizeAction("Electronic Funds Transfer Received")).toBe("deposit");
    expect(normalizeAction("Purchased")).toBe("buy");
    expect(normalizeAction("mystery")).toBeNull();
  });
});

describe("positions CSV", () => {
  it("imports valid rows, derives cost from avg cost, rejects bad rows with line numbers", () => {
    const csv = [
      "Account Name,Symbol,Description,Quantity,Average Cost Basis,Current Value",
      "Brokerage,NVDA,NVIDIA,10,$100.00,$1300",
      "Brokerage,SPAXX**,Money market,5000,,",
      "Brokerage,MSFT,Microsoft,-3,$300,",
      "Brokerage,QXO,QXO Inc,25,,",
      "Brokerage,NVDA,NVIDIA dup,1,$1,",
    ].join("\n");
    const p = parsePositionsCsv(csv);
    expect(p.rows.map((r) => r.data.symbol)).toEqual(["NVDA", "QXO"]);
    expect(p.rows[0].data.costBasisTotal).toBe(1000);
    expect(p.rows[0].notes[0]).toMatch(/calculated/);
    expect(p.rows[1].data.costBasisTotal).toBeNull();
    expect(p.errors.map((e) => e.line)).toEqual([3, 4, 6]);
  });
  it("skips broker preamble lines before the header", () => {
    const csv = "Positions as of 10/05/2026\n\nSymbol,Quantity,Cost Basis\nAAPL,2,300";
    const p = parsePositionsCsv(csv);
    expect(p.errors).toEqual([]);
    expect(p.rows[0]).toMatchObject({ line: 4, data: { symbol: "AAPL", quantity: 2, costBasisTotal: 300 } });
  });
  it("fails clearly when required columns are missing", () => {
    expect(parsePositionsCsv("Foo,Bar\n1,2").errors[0].message).toMatch(/Symbol and Quantity/);
  });
});

describe("transactions CSV", () => {
  it("detects kind and normalizes signs", () => {
    const csv = [
      "Run Date,Action,Symbol,Quantity,Price ($),Commission ($),Amount ($)",
      "09/02/2026,YOU BOUGHT,NVDA,10,100,0,1000",
      "09/03/2026,YOU SOLD,NVDA,-4,120,1,",
      "09/04/2026,DIVIDEND RECEIVED,NVDA,,,,0.40",
      "09/05/2026,Electronic Funds Transfer Received,,,,,5000",
      "13/45/2026,YOU BOUGHT,NVDA,1,1,0,-1",
    ].join("\n");
    expect(detectKind(csv.split("\n")[0].split(","))).toBe("transactions");
    const t = parseTransactionsCsv(csv);
    expect(t.errors).toHaveLength(1);
    expect(t.errors[0].line).toBe(6);
    const [buy, sell, div, dep] = t.rows.map((r) => r.data);
    expect(buy).toMatchObject({ type: "buy", amount: -1000, quantity: 10 });
    expect(sell).toMatchObject({ type: "sell", amount: 479, quantity: 4 });
    expect(div).toMatchObject({ type: "dividend", amount: 0.4, symbol: "NVDA" });
    expect(dep).toMatchObject({ type: "deposit", amount: 5000, symbol: null });
    expect(t.rows[0].notes.join()).toMatch(/sign normalized/);
  });
});
