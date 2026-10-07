/**
 * Brokerage connector registry. Plaid is optional: when PLAID_* env vars are
 * absent this returns null and the app runs on manual + CSV accounts only.
 */
import "server-only";
import type { BrokerageConnector } from "./types";

export function isPlaidConfigured(): boolean {
  return !!(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET && process.env.CREDENTIALS_ENCRYPTION_KEY);
}

/** Phase 8: return a PlaidConnector bound to a decrypted access token. */
export async function getBrokerageConnector(_connectionId: string): Promise<BrokerageConnector | null> {
  if (!isPlaidConfigured()) return null;
  // Implemented in Phase 8 (see BUILD_PLAN.md). Kept as an explicit null rather
  // than a stub that pretends to work.
  return null;
}

export type { BrokerageConnector, ExternalAccount } from "./types";
