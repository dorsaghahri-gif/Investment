# Data Provider Architecture

## Rule

> No UI component, scoring algorithm, calculation, or AI module may call a specific provider.
> They consume **normalized domain types** from Postgres, or — inside jobs only — from the **registry**.

Enforced by ESLint (`no-restricted-imports` in `eslint.config.mjs`): `@/lib/providers/fmp/*`, `@/lib/providers/mock/*` may only be imported by `src/lib/providers/registry.ts` and tests.

## Interfaces (`src/lib/providers/interfaces.ts`)

| Interface | Methods | Phase-1 implementation |
|---|---|---|
| `MarketDataProvider` | `getQuotes(symbols)`, `getDailyBars(symbol, from, to)` | FMP, Mock |
| `FundamentalsProvider` | `getStatements(symbol, period, limit)`, `getProviderMetrics(symbol, period, limit)` | FMP, Mock |
| `EstimatesProvider` | `getEstimates(symbol, period)`, `getPriceTargetConsensus(symbol)`, `getRatingChanges(symbol)` | FMP, Mock |
| `CompanyInfoProvider` | `getProfile(symbol)`, `getPeers(symbol)`, `getExecutives(symbol)`, `searchSymbols(query)` | FMP, Mock |
| `EventsProvider` | `getEarnings(symbol)`, `getEarningsCalendar(from,to)`, `getDividends(symbol)`, `getSplits(symbol)`, `getFilings(symbol, from, to)` | FMP, Mock |
| `NewsProvider` | `getNews(symbols, from?, limit?)` | FMP, Mock |
| `InsiderDataProvider` | `getInsiderTransactions(symbol)`, `getInstitutionalOwnership(symbol)` | FMP, Mock |
| `BrokerageConnector` (portfolio) | `listAccounts()`, `getHoldings(accountId)`, `getTransactions(accountId, from, to)` — **read only** | Manual, CSV; Plaid in Phase 8 |

Every method returns `Sourced<T>` / `Sourced<T>[]`:

```ts
interface Provenance {
  provider: ProviderId;           // 'fmp' | 'sec_edgar' | 'polygon' | 'mock' | ...
  sourceRef: string;              // endpoint or filing accession — never contains secrets
  dataKind: DataKind;             // 'reported' | 'provider_derived' | 'estimate' | ...
  asOf: string;                   // economic date (ISO)
  fetchedAt: string;              // retrieval timestamp (ISO)
}
interface Sourced<T> { data: T; provenance: Provenance }
```

### Normalization rules

1. Missing → `null`. Never `0`, never `NaN`. Non-finite numbers are rejected.
2. Percent fields are stored as **decimal fractions** (`0.153` = 15.3%). Mappers convert explicitly per field; each provider's convention is documented in its mapper.
3. Currency is explicit on every monetary record (`currency`), never assumed.
4. Dates are ISO `YYYY-MM-DD`; timestamps ISO-8601 UTC.
5. Symbols normalized to upper case; share classes as `BRK.B` (provider-specific forms mapped in adapter).
6. Raw payloads are **not** passed upward. Optional `raw` capture into `provider_requests.sample` for debugging only.

### Errors

`ProviderError` subclasses: `ProviderAuthError`, `ProviderPlanRestrictedError` (endpoint not in subscription), `ProviderRateLimitError`, `ProviderNotFoundError`, `ProviderUnavailableError`, `ProviderSchemaError`. The registry decides whether to try the next provider in the chain; jobs record the error class so Data Health can show *"Insider data: not included in current FMP plan"* rather than a generic failure.

## Registry (`src/lib/providers/registry.ts`)

```
PROVIDER_MARKET_DATA=fmp            # later: polygon,fmp
PROVIDER_FUNDAMENTALS=fmp           # later: sec_edgar,fmp
PROVIDER_ESTIMATES=fmp
PROVIDER_COMPANY_INFO=fmp
PROVIDER_EVENTS=fmp                 # later: sec_edgar (filings),fmp
PROVIDER_NEWS=fmp
PROVIDER_INSIDER=fmp                # later: sec_edgar (Form 4),fmp
```

Comma-separated = fallback chain (first healthy provider wins per call; the provenance records which one actually answered). If no key is configured, `mock` is used **only** when `ALLOW_MOCK_DATA=true` and the UI shows a persistent "MOCK DATA" banner.

## HTTP layer (`src/lib/providers/http.ts`)

- Timeout (default 10s), retry with exponential backoff + jitter on 429/5xx (max 3), no retry on 4xx auth/plan errors.
- Per-provider client-side concurrency + minimum interval (token bucket) to stay under plan limits.
- Logs each request (`provider`, `endpoint`, `status`, `duration_ms`, `error_class`) with API keys redacted.

## FMP adapter notes (`src/lib/providers/fmp/`)

- Uses FMP's `/stable/*` API family.
- Every response is parsed with a lenient zod schema (unknown keys ignored, every field optional/nullable). If an expected field is absent the value becomes `null` and the field name is reported in `schemaWarnings` — schema drift surfaces on the Data Health page instead of producing wrong numbers.
- **Field names must be verified against your live plan** with `npm run fmp:smoke` (prints the fields each endpoint actually returns and diffs them against the mapper's expectations). The sandbox where this code was written could not reach FMP, so mapper field names are based on FMP's documented stable API and need this one-time check.
- FMP's ratios/key-metrics are stored with `data_kind='provider_derived'`. Our own valuation multiples are recomputed from statements + price (`data_kind='calculated'`) and are what the scoring engine uses; the provider values remain as a cross-check (divergence > 5% is logged).

## Adding a provider (e.g. SEC EDGAR)

1. Create `src/lib/providers/sec-edgar/` implementing `FundamentalsProvider`, `EventsProvider` (filings), `InsiderDataProvider` (Form 4).
2. Register it in `registry.ts` factory map.
3. Set `PROVIDER_FUNDAMENTALS=sec_edgar,fmp`.
4. Add contract tests: the shared suite in `src/lib/providers/contract.test-helpers.ts` runs against any implementation with fixtures.

No UI, scoring, or schema change is required.

## Plan / cost matrix

| Capability | Free sources | FMP Starter (~$19/mo annual) | FMP Premium (~$49/mo annual) | FMP Ultimate (~$99/mo annual) |
|---|---|---|---|---|
| EOD prices, quotes | — (FMP free = sample symbols, 250 calls/day) | ✓ US, 5y | ✓ 30y | ✓ full |
| Annual statements | SEC EDGAR (XBRL companyfacts) | ✓ | ✓ | ✓ |
| Quarterly statements / TTM | SEC EDGAR | verify on plan | ✓ | ✓ |
| Analyst estimates, targets, grades | — | verify on plan | ✓ | ✓ |
| Earnings/dividend calendar | — | partial | ✓ | ✓ |
| News | — | ✓ | ✓ | ✓ |
| Insider transactions | SEC EDGAR Form 4 | verify | ✓ | ✓ |
| Institutional ownership (13F) | SEC EDGAR 13F (heavy) | ✗ | ✗ | ✓ |
| Intraday | — | ✗ | ✓ | ✓ 1-min |

Prices verified from FMP's pricing page (Oct 2026); dataset-by-plan rows marked "verify" are not itemized there — the adapter detects plan-restricted endpoints at runtime and marks them unavailable rather than failing.
