# BUILD PLAN — Personal AI Investment Research & Portfolio Intelligence

Companion docs: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/SCORING.md`](docs/SCORING.md) · [`docs/PROVIDERS.md`](docs/PROVIDERS.md) · [`.env.example`](.env.example)

**Priority order when forced to choose:** trustworthy calculations > features; accurate data > AI narrative.

---

## 0. Repository inspection (done)

No existing repository was present. A fresh Next.js 16.4 (App Router, TypeScript, Tailwind v4, React 19.3) project was scaffolded. Notable version facts that shape the design:

- Next 16 renames `middleware.ts` → **`proxy.ts`** (Node runtime by default).
- Next 16 scaffolds with **Cache Components** on; we turn it **off** (auth-gated per-request financial pages; caching is done at the data layer) — see ARCHITECTURE §9.
- `params` / `searchParams` / `cookies()` are async.
- shadcn/ui primitives are hand-authored in shadcn's conventions (`components.json` present) because the shadcn registry was unreachable from the build sandbox; the CLI works normally on your machine for adding more components.

---

## 1. Page & navigation architecture

| Nav item | Route | Phase | Purpose |
|---|---|---|---|
| Dashboard | `/` | 2 (shell 1) | Portfolio Command Center: headline value, today's change, YTD vs SPY, market pulse, portfolio health, movers, AI committee, opportunity radar, upcoming events, action board |
| Portfolio | `/portfolio` | 1–2 | Accounts, holdings, transactions, CSV import, allocation, risk, attribution, trade evaluator |
| Research | `/research`, `/research/[ticker]` | 3 | Ticker search; per-ticker page w/ tabs: Overview, Financials, Valuation, Growth, Quality, Estimates, News, Insiders, Technicals, Peers, AI Thesis |
| Screener | `/screener` | 4 | Rule builder (AND/OR, weights), saved screens, AI screen (NL → interpreted criteria → confirm → run) |
| Opportunities | `/opportunities` | 4 | Opportunity Radar: new entrants, improving, deteriorating, valuation, momentum, revisions |
| Scenarios | `/scenarios` | 6 | Scenario Lab (before/after), macro scenarios, Monte Carlo |
| Planner | `/planner` | 6 | Future Investment Planner (Conservative/Balanced/Aggressive) |
| Watchlists | `/watchlists` | 4 | Multiple lists, change tracking; Investment Journal at `/watchlists/journal` |
| Alerts | `/alerts` | 7 | Rule management + event history |
| Daily Brief | `/brief`, `/brief/[date]` | 7 | Generated daily report + action board |
| Ask My Portfolio | `/ask` | 5 | Grounded chat with tool-use retrieval |
| Settings | `/settings` | 1 | Investment DNA (`/settings/dna`), scoring weights, **Access** (owner), **Sharing**, **Data Health** (owner) |

Global chrome: left sidebar nav, top bar with global ticker search, data-freshness indicator (green/amber/red from `data_freshness`), and a "MOCK DATA" banner when mock providers are active.

---

## 2. Phases & acceptance criteria

### Phase 1 — Architecture, database, auth, provider abstraction, portfolio model  ← **in progress**

Deliverables
- [x] Design docs (architecture, scoring, providers, env, this plan)
- [x] Supabase migrations: all core tables, enums, provenance columns, RLS, rate-limit function, freshness view
- [x] Auth: Supabase magic link, email allowlist, `proxy.ts` session refresh, DAL `requireUser()`
- [x] Provider interfaces + registry + HTTP layer + FMP adapter + mock adapter
- [x] Portfolio model: accounts, holdings, transactions, CSV import (preview → commit), holdings-from-transactions derivation, `BrokerageConnector` abstraction (manual/CSV; Plaid stub interface)
- [x] Job runner + first job (`refresh-prices`) + Vercel cron config
- [x] App shell + navigation + Data Health page (reads `job_runs`, `provider_requests`, `data_freshness`)

Acceptance criteria
1. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
2. Migrations apply cleanly to a fresh Supabase project (`supabase db push`).
3. A non-allowlisted email cannot obtain a session; unauthenticated requests to app routes redirect to `/login`; cron routes return 401 without `CRON_SECRET`.
4. With RLS, user A cannot read user B's holdings (verified by SQL test in `supabase/tests/rls.sql`).
5. No file outside `src/lib/providers/**` imports an adapter (lint rule fails otherwise).
6. `grep -r "FMP_API_KEY\|SUPABASE_SECRET_KEY" .next/static` returns nothing after build.
7. Provider mappers: missing fields → `null`; percent conversions covered by unit tests; plan-restricted responses become `ProviderPlanRestrictedError`.
8. CSV import: invalid rows are reported with row number + reason and are not written; valid rows are previewed before commit.
9. `refresh-prices` with one bad symbol still updates all other symbols and records `status='partial'`.

**Phase 1 verification (Oct 6, 2026):** typecheck ✓ · lint ✓ (including the provider-boundary rule, confirmed to fire on a probe import) · 62 unit tests ✓ · `next build` ✓ · migrations applied to Postgres 16 ✓ · `supabase/tests/rls.sql` ✓ (cross-user reads and writes blocked, reference data read-only, anon denied, atomic holdings replace, profile versioning, rate limiter) · client bundles contain no secret names or provider hosts ✓ · route smoke test: app routes redirect to `/login`, cron returns 401 without the secret ✓.

**Phase 1 known limitations / follow-ups**
- FMP field names are based on FMP's documented `/stable` API and could not be called from the build sandbox. Run `npm run fmp:smoke` once with your key. Any mismatch shows up as a schema warning on Data Health, and the affected values are stored as null, never as wrong numbers.
- `adj_close` is null for FMP's default EOD endpoint. Phase 2 adds the dividend-adjusted series before any total-return math.
- Non-USD positions are excluded from totals (and flagged) until FX conversion lands in Phase 2.
- Price staleness uses a generous hour threshold. A trading-day calendar comes with Phase 7.
- Supabase types are hand-declared. Once the project is linked, run `supabase gen types typescript` (Phase 2).

**Multi-user update (Oct 6, 2026):** invite-only access list with owner/member roles, private portfolios, read-only portfolio sharing, owner-only Data Health, before-user-created hook, restrictive RLS on every table. Settings → Access and Settings → Sharing pages. Supabase project `stock-intel` created and all migrations applied and verified live (cross-user isolation, owner-only logs, invite-only signup hook, last-owner protection). DB test suite extended: cross-user isolation, sharing read-only, revocation, signup hook, last-owner protection — all pass.

**Before inviting anyone:** FMP's personal plans forbid sharing data with other users (see README → Multiple users). Arrange a display/commercial license first.

**Open performance items (Supabase advisor, INFO level):** add covering indexes for foreign keys and a primary key on `portfolio_daily_snapshots` before the tables grow (Phase 2).

### Phase 2 — Dashboard, manual holdings, market data, portfolio analytics  ← **core delivered (Oct 7, 2026)**

Delivered: deterministic calc library (`src/lib/calc`: returns, TWR, XIRR, volatility, beta, Sharpe/Sortino, downside deviation, max drawdown, correlation, HHI, attribution) with reference-value tests (incl. Excel XIRR example); daily portfolio snapshot job chained after the price refresh (holdings-based daily return, so manual edits/deposits never count as performance); risk metrics written to `portfolio_metrics`; Investment DNA wizard (6 steps, validated, versioned); Command Center dashboard (headline KPIs, holdings-vs-SPY/QQQ comparison with 1M–1Y ranges, actual value chart, movers, health tiles, allocation by company/sector/industry/asset class, concentration, correlation heatmap); FK indexes + snapshot primary key.

Design decisions: risk stats on the dashboard are a labelled **backtest of current holdings** (ex-ante risk); performance (YTD, since tracking) is **actual** from daily snapshots and stays "insufficient history" until snapshots cover the period; Sharpe/Sortino need `RISK_FREE_RATE` (shown as an assumption).

Remaining for Phase 2: FX conversion for non-USD positions; dividend-adjusted price series (total return); ledger-based history reconstruction for transaction-mode accounts; custom benchmark picker; table sorting/column chooser/export on Portfolio.

### Phase 2 (original scope)

- Daily portfolio valuation snapshots; benchmark series (SPY, QQQ, custom).
- Deterministic calc library (`src/lib/calc`): daily returns, TWR (Modified Dietz daily-linked), IRR/XIRR, annualized volatility, beta vs SPY, Sharpe (rf from env/default T-bill), Sortino/downside deviation, max drawdown, correlation matrix, HHI concentration.
- Attribution: per-position $ contribution; separation of market return vs deposits/withdrawals/dividends/fees.
- Command Center UI with charts (timeframes 1D/1W/1M/3M/YTD/1Y/3Y/5Y/Max, tooltips), allocation by company/sector/industry/asset class, movers, upcoming earnings/dividends.

Acceptance: every calc has unit tests against hand-computed fixtures (incl. XIRR vs spreadsheet reference, TWR with mid-period flows); dashboard numbers reconcile to holdings × prices + cash to the cent; every figure shows its as-of time.

### Phase 3 — Stock research, fundamentals, investment scoring

- Ingest statements, provider metrics, estimates, targets, grades, events, news, insider data for universe + holdings.
- Own valuation multiples computed from statements + price (`calculated`).
- Scoring engine per SCORING.md; component storage; personal fit layer; recommendation engine (deterministic) with hysteresis and "what would change my mind".
- Research page with 11 tabs, historical metric charts, peer comparison with premium/discount highlighting.

Acceptance: golden-file scoring test; score page shows every component with raw value, peer group, percentile, contribution, source and as-of; missing data shown as "Data unavailable", never 0.

### Phase 4 — Screener, watchlists, opportunity radar

- Rule DSL (JSON) with AND/OR groups, operators, weights; SQL compilation against latest metric snapshots; saved screeners; column selection, sort, filter, CSV export.
- AI screening: Claude converts NL → rule DSL (zod-validated) → shown for confirmation → executed deterministically.
- Watchlists (OWN, HIGH CONVICTION, BUY ON WEAKNESS, RESEARCH, SPECULATIVE, DIVIDEND, AI, custom); Investment Journal + trade evaluator.
- Opportunity Radar: daily screener runs diffed vs prior run.

Acceptance: screener results reproducible from stored `screener_runs`; AI-interpreted criteria always displayed before run; radar entries link to the score deltas that produced them.

### Phase 5 — AI research & Ask My Portfolio

- Fact-sheet builder, prompt templates, structured output (ANSWER … DATA AS OF), numeric grounding check, fact-id rendering.
- Investment memo (Business … What would invalidate the thesis).
- Ask My Portfolio with tool use over the DAL; conversation storage; rate limits and spend tracking.

Acceptance: red-team suite — questions about tickers with missing data must answer "Data unavailable"; injected ungrounded numbers in mocked model output are redacted; every response carries DATA AS OF.

### Phase 6 — Scenario engine & Monte Carlo

- Scenario Lab: add/remove/resize/cash/monthly/lump-sum → before/after weights, sector weights, historical vol, beta, correlation, drawdown, concentration. Historical stats labelled historical.
- Macro scenarios as explicit factor-shock assumption sets (labelled hypothetical; assumptions table visible and editable).
- Monte Carlo: ≥5,000 paths (Web Worker / server), monthly steps, contributions, inflation, percentiles 10/25/50/75/90, P(target), histogram; seedable RNG for reproducibility; assumptions documented on-screen.
- Future Investment Planner: gap analysis vs DNA targets → 3 strategies with per-position rationale; no guarantees.

Acceptance: MC statistics match analytic lognormal results within tolerance for a single-asset test; seeded runs reproducible.

### Phase 7 — Daily automation, alerts, daily brief

- Full daily DAG with degraded-mode handling; change detection (1d/7d/30d) → `change_events`.
- Alert engine (price, valuation, score, rating, earnings, revisions, filings, insider, concentration, drawdown, screener match) with dedupe/cool-down; email notifications.
- Daily Brief generation with action board (REVIEW NOW / WATCH / NO ACTION); "No portfolio action recommended today" when warranted.

Acceptance: brief is reproducible from stored rows; a day with no material changes produces a no-action brief; every recommendation change cites its `change_events`.

### Phase 8 — Plaid brokerage integration

- `PlaidConnector implements BrokerageConnector` (Investments holdings + transactions, read-only); Link flow; encrypted access tokens; webhook for updates; reconciliation with manual/CSV accounts.

Acceptance: Plaid can be disabled entirely via env with no code path changes; tokens never leave the server; sandbox end-to-end test.

---

## 3. What works immediately vs. what needs paid services

| Feature | Needs | Notes |
|---|---|---|
| Auth, DB, portfolio entry, CSV import, journal, watchlists, DNA wizard | Supabase free tier | Works day one |
| Prices for holdings, dashboard, risk metrics | FMP Starter+ | FMP free tier covers only a sample symbol list at 250 calls/day |
| Fundamentals (annual) & scoring | FMP Starter+ (or SEC EDGAR, free) | |
| Quarterly/TTM fundamentals, 30y history for "vs own history" | FMP Premium | Starter limited to 5y history |
| Analyst estimates, revisions, targets, calendars | FMP Premium (verify on Starter) | Forward Expectations + Revisions = 25% of default score weight |
| Institutional ownership (13F) | FMP Ultimate (or EDGAR 13F parsing) | Score degrades gracefully: category excluded & weights re-normalized |
| Intraday prices | FMP Premium+ or Polygon/Massive | Daily EOD is the default design |
| AI memo, chat, brief narrative, NL screening | Anthropic API (usage-billed) | All deterministic features work without it |
| Brokerage sync | Plaid (production access is paid/approval-based) | Manual + CSV cover the need until then |
| Hosting & crons | Vercel Hobby (daily crons only) or Pro (sub-daily) | Supabase free = 500 MB; a large price-history universe likely needs Supabase Pro |

**Recommended starting stack:** FMP Premium + Supabase (free → Pro when the universe grows) + Vercel Hobby + Anthropic API. Verify current plan details on each vendor's pricing page before subscribing.

---

## 4. Open decisions (defaults chosen; change any time)

| Decision | Default |
|---|---|
| Scoring universe | S&P 500 + S&P 400 + holdings + watchlists |
| Risk-free rate for Sharpe | 3-month T-bill from FMP treasury endpoint; fallback env `RISK_FREE_RATE` |
| Base currency | USD (multi-currency holdings stored with currency; FX conversion in Phase 2) |
| Daily refresh time | 22:30 UTC weekdays (after US close + provider settlement) |
| Auth method | Email magic link (Supabase); add passkey/TOTP later if desired |
