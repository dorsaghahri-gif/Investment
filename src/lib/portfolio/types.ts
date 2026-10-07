/** Portfolio domain types (provider-agnostic; Plaid/CSV/manual all map into these). */

export const TRANSACTION_TYPES = [
  "buy",
  "sell",
  "dividend",
  "interest",
  "deposit",
  "withdrawal",
  "fee",
  "split",
  "transfer_in",
  "transfer_out",
  "reinvest",
  "other",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export type AccountSource = "manual" | "csv" | "plaid";
export type TrackingMode = "positions" | "transactions";
export const ACCOUNT_TYPES = ["taxable", "ira_traditional", "ira_roth", "401k", "hsa", "other"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface PositionInput {
  symbol: string;
  quantity: number;
  /** Total cost basis for the lot/position; null = unknown (never assumed 0). */
  costBasisTotal: number | null;
  currency: string;
  acquiredOn: string | null;
}

export interface TransactionInput {
  symbol: string | null;
  type: TransactionType;
  tradeDate: string; // YYYY-MM-DD
  quantity: number | null;
  price: number | null;
  /** Signed cash impact on the account: + inflow, − outflow. */
  amount: number;
  fees: number;
  currency: string;
  splitRatio: number | null;
  description: string | null;
  externalId: string | null;
}

export interface DerivedPosition {
  symbol: string;
  quantity: number;
  costBasisTotal: number | null;
  firstAcquired: string | null;
}
