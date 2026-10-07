/**
 * Deterministic MOCK provider for local development and tests.
 * Every record is tagged provider='mock' and the UI shows a MOCK DATA banner
 * whenever any mock data is present. Values are synthetic — not real prices.
 */
import type { Provenance, Sourced, DataKind } from "@/lib/domain/provenance";
import type { PriceBar, Quote } from "@/lib/domain/market";
import type { FinancialStatement, LineItems } from "@/lib/domain/fundamentals";
import type { CompanyProfile } from "@/lib/domain/research";
import type { ProviderBundle } from "../interfaces";
import { normalizeSymbol } from "../parse";

const UNIVERSE: Record<string, { name: string; sector: string; industry: string; type?: "etf"; base: number }> = {
  AAPL: { name: "Apple Inc. (mock)", sector: "Technology", industry: "Consumer Electronics", base: 220 },
  MSFT: { name: "Microsoft Corp. (mock)", sector: "Technology", industry: "Software - Infrastructure", base: 430 },
  NVDA: { name: "NVIDIA Corp. (mock)", sector: "Technology", industry: "Semiconductors", base: 130 },
  GOOG: { name: "Alphabet Inc. (mock)", sector: "Communication Services", industry: "Internet Content & Information", base: 170 },
  QXO: { name: "QXO Inc. (mock)", sector: "Industrials", industry: "Industrial Distribution", base: 18 },
  SPY: { name: "SPDR S&P 500 ETF (mock)", sector: "Financial Services", industry: "Asset Management", type: "etf", base: 560 },
  QQQ: { name: "Invesco QQQ Trust (mock)", sector: "Financial Services", industry: "Asset Management", type: "etf", base: 480 },
};

/** Mulberry32 seeded PRNG — deterministic per symbol. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function isWeekday(d: Date) {
  const w = d.getUTCDay();
  return w !== 0 && w !== 6;
}

export function mockBars(symbol: string, from: string, to: string): PriceBar[] {
  const s = normalizeSymbol(symbol);
  const base = UNIVERSE[s]?.base ?? 20 + (hash(s) % 300);
  const r = rng(hash(s));
  const bars: PriceBar[] = [];
  // walk from a fixed epoch so the series is identical regardless of range requested
  const start = new Date("2015-01-02T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  let price = base * 0.35;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!isWeekday(d)) continue;
    const ret = (r() - 0.48) * 0.035; // slight upward drift
    const open = price;
    price = Math.max(1, price * (1 + ret));
    const date = d.toISOString().slice(0, 10);
    if (date >= from) {
      bars.push({
        symbol: s,
        date,
        open: round(open),
        high: round(Math.max(open, price) * (1 + r() * 0.01)),
        low: round(Math.min(open, price) * (1 - r() * 0.01)),
        close: round(price),
        adjClose: round(price),
        volume: Math.round(1e6 + r() * 5e7),
        vwap: round((open + price) / 2),
      });
    }
  }
  return bars;
}

export function createMockProvider(now: () => Date = () => new Date()): ProviderBundle {
  const prov = (sourceRef: string, dataKind: DataKind, asOf: string): Provenance => ({
    provider: "mock",
    sourceRef: `mock:${sourceRef}`,
    dataKind,
    asOf,
    fetchedAt: now().toISOString(),
  });
  const today = () => now().toISOString().slice(0, 10);
  const sourced = <T>(data: T, p: Provenance): Sourced<T> => ({ data, provenance: p });

  const quoteFor = (s: string): Quote | null => {
    const bars = mockBars(s, "2024-01-01", today());
    const last = bars.at(-1);
    const prev = bars.at(-2);
    if (!last || !prev) return null;
    const year = bars.slice(-252);
    return {
      symbol: s,
      name: UNIVERSE[s]?.name ?? `${s} (mock)`,
      price: last.close,
      change: round(last.close - prev.close, 4),
      changePct: (last.close - prev.close) / prev.close,
      previousClose: prev.close,
      open: last.open,
      dayHigh: last.high,
      dayLow: last.low,
      volume: last.volume,
      marketCap: round(last.close * (1e9 + (hash(s) % 9) * 1e9), 0),
      yearHigh: Math.max(...year.map((b) => b.high ?? b.close)),
      yearLow: Math.min(...year.map((b) => b.low ?? b.close)),
      currency: "USD",
      quoteTime: `${last.date}T20:00:00.000Z`,
    };
  };

  const statement = (s: string, type: FinancialStatement["type"], yearsBack: number): FinancialStatement => {
    const r = rng(hash(s + type + yearsBack));
    const rev = (5e9 + (hash(s) % 50) * 1e9) * Math.pow(0.88, yearsBack);
    const items: LineItems =
      type === "income"
        ? {
            revenue: round(rev, 0),
            gross_profit: round(rev * 0.55, 0),
            operating_income: round(rev * (0.2 + r() * 0.1), 0),
            net_income: round(rev * 0.18, 0),
            ebitda: round(rev * 0.3, 0),
            eps_diluted: round((rev * 0.18) / 1e9, 2),
            shares_diluted: 1e9,
          }
        : type === "balance"
          ? { total_assets: round(rev * 1.6, 0), total_liabilities: round(rev * 0.8, 0), cash_and_equivalents: round(rev * 0.3, 0), total_debt: round(rev * 0.25, 0), total_equity: round(rev * 0.8, 0) }
          : { operating_cash_flow: round(rev * 0.25, 0), capital_expenditure: round(-rev * 0.05, 0), free_cash_flow: round(rev * 0.2, 0) };
    const fy = now().getUTCFullYear() - 1 - yearsBack;
    return { symbol: s, type, period: "annual", fiscalYear: fy, fiscalQuarter: null, periodEnd: `${fy}-12-31`, filedAt: `${fy + 1}-02-15`, currency: "USD", lineItems: items };
  };

  const profile = (s: string): CompanyProfile => {
    const u = UNIVERSE[s];
    return {
      symbol: s,
      name: u?.name ?? `${s} (mock)`,
      securityType: u?.type ?? "stock",
      exchange: "MOCK",
      currency: "USD",
      country: "US",
      sector: u?.sector ?? "Technology",
      industry: u?.industry ?? "Software - Application",
      description: "Synthetic company used for development. Not real data.",
      website: null,
      ceo: null,
      cik: null,
      isin: null,
      cusip: null,
      ipoDate: null,
      employees: null,
      beta: 1,
      isActivelyTrading: true,
    };
  };

  return {
    id: "mock",
    market_data: {
      id: "mock",
      async getQuotes(symbols) {
        return symbols
          .map(normalizeSymbol)
          .map(quoteFor)
          .filter((q): q is Quote => q !== null)
          .map((q) => sourced(q, prov("quote", "reported", q.quoteTime!)));
      },
      async getDailyBars(symbol, from, to) {
        const bars = mockBars(symbol, from, to);
        return sourced(bars, prov("bars", "reported", bars.at(-1)?.date ?? to));
      },
    },
    fundamentals: {
      id: "mock",
      async getStatements(symbol, type, _period, limit) {
        const s = normalizeSymbol(symbol);
        return Array.from({ length: Math.min(limit, 5) }, (_, i) => statement(s, type, i)).map((st) =>
          sourced(st, prov(`statements/${type}`, "reported", st.periodEnd)),
        );
      },
      async getProviderMetrics() {
        return [];
      },
    },
    estimates: {
      id: "mock",
      async getEstimates() {
        return [];
      },
      async getPriceTargetConsensus() {
        return null;
      },
      async getRatingChanges() {
        return [];
      },
    },
    company_info: {
      id: "mock",
      async getProfile(symbol) {
        const s = normalizeSymbol(symbol);
        return sourced(profile(s), prov("profile", "reported", today()));
      },
      async getPeers(symbol) {
        const s = normalizeSymbol(symbol);
        const peers = Object.keys(UNIVERSE).filter((k) => k !== s && !UNIVERSE[k].type);
        return sourced(peers, prov("peers", "provider_derived", today()));
      },
      async getExecutives() {
        return sourced([], prov("executives", "reported", today()));
      },
      async searchSymbols(query) {
        const q = query.trim().toUpperCase();
        return Object.entries(UNIVERSE)
          .filter(([k, v]) => k.includes(q) || v.name.toUpperCase().includes(q))
          .map(([k, v]) => ({ symbol: k, name: v.name, exchange: "MOCK", currency: "USD" }));
      },
    },
    events: {
      id: "mock",
      async getEarnings() {
        return [];
      },
      async getEarningsCalendar() {
        return [];
      },
      async getDividends() {
        return [];
      },
      async getSplits() {
        return [];
      },
      async getFilings() {
        return [];
      },
    },
    news: {
      id: "mock",
      async getNews() {
        return [];
      },
    },
    insider: {
      id: "mock",
      async getInsiderTransactions() {
        return [];
      },
      async getInstitutionalOwnership() {
        return null;
      },
    },
  };
}
