/**
 * Deterministic position valuation from holdings + latest quotes.
 * Positions without a price are reported as unpriced and EXCLUDED from
 * totals and weights (with a count shown), never valued at 0.
 */
export interface HoldingForValuation {
  id: string;
  symbol: string;
  quantity: number;
  costBasisTotal: number | null;
  price: number | null;
  changePct: number | null;
  previousClose: number | null;
  quoteTime: string | null;
  /** Position currency; positions not in the base currency are excluded until FX lands (Phase 2). */
  currency?: string;
}

export interface ValuedHolding extends HoldingForValuation {
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPct: number | null;
  dayChange: number | null;
  weight: number | null;
}

export interface PortfolioValuation {
  holdings: ValuedHolding[];
  investedValue: number;
  cash: number;
  totalValue: number;
  costBasisKnown: number;
  unrealizedPnlKnown: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  unpricedSymbols: string[];
  unknownCostSymbols: string[];
  oldestQuoteTime: string | null;
  /** Positions excluded from totals because they are not in the base currency. */
  foreignCurrencySymbols: string[];
}

export function valuePortfolio(holdings: HoldingForValuation[], cash: number, baseCurrency = "USD"): PortfolioValuation {
  const isForeign = (h: HoldingForValuation) => !!h.currency && h.currency !== baseCurrency;
  const valued = holdings.map((h) => {
    const mv = h.price === null || isForeign(h) ? null : h.quantity * h.price;
    const pnl = mv === null || h.costBasisTotal === null ? null : mv - h.costBasisTotal;
    const dayChange = h.previousClose === null || h.price === null || isForeign(h) ? null : h.quantity * (h.price - h.previousClose);
    return {
      ...h,
      marketValue: mv,
      unrealizedPnl: pnl,
      unrealizedPct: pnl === null || !h.costBasisTotal ? null : pnl / h.costBasisTotal,
      dayChange,
      weight: null as number | null,
    };
  });
  const invested = valued.reduce((s, h) => s + (h.marketValue ?? 0), 0);
  const total = invested + cash;
  for (const h of valued) h.weight = h.marketValue === null || total <= 0 ? null : h.marketValue / total;

  const withCost = valued.filter((h) => h.unrealizedPnl !== null);
  const dayKnown = valued.filter((h) => h.dayChange !== null);
  const dayChange = dayKnown.length ? dayKnown.reduce((s, h) => s + h.dayChange!, 0) : null;
  const prevTotal = dayChange === null ? null : total - dayChange;
  const times = valued.map((h) => h.quoteTime).filter((t): t is string => !!t).sort();

  return {
    holdings: valued.sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1)),
    investedValue: round2(invested),
    cash: round2(cash),
    totalValue: round2(total),
    costBasisKnown: round2(withCost.reduce((s, h) => s + h.costBasisTotal!, 0)),
    unrealizedPnlKnown: withCost.length ? round2(withCost.reduce((s, h) => s + h.unrealizedPnl!, 0)) : null,
    dayChange: dayChange === null ? null : round2(dayChange),
    dayChangePct: dayChange === null || !prevTotal ? null : dayChange / prevTotal,
    unpricedSymbols: valued.filter((h) => h.marketValue === null && !isForeign(h)).map((h) => h.symbol),
    foreignCurrencySymbols: valued.filter(isForeign).map((h) => `${h.symbol} (${h.currency})`),
    unknownCostSymbols: valued.filter((h) => h.costBasisTotal === null).map((h) => h.symbol),
    oldestQuoteTime: times[0] ?? null,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
