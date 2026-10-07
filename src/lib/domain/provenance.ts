/**
 * Provenance model — every financial value shown in the app carries one.
 * Mirrors the Postgres enums `data_kind` and `provider_id`.
 */

export const DATA_KINDS = [
  "reported",
  "provider_derived",
  "calculated",
  "estimate",
  "ai_interpretation",
  "scenario_assumption",
] as const;
export type DataKind = (typeof DATA_KINDS)[number];

export const DATA_KIND_LABEL: Record<DataKind, string> = {
  reported: "Reported",
  provider_derived: "Provider metric",
  calculated: "Calculated",
  estimate: "Analyst estimate",
  ai_interpretation: "AI interpretation",
  scenario_assumption: "Scenario assumption",
};

export const PROVIDER_IDS = ["fmp", "sec_edgar", "polygon", "plaid", "manual", "csv", "calc", "mock"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  fmp: "Financial Modeling Prep",
  sec_edgar: "SEC EDGAR",
  polygon: "Massive/Polygon",
  plaid: "Plaid",
  manual: "Manual entry",
  csv: "CSV import",
  calc: "Calculated in-app",
  mock: "MOCK DATA",
};

export interface Provenance {
  provider: ProviderId;
  /** Endpoint path or filing accession. Never contains credentials. */
  sourceRef: string;
  dataKind: DataKind;
  /** Economic date of the value (ISO date or datetime). */
  asOf: string;
  /** When the value was retrieved (ISO datetime, UTC). */
  fetchedAt: string;
}

export interface Sourced<T> {
  data: T;
  provenance: Provenance;
}

/** Sentinel text used everywhere a value is missing. */
export const DATA_UNAVAILABLE = "Data unavailable";
