import { describe, expect, it } from "vitest";
import { formatAge, formatMoney, formatPct, formatSignedMoney, MISSING, priceStaleness } from "./format";

describe("format", () => {
  it("renders missing values as em dash, never 0", () => {
    expect(formatMoney(null)).toBe(MISSING);
    expect(formatPct(undefined)).toBe(MISSING);
    expect(formatMoney(NaN)).toBe(MISSING);
  });
  it("formats money and percentages", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatSignedMoney(-842)).toBe("−$842.00");
    expect(formatPct(0.0123, { signed: true })).toBe("+1.23%");
    expect(formatPct(-0.5)).toBe("−50.00%");
  });
  it("computes ages and staleness", () => {
    const now = new Date("2026-10-06T12:00:00Z");
    expect(formatAge("2026-10-06T09:00:00Z", now)).toBe("3h ago");
    expect(priceStaleness("2026-10-02T20:00:00Z", new Date("2026-10-05T15:00:00Z"))).toBe("fresh"); // Fri close seen Mon morning
    expect(priceStaleness("2026-10-02T20:00:00Z", now)).toBe("stale"); // Tue: Monday's close is missing
    expect(priceStaleness("2026-09-25T20:00:00Z", now)).toBe("critical");
    expect(priceStaleness(null, now)).toBe("unknown");
  });
});
