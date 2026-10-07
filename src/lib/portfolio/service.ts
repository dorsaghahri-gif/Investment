/**
 * Portfolio write operations. User-owned rows are written with the RLS-scoped
 * client (so the database enforces ownership); only the shared security master
 * (`companies`) is touched with the service role.
 */
import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/auth/dal";
import { supabaseMarketStore } from "@/lib/jobs/store-market-supabase";
import { deriveHoldings } from "./derive-holdings";
import { detectKind, parsePositionsCsv, parseTransactionsCsv, type ImportRowError } from "./csv-import";
import type { TransactionInput } from "./types";

export class UserFacingError extends Error {}

async function ensureCompanyIds(symbols: string[]): Promise<Map<string, string>> {
  return supabaseMarketStore(createSupabaseAdminClient()).ensureCompanies(symbols);
}

async function getOwnedAccount(user: CurrentUser, accountId: string) {
  const db = await createSupabaseServerClient();
  // user_id filter matters: RLS also exposes accounts shared with this user (read-only)
  const { data, error } = await db
    .from("accounts")
    .select("id, tracking_mode, base_currency")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new UserFacingError("Account not found.");
  return data as { id: string; tracking_mode: "positions" | "transactions"; base_currency: string };
}

export async function createAccount(
  user: CurrentUser,
  input: { name: string; institution: string | null; accountType: string; trackingMode: string; cashBalance: number | null },
) {
  const db = await createSupabaseServerClient();
  const { error } = await db.from("accounts").insert({
    user_id: user.id,
    name: input.name,
    institution: input.institution,
    account_type: input.accountType,
    tracking_mode: input.trackingMode,
    source: "manual",
    cash_balance: input.cashBalance ?? 0,
    cash_balance_as_of: new Date().toISOString(),
  });
  if (error) {
    if (error.code === "23505") throw new UserFacingError("An account with that name already exists.");
    throw new Error(error.message);
  }
}

export async function updateCash(accountId: string, cash: number) {
  const db = await createSupabaseServerClient();
  const { error } = await db
    .from("accounts")
    .update({ cash_balance: cash, cash_balance_as_of: new Date().toISOString() })
    .eq("id", accountId);
  if (error) throw new Error(error.message);
}

export async function upsertHolding(
  user: CurrentUser,
  input: { accountId: string; symbol: string; quantity: number; costBasisTotal: number | null; acquiredOn: string | null },
) {
  const account = await getOwnedAccount(user, input.accountId);
  if (account.tracking_mode === "transactions") {
    throw new UserFacingError("This account derives holdings from transactions. Import or add transactions instead.");
  }
  const ids = await ensureCompanyIds([input.symbol]);
  const db = await createSupabaseServerClient();
  const { error } = await db.from("portfolio_holdings").upsert(
    {
      user_id: user.id,
      account_id: input.accountId,
      company_id: ids.get(input.symbol) ?? null,
      symbol: input.symbol,
      quantity: input.quantity,
      cost_basis_total: input.costBasisTotal,
      acquired_on: input.acquiredOn,
      currency: account.base_currency,
      source: "manual",
      as_of: new Date().toISOString(),
    },
    { onConflict: "account_id,symbol" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteHolding(holdingId: string) {
  const db = await createSupabaseServerClient();
  const { error } = await db.from("portfolio_holdings").delete().eq("id", holdingId);
  if (error) throw new Error(error.message);
}

/** Deterministic id for CSV rows without a broker id, so re-imports dedupe. */
export function syntheticExternalId(t: TransactionInput, occurrence: number): string {
  const key = [t.tradeDate, t.type, t.symbol ?? "", t.quantity ?? "", t.price ?? "", t.amount, occurrence].join("|");
  return "csv:" + createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export interface ImportResult {
  kind: "positions" | "transactions";
  accepted: number;
  rejected: number;
  errors: ImportRowError[];
  holdingsRecomputed: boolean;
  derivationIssues: string[];
  symbols: string[];
}

export async function importCsv(
  user: CurrentUser,
  opts: { accountId: string; text: string; filename: string | null; kind: "auto" | "positions" | "transactions"; mode: "replace" | "merge" },
): Promise<ImportResult> {
  const account = await getOwnedAccount(user, opts.accountId);
  const firstLine = opts.text.split(/\r?\n/).find((l) => /symbol|ticker|date/i.test(l)) ?? "";
  const kind = opts.kind === "auto" ? detectKind(firstLine.split(",").map((h) => h.replace(/^"|"$/g, ""))) : opts.kind;
  const db = await createSupabaseServerClient();

  if (kind === "positions") {
    if (account.tracking_mode === "transactions") {
      throw new UserFacingError("This account derives holdings from transactions; import a transactions file instead.");
    }
    const preview = parsePositionsCsv(opts.text, account.base_currency);
    const symbols = preview.rows.map((r) => r.data.symbol);
    const batch = await db
      .from("import_batches")
      .insert({
        user_id: user.id,
        account_id: account.id,
        kind,
        filename: opts.filename,
        row_count: preview.totalRows,
        accepted_count: preview.rows.length,
        rejected_count: preview.errors.length,
        errors: preview.errors,
      })
      .select("id")
      .single();
    if (batch.error) throw new Error(batch.error.message);
    if (!preview.rows.length) return { kind, accepted: 0, rejected: preview.errors.length, errors: preview.errors, holdingsRecomputed: false, derivationIssues: [], symbols };

    const ids = await ensureCompanyIds(symbols);
    if (opts.mode === "replace") {
      // atomic: the account's holdings become exactly the file's positions
      const rpc = await db.rpc("replace_account_holdings", {
        p_account_id: account.id,
        p_holdings: preview.rows.map(({ data: p }) => ({
          symbol: p.symbol,
          company_id: ids.get(p.symbol) ?? null,
          quantity: p.quantity,
          cost_basis_total: p.costBasisTotal,
          acquired_on: p.acquiredOn,
          currency: p.currency,
          source: "csv",
        })),
        p_cash: null,
      });
      if (rpc.error) throw new Error(rpc.error.message);
    } else {
      const now = new Date().toISOString();
      const up = await db.from("portfolio_holdings").upsert(
        preview.rows.map(({ data: p }) => ({
          user_id: user.id,
          account_id: account.id,
          company_id: ids.get(p.symbol) ?? null,
          symbol: p.symbol,
          quantity: p.quantity,
          cost_basis_total: p.costBasisTotal,
          currency: p.currency,
          acquired_on: p.acquiredOn,
          source: "csv",
          import_batch_id: batch.data.id,
          as_of: now,
        })),
        { onConflict: "account_id,symbol" },
      );
      if (up.error) throw new Error(up.error.message);
    }
    return { kind, accepted: preview.rows.length, rejected: preview.errors.length, errors: preview.errors, holdingsRecomputed: false, derivationIssues: [], symbols };
  }

  // transactions
  const preview = parseTransactionsCsv(opts.text, account.base_currency);
  const symbols = [...new Set(preview.rows.map((r) => r.data.symbol).filter((s): s is string => !!s))];
  const batch = await db
    .from("import_batches")
    .insert({
      user_id: user.id,
      account_id: account.id,
      kind,
      filename: opts.filename,
      row_count: preview.totalRows,
      accepted_count: preview.rows.length,
      rejected_count: preview.errors.length,
      errors: preview.errors,
    })
    .select("id")
    .single();
  if (batch.error) throw new Error(batch.error.message);

  const ids = symbols.length ? await ensureCompanyIds(symbols) : new Map<string, string>();
  const occurrences = new Map<string, number>();
  const rows = preview.rows.map(({ data: t }) => {
    const base = [t.tradeDate, t.type, t.symbol, t.quantity, t.price, t.amount].join("|");
    const occ = (occurrences.get(base) ?? 0) + 1;
    occurrences.set(base, occ);
    return {
      user_id: user.id,
      account_id: account.id,
      company_id: t.symbol ? (ids.get(t.symbol) ?? null) : null,
      symbol: t.symbol,
      type: t.type,
      trade_date: t.tradeDate,
      quantity: t.quantity,
      price: t.price,
      amount: t.amount,
      fees: t.fees,
      currency: t.currency,
      split_ratio: t.splitRatio,
      description: t.description,
      source: "csv",
      external_id: t.externalId ?? syntheticExternalId(t, occ),
      import_batch_id: batch.data.id,
    };
  });
  if (rows.length) {
    const ins = await db.from("portfolio_transactions").upsert(rows, { onConflict: "account_id,external_id", ignoreDuplicates: true });
    if (ins.error) throw new Error(ins.error.message);
  }

  let holdingsRecomputed = false;
  let derivationIssues: string[] = [];
  if (account.tracking_mode === "transactions") {
    const res = await recomputeHoldingsFromTransactions(user, account.id);
    holdingsRecomputed = true;
    derivationIssues = res.issues;
  }
  return { kind, accepted: preview.rows.length, rejected: preview.errors.length, errors: preview.errors, holdingsRecomputed, derivationIssues, symbols };
}

export async function recomputeHoldingsFromTransactions(_user: CurrentUser, accountId: string): Promise<{ issues: string[] }> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("portfolio_transactions")
    .select("symbol, type, trade_date, quantity, price, amount, fees, currency, split_ratio, description, external_id")
    .eq("account_id", accountId)
    .order("trade_date")
    .order("created_at");
  if (error) throw new Error(error.message);
  const txns: TransactionInput[] = (data ?? []).map((r) => ({
    symbol: r.symbol,
    type: r.type,
    tradeDate: r.trade_date,
    quantity: r.quantity === null ? null : Number(r.quantity),
    price: r.price === null ? null : Number(r.price),
    amount: Number(r.amount),
    fees: Number(r.fees ?? 0),
    currency: r.currency,
    splitRatio: r.split_ratio === null ? null : Number(r.split_ratio),
    description: r.description,
    externalId: r.external_id,
  }));
  const derived = deriveHoldings(txns);
  const ids = derived.positions.length ? await ensureCompanyIds(derived.positions.map((p) => p.symbol)) : new Map<string, string>();
  const rpc = await db.rpc("replace_account_holdings", {
    p_account_id: accountId,
    p_holdings: derived.positions.map((p) => ({
      symbol: p.symbol,
      company_id: ids.get(p.symbol) ?? null,
      quantity: p.quantity,
      cost_basis_total: p.costBasisTotal,
      acquired_on: p.firstAcquired,
      source: "csv",
    })),
    p_cash: derived.cash,
  });
  if (rpc.error) throw new Error(rpc.error.message);
  return { issues: derived.issues.map((i) => `${i.symbol ?? "—"}: ${i.message}`) };
}
