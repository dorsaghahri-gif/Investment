import { describe, expect, it } from "vitest";
import { isoDate, isoDateTime, missingKeys, num, pctToFraction, pickNum } from "./parse";

describe("num", () => {
  it("never coerces missing values to zero", () => {
    for (const v of [null, undefined, "", "N/A", "n/a", "-", "None", NaN, Infinity, {}, []]) {
      expect(num(v)).toBeNull();
    }
  });
  it("parses numeric strings incl. thousands separators", () => {
    expect(num("1,234.5")).toBe(1234.5);
    expect(num(" -3 ")).toBe(-3);
    expect(num(0)).toBe(0);
  });
});

describe("pctToFraction", () => {
  it("converts percent to decimal fraction", () => {
    expect(pctToFraction(1.5)).toBeCloseTo(0.015);
    expect(pctToFraction(null)).toBeNull();
  });
});

describe("dates", () => {
  it("normalizes dates", () => {
    expect(isoDate("2026-09-30 00:00:00")).toBe("2026-09-30");
    expect(isoDate("garbage")).toBeNull();
  });
  it("handles epoch seconds and FMP datetime strings", () => {
    expect(isoDateTime(1_700_000_000)).toBe("2023-11-14T22:13:20.000Z");
    expect(isoDateTime("2026-10-05 14:30:00")).toBe("2026-10-05T14:30:00.000Z");
  });
});

describe("pickNum / missingKeys", () => {
  it("falls back across renamed fields", () => {
    expect(pickNum({ peRatio: 20 }, "priceToEarningsRatio", "peRatio")).toBe(20);
    expect(pickNum({}, "a", "b")).toBeNull();
  });
  it("reports keys absent from every row", () => {
    expect(missingKeys([{ a: 1 }, { a: 2, b: 3 }], ["a", "b", "c"])).toEqual(["c"]);
    expect(missingKeys([], ["a"])).toEqual([]);
  });
});
