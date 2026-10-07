/**
 * Deterministic derivation of current positions and cash from a transaction
 * ledger (average-cost method). Pure function — unit tested.
 *
 * Rules:
 *  • buy / reinvest / transfer_in add shares; cost += |amount| (or qty×price+fees when amount is 0 for transfers)
 *  • sell / transfer_out remove shares; cost reduced pro-rata (average cost)
 *  • split multiplies quantity by split_ratio; cost unchanged
 *  • cash = Σ amount for all rows (amounts are signed cash impact)
 *  • selling more than held is reported as an issue, never silently clamped
 *  • if any lot's cost is unknown, the position's cost basis becomes null (unknown)
 */
import type { DerivedPosition, TransactionInput } from "./types";

export interface DerivationIssue {
  index: number;
  symbol: string | null;
  message: string;
}

export interface DerivationResult {
  positions: DerivedPosition[];
  cash: number;
  issues: DerivationIssue[];
}

const EPS = 1e-9;

export function deriveHoldings(txns: TransactionInput[]): DerivationResult {
  // stable sort by date, preserving input order within a day
  const ordered = txns.map((t, i) => ({ t, i })).sort((a, b) => (a.t.tradeDate === b.t.tradeDate ? a.i - b.i : a.t.tradeDate < b.t.tradeDate ? -1 : 1));

  const pos = new Map<string, { qty: number; cost: number | null; first: string | null }>();
  const issues: DerivationIssue[] = [];
  let cash = 0;

  for (const { t, i } of ordered) {
    cash += t.amount;
    if (!t.symbol) continue;
    const p = pos.get(t.symbol) ?? { qty: 0, cost: 0, first: null };

    switch (t.type) {
      case "buy":
      case "reinvest":
      case "transfer_in": {
        if (t.quantity === null || t.quantity <= 0) {
          issues.push({ index: i, symbol: t.symbol, message: `${t.type} without a positive quantity` });
          break;
        }
        let lotCost: number | null;
        if (t.amount !== 0) lotCost = Math.abs(t.amount);
        else if (t.price !== null) lotCost = t.quantity * t.price + (t.fees ?? 0);
        else lotCost = null;
        p.qty += t.quantity;
        p.cost = p.cost === null || lotCost === null ? null : p.cost + lotCost;
        p.first = p.first ?? t.tradeDate;
        break;
      }
      case "sell":
      case "transfer_out": {
        const q = t.quantity === null ? null : Math.abs(t.quantity);
        if (q === null || q <= 0) {
          issues.push({ index: i, symbol: t.symbol, message: `${t.type} without a positive quantity` });
          break;
        }
        if (q > p.qty + EPS) {
          issues.push({ index: i, symbol: t.symbol, message: `${t.type} of ${q} exceeds held quantity ${p.qty}` });
          break;
        }
        const frac = p.qty > 0 ? q / p.qty : 0;
        p.cost = p.cost === null ? null : p.cost * (1 - frac);
        p.qty -= q;
        if (p.qty < EPS) {
          p.qty = 0;
          p.cost = 0;
          p.first = null;
        }
        break;
      }
      case "split": {
        if (t.splitRatio === null || t.splitRatio <= 0) {
          issues.push({ index: i, symbol: t.symbol, message: "split without a positive ratio" });
          break;
        }
        p.qty *= t.splitRatio;
        break;
      }
      default:
        // dividend/interest/fee/deposit/withdrawal/other: cash only
        break;
    }
    pos.set(t.symbol, p);
  }

  const positions: DerivedPosition[] = [...pos.entries()]
    .filter(([, p]) => p.qty > EPS)
    .map(([symbol, p]) => ({
      symbol,
      quantity: round(p.qty, 10),
      costBasisTotal: p.cost === null ? null : round(p.cost, 4),
      firstAcquired: p.first,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  return { positions, cash: round(cash, 4), issues };
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
