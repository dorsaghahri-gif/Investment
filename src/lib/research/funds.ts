/**
 * Fund classification for sector exposure and planning. ETF holdings look-through
 * isn't in the current data plan, so this uses a transparent heuristic:
 * a known list of broad-market index funds, then sector keywords in the fund name.
 * Results are labelled as approximations in the UI.
 */

/** Broad, diversified index funds (core holdings). Exempt from single-position limits. */
export const BROAD_MARKET_FUNDS = new Set([
  "SPY", "IVV", "VOO", "SPLG", "VTI", "ITOT", "SCHB", "SCHX", "VV", "IWB", "IWV", "VT", "ACWI", "VXUS", "IXUS", "VEA", "IEFA", "VWO", "IEMG",
  "RSP", "SCHD", "VIG", "DGRO", "VYM", "IWM", "VB", "VO", "IJH", "IJR", "MDY",
  "FXAIX", "FSKAX", "FZROX", "FZILX", "FTIHX", "SWPPX", "SWTSX", "VTSAX", "VFIAX", "VTIAX",
  "BND", "AGG", "BNDX", "SCHZ", "FXNAX",
]);

/** Fund families that are diversified by design (target-date, balanced). */
const DIVERSIFIED_NAME = /(freedom|target|retirement|lifecycle|balanced|allocation|total (stock )?market|total world|s&p 500|500 index|core s&p)/i;

const SECTOR_KEYWORDS: [RegExp, string][] = [
  [/information technology|technology|tech\b|semiconductor|software|cloud|quantum|cyber|internet/i, "Technology"],
  [/health ?care|biotech|pharma|medical/i, "Healthcare"],
  [/financial|bank|insurance/i, "Financial Services"],
  [/energy|oil|gas/i, "Energy"],
  [/utilit/i, "Utilities"],
  [/real estate|reit/i, "Real Estate"],
  [/consumer discretionary/i, "Consumer Cyclical"],
  [/consumer staples/i, "Consumer Defensive"],
  [/industrial|aerospace|defense/i, "Industrials"],
  [/materials|mining|metals|gold/i, "Basic Materials"],
  [/communication|media/i, "Communication Services"],
];

export interface FundClass {
  isFund: boolean;
  isBroad: boolean;
  /** Sector bucket used for sector-weight limits. */
  bucket: string;
}

export const DIVERSIFIED_BUCKET = "Diversified (index / multi-sector funds)";

export function classify(sym: { symbol: string; name: string | null; sector: string | null; securityType: string | null }): FundClass {
  const isFund = sym.securityType === "etf" || sym.securityType === "fund" || BROAD_MARKET_FUNDS.has(sym.symbol);
  if (!isFund) return { isFund: false, isBroad: false, bucket: sym.sector ?? "Unknown sector" };
  if (BROAD_MARKET_FUNDS.has(sym.symbol) || (sym.name && DIVERSIFIED_NAME.test(sym.name))) return { isFund: true, isBroad: true, bucket: DIVERSIFIED_BUCKET };
  for (const [re, sector] of SECTOR_KEYWORDS) if (sym.name && re.test(sym.name)) return { isFund: true, isBroad: false, bucket: sector };
  // ETF "sector" fields from providers describe the issuer, not the holdings — don't use them.
  return { isFund: true, isBroad: false, bucket: "Other funds" };
}
