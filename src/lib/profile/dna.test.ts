import { describe, expect, it } from "vitest";
import { dnaFormSchema, formDataToDnaInput, toFormDefaults, toProfileRow } from "./dna";

const base = { preferredSectors: [], excludedSectors: [] };

describe("Investment DNA", () => {
  it("converts human units to canonical units and back", () => {
    const v = dnaFormSchema.parse({
      ...base,
      targetReturn: "10",
      maxDrawdown: "30",
      marketCapMin: "2",
      minRoic: "15",
      maxForwardPe: "30",
      maxPositionWeight: "10",
      maxSectorWeight: "35",
      requireProfitability: "on",
      horizonYears: "15",
    });
    expect(v.targetReturn).toBeCloseTo(0.1);
    expect(v.marketCapMin).toBe(2e9);
    expect(v.requireProfitability).toBe(true);
    const row = toProfileRow(v);
    expect(row.valuation_ranges).toEqual({ pe_forward: { max: 30 } });
    expect(row.min_roic).toBeCloseTo(0.15);
    const back = toFormDefaults(row);
    expect(back.targetReturn).toBe("10");
    expect(back.marketCapMin).toBe("2");
    expect(back.maxForwardPe).toBe("30");
  });
  it("keeps blanks as null (unset), never 0", () => {
    const v = dnaFormSchema.parse({ ...base, targetReturn: "", minRoic: "" });
    expect(v.targetReturn).toBeNull();
    expect(toProfileRow(v).min_roic).toBeNull();
  });
  it("rejects contradictory settings", () => {
    const r = dnaFormSchema.safeParse({ ...base, preferredSectors: ["Energy"], excludedSectors: ["Energy"], marketCapMin: "10", marketCapMax: "2", maxPositionWeight: "40", maxSectorWeight: "30" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["excludedSectors", "marketCapMax", "maxPositionWeight"]));
  });
  it("rejects unknown sectors and out-of-range values", () => {
    expect(dnaFormSchema.safeParse({ ...base, preferredSectors: ["Crypto"] }).success).toBe(false);
    expect(dnaFormSchema.safeParse({ ...base, riskTolerance: "11" }).success).toBe(false);
  });
  it("collects multi-value checkboxes from FormData", () => {
    const fd = new FormData();
    fd.append("preferredSectors", "Technology");
    fd.append("preferredSectors", "Healthcare");
    fd.append("horizonYears", "10");
    expect(formDataToDnaInput(fd)).toEqual({ preferredSectors: ["Technology", "Healthcare"], horizonYears: "10" });
  });
});
