/** Normalized market data. Percentages are decimal fractions (0.0123 = 1.23%). Missing = null. */

export interface Quote {
  symbol: string;
  name: string | null;
  price: number | null;
  change: number | null;
  changePct: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  marketCap: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  currency: string | null;
  /** Exchange timestamp of the quote (ISO). */
  quoteTime: string | null;
}

export interface PriceBar {
  symbol: string;
  date: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjClose: number | null;
  volume: number | null;
  vwap: number | null;
}
