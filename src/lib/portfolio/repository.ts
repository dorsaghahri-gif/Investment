/**
 * Portfolio data access (RLS-scoped: queries run as the signed-in user).
 */
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProviderId } from "@/lib/domain/provenance";
import type { AccountSource, AccountType, TrackingMode } from "./types";
import type { HoldingForValuation } from "./valuation";

export interface AccountRow {
  id: string;
  name: string;
  institution: string | null;
  account_type: AccountType;
  source: AccountSource;
  tracking_mode: TrackingMode;
  base_currency: string;
  cash_balance: number;
  cash_balance_as_of: string | null;
}

export interface HoldingRow extends HoldingForValuation {
  accountId: string;
  accountName: string;
  name: string | null;
  sector: string | null;
  securityType: string | null;
  currency: string;
  source: AccountSource;
  quoteProvider: ProviderId | null;
  quoteFetchedAt: string | null;
  updatedAt: string;
}

type QuoteJoin = {
  price: number | null;
  change_pct: number | null;
  previous_close: number | null;
  quote_time: string | null;
  source_provider: ProviderId;
  fetched_at: string;
};
type CompanyJoin = {
  name: string | null;
  sector: string | null;
  security_type: string | null;
  security_quotes: QuoteJoin | QuoteJoin[] | null;
};
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * All reads are scoped to ONE portfolio owner. RLS also exposes portfolios
 * shared with the viewer, so an unscoped query would mix portfolios together.
 */
export async function listAccounts(ownerId: string): Promise<AccountRow[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("accounts")
    .select("id, name, institution, account_type, source, tracking_mode, base_currency, cash_balance, cash_balance_as_of")
    .eq("user_id", ownerId)
    .eq("is_archived", false)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({ ...a, cash_balance: Number(a.cash_balance) })) as AccountRow[];
}

export async function listHoldings(ownerId: string): Promise<HoldingRow[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("portfolio_holdings")
    .select(
      "id, symbol, quantity, cost_basis_total, currency, source, updated_at, account_id, accounts(name), companies(name, sector, security_type, security_quotes(price, change_pct, previous_close, quote_time, source_provider, fetched_at))",
    )
    .eq("user_id", ownerId)
    .order("symbol");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const c = one(r.companies as CompanyJoin | CompanyJoin[] | null);
    const q = one(c?.security_quotes);
    const acct = one(r.accounts as { name: string } | { name: string }[] | null);
    return {
      id: r.id as string,
      symbol: r.symbol as string,
      quantity: Number(r.quantity),
      costBasisTotal: n(r.cost_basis_total),
      price: n(q?.price),
      changePct: n(q?.change_pct),
      previousClose: n(q?.previous_close),
      quoteTime: q?.quote_time ?? null,
      accountId: r.account_id as string,
      accountName: acct?.name ?? "",
      name: c?.name ?? null,
      sector: c?.sector ?? null,
      securityType: c?.security_type ?? null,
      currency: r.currency as string,
      source: r.source as AccountSource,
      quoteProvider: q?.source_provider ?? null,
      quoteFetchedAt: q?.fetched_at ?? null,
      updatedAt: r.updated_at as string,
    };
  });
}

export async function hasMockData(): Promise<boolean> {
  const db = await createSupabaseServerClient();
  const { count } = await db.from("security_quotes").select("company_id", { count: "exact", head: true }).eq("source_provider", "mock");
  return (count ?? 0) > 0;
}

export interface SharedPortfolio {
  ownerId: string;
  ownerEmail: string;
  ownerName: string | null;
  includeTransactions: boolean;
}

/** Portfolios other people have shared with the current user (read-only). */
export async function listPortfoliosSharedWithMe(myEmail: string): Promise<SharedPortfolio[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("portfolio_shares")
    .select("owner_id, include_transactions, users:owner_id(email, display_name)")
    .eq("viewer_email", myEmail.toLowerCase())
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r) => {
      const u = one(r.users as { email: string; display_name: string | null } | { email: string; display_name: string | null }[] | null);
      return { ownerId: r.owner_id as string, ownerEmail: u?.email ?? "", ownerName: u?.display_name ?? null, includeTransactions: !!r.include_transactions };
    });
}
