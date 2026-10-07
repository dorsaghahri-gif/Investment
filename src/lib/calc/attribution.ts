/**
 * Daily performance attribution.
 *
 *   Δ value = Σ position contributions (qty × (close − prevClose))
 *           + net external flows (deposits − withdrawals)
 *           + dividends/interest − fees
 *           + residual (trades at prices other than close, unpriced items, rounding)
 *
 * The residual is reported explicitly rather than spread across positions.
 */
export interface PositionMove {
  symbol: string;
  quantity: number;
  prevClose: number | null;
  close: number | null;
}

export interface Contribution {
  symbol: string;
  amount: number;
  pct: number | null; // price change fraction
}

export function positionContributions(moves: PositionMove[]): { contributions: Contribution[]; unpriced: string[] } {
  const contributions: Contribution[] = [];
  const unpriced: string[] = [];
  for (const m of moves) {
    if (m.prevClose === null || m.close === null || !(m.prevClose > 0)) {
      unpriced.push(m.symbol);
      continue;
    }
    contributions.push({ symbol: m.symbol, amount: m.quantity * (m.close - m.prevClose), pct: m.close / m.prevClose - 1 });
  }
  contributions.sort((a, b) => b.amount - a.amount);
  return { contributions, unpriced };
}

export interface DayAttribution {
  totalChange: number;
  marketContribution: number;
  netFlows: number;
  income: number;
  fees: number;
  residual: number;
  top: Contribution[];
  bottom: Contribution[];
  unpriced: string[];
}

export function attributeDay(input: {
  prevValue: number;
  value: number;
  moves: PositionMove[];
  netFlows?: number;
  income?: number;
  fees?: number;
  topN?: number;
}): DayAttribution {
  const { contributions, unpriced } = positionContributions(input.moves);
  const market = contributions.reduce((s, c) => s + c.amount, 0);
  const netFlows = input.netFlows ?? 0;
  const income = input.income ?? 0;
  const fees = input.fees ?? 0;
  const total = input.value - input.prevValue;
  const n = input.topN ?? 5;
  return {
    totalChange: total,
    marketContribution: market,
    netFlows,
    income,
    fees,
    residual: total - market - netFlows - income + fees,
    top: contributions.filter((c) => c.amount > 0).slice(0, n),
    bottom: contributions.filter((c) => c.amount < 0).slice(-n).reverse(),
    unpriced,
  };
}
