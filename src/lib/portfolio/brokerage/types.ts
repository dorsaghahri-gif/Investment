/**
 * Brokerage connector abstraction — READ ONLY by design.
 * There is intentionally no method for placing, modifying or cancelling orders.
 * Plaid (Phase 8) will implement this interface; the portfolio model never
 * depends on Plaid types.
 */
import type { AccountType, PositionInput, TransactionInput } from "../types";

export interface ExternalAccount {
  externalId: string;
  name: string;
  institution: string | null;
  accountType: AccountType;
  currency: string;
  cashBalance: number | null;
  balanceAsOf: string | null;
}

export interface BrokerageConnector {
  readonly source: "plaid";
  listAccounts(): Promise<ExternalAccount[]>;
  getHoldings(externalAccountId: string): Promise<{ positions: PositionInput[]; asOf: string }>;
  getTransactions(externalAccountId: string, from: string, to: string): Promise<TransactionInput[]>;
}

/**
 * Compile-time guard: if anyone adds a write/trading method to the connector
 * interface, this type fails to compile.
 */
type ForbiddenVerbs = `${"place" | "submit" | "cancel" | "modify" | "execute" | "trade"}${string}`;
type AssertNoTrading<T> = Extract<keyof T, ForbiddenVerbs> extends never ? true : never;
export const __connectorIsReadOnly: AssertNoTrading<BrokerageConnector> = true;
