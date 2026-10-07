/**
 * Research universe. The primary source is the provider's S&P 500 constituent
 * list (refreshed weekly). If the data plan doesn't include it, this fixed list
 * of large US companies is used instead and tagged "core100" so the UI can say so.
 */
export const UNIVERSE_SYNC_DAYS = 7;

export const FALLBACK_UNIVERSE = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "BRK-B", "AVGO", "TSLA", "LLY",
  "JPM", "V", "UNH", "XOM", "MA", "JNJ", "PG", "HD", "COST", "ORCL",
  "ABBV", "MRK", "CVX", "KO", "PEP", "WMT", "BAC", "ADBE", "CRM", "NFLX",
  "AMD", "TMO", "LIN", "MCD", "CSCO", "ACN", "ABT", "WFC", "DHR", "TXN",
  "INTU", "QCOM", "PM", "DIS", "VZ", "AMGN", "CAT", "IBM", "GE", "NOW",
  "ISRG", "SPGI", "GS", "UNP", "HON", "RTX", "LOW", "BKNG", "PFE", "NEE",
  "CMCSA", "T", "AMAT", "ELV", "MS", "BLK", "SYK", "PLD", "TJX", "AXP",
  "LMT", "DE", "MDT", "VRTX", "ADP", "SCHW", "MDLZ", "GILD", "CB", "C",
  "REGN", "ADI", "MMC", "PANW", "BMY", "MO", "SO", "TMUS", "CI", "LRCX",
  "MU", "KLAC", "SNPS", "CDNS", "ZTS", "DUK", "SHW", "ICE", "CME", "ITW",
  "PGR", "APH", "UBER", "ANET", "PLTR",
] as const;
