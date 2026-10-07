/**
 * FMP schema smoke test — run once with your real key to verify that the
 * mapper's expected field names match what your FMP plan returns.
 *
 *   FMP_API_KEY=... npm run fmp:smoke [SYMBOL]
 *
 * Prints, per endpoint: HTTP status, fields returned, expected fields that are
 * MISSING (→ values would be null), and the mapped output for one row.
 * The API key is never printed.
 */
import * as M from "../src/lib/providers/fmp/mappers";

const key = process.env.FMP_API_KEY;
if (!key) {
  console.error("Set FMP_API_KEY in your environment.");
  process.exit(1);
}
const symbol = (process.argv[2] ?? "AAPL").toUpperCase();
const base = "https://financialmodelingprep.com/stable/";

const checks: { path: string; params: Record<string, string>; expected: string[]; map?: (r: Record<string, unknown>) => unknown }[] = [
  { path: "quote", params: { symbol }, expected: M.QUOTE_FIELDS, map: M.mapQuote },
  { path: "batch-quote", params: { symbols: `${symbol},SPY` }, expected: M.QUOTE_FIELDS },
  { path: "historical-price-eod/full", params: { symbol, from: "2026-01-02", to: "2026-01-09" }, expected: M.BAR_FIELDS, map: (r) => M.mapBar(symbol, r) },
  { path: "profile", params: { symbol }, expected: M.PROFILE_FIELDS, map: M.mapProfile },
  { path: "income-statement", params: { symbol, period: "annual", limit: "1" }, expected: M.expectedStatementFields("income"), map: (r) => M.mapStatement(symbol, "income", "annual", r) },
  { path: "balance-sheet-statement", params: { symbol, period: "annual", limit: "1" }, expected: M.expectedStatementFields("balance"), map: (r) => M.mapStatement(symbol, "balance", "annual", r) },
  { path: "cash-flow-statement", params: { symbol, period: "annual", limit: "1" }, expected: M.expectedStatementFields("cash_flow"), map: (r) => M.mapStatement(symbol, "cash_flow", "annual", r) },
  { path: "income-statement", params: { symbol, period: "quarter", limit: "1" }, expected: ["date", "period"] },
  { path: "key-metrics", params: { symbol, period: "annual", limit: "1" }, expected: M.KEY_METRICS_FIELDS },
  { path: "ratios", params: { symbol, period: "annual", limit: "1" }, expected: M.RATIOS_FIELDS },
  { path: "financial-growth", params: { symbol, period: "annual", limit: "1" }, expected: M.GROWTH_FIELDS },
  { path: "analyst-estimates", params: { symbol, period: "annual", limit: "2", page: "0" }, expected: M.ESTIMATE_FIELDS, map: (r) => M.mapEstimate(symbol, "annual", r) },
  { path: "price-target-consensus", params: { symbol }, expected: ["targetHigh", "targetLow", "targetConsensus", "targetMedian"] },
  { path: "grades", params: { symbol, limit: "2" }, expected: ["date", "gradingCompany", "previousGrade", "newGrade", "action"] },
  { path: "earnings", params: { symbol, limit: "2" }, expected: ["date", "epsActual", "epsEstimated", "revenueActual", "revenueEstimated"] },
  { path: "dividends", params: { symbol }, expected: ["date", "recordDate", "paymentDate", "dividend", "adjDividend"] },
  { path: "splits", params: { symbol }, expected: ["date", "numerator", "denominator"] },
  { path: "sec-filings-search/symbol", params: { symbol, from: "2026-01-01", to: "2026-12-31", page: "0", limit: "2" }, expected: ["filingDate", "acceptedDate", "formType", "link", "finalLink"] },
  { path: "news/stock", params: { symbols: symbol, limit: "2", page: "0" }, expected: ["symbol", "publishedDate", "publisher", "title", "url", "text"] },
  { path: "insider-trading/search", params: { symbol, limit: "2", page: "0" }, expected: ["transactionDate", "reportingName", "transactionType", "acquisitionOrDisposition", "securitiesTransacted", "price", "securitiesOwned", "typeOfOwner", "url"] },
  { path: "stock-peers", params: { symbol }, expected: ["symbol"] },
  { path: "key-executives", params: { symbol }, expected: ["name", "title", "pay", "currencyPay"] },
];

(async () => {
  const { year, quarter } = M.latestReportedQuarter(new Date());
  checks.push({
    path: "institutional-ownership/symbol-positions-summary",
    params: { symbol, year: String(year), quarter: String(quarter) },
    expected: ["date", "investorsHolding", "numberOf13Fshares", "ownershipPercent", "newPositions", "closedPositions"],
  });
  let problems = 0;
  for (const c of checks) {
    const url = new URL(c.path, base);
    for (const [k, v] of Object.entries(c.params)) url.searchParams.set(k, v);
    url.searchParams.set("apikey", key);
    let status = 0;
    let body: unknown = null;
    try {
      const res = await fetch(url);
      status = res.status;
      body = await res.json().catch(() => null);
    } catch (e) {
      console.log(`✗ ${c.path}: network error ${(e as Error).message}`);
      problems++;
      continue;
    }
    const rows = M.asRows(body);
    const errMsg = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>)["Error Message"] : null;
    if (status >= 400 || errMsg) {
      console.log(`✗ ${c.path} [HTTP ${status}] ${String(errMsg ?? "").slice(0, 160)}`);
      problems++;
      continue;
    }
    const missing = M.asRows(body).length ? c.expected.filter((k) => rows.every((r) => !(k in r))) : c.expected;
    const mark = missing.length ? "⚠" : "✓";
    if (missing.length) problems++;
    console.log(`${mark} ${c.path} [HTTP ${status}] rows=${rows.length}${missing.length ? `  MISSING: ${missing.join(", ")}` : ""}`);
    if (rows[0]) console.log(`    fields: ${Object.keys(rows[0]).join(", ")}`);
    if (rows[0] && c.map) console.log(`    mapped: ${JSON.stringify(c.map(rows[0])).slice(0, 400)}`);
  }
  console.log(problems ? `\n${problems} endpoint(s) need attention (plan restriction or field mismatch).` : "\nAll endpoints match the mapper expectations.");
})();
