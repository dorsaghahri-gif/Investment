-- ═══════════════════════════════════════════════════════════════════
-- 0002 MARKET & REFERENCE DATA (shared across users; written by jobs
-- using the service role; read-only for authenticated users)
--
-- Every table carries provenance: source_provider, source_ref,
-- data_kind, as_of (economic date), fetched_at, ingested_job_id.
-- Missing values are NULL — never 0.
-- ═══════════════════════════════════════════════════════════════════

-- Latest quote per security (overwritten intraday; daily closes go to security_prices).
create table public.security_quotes (
  company_id        uuid primary key references public.companies(id) on delete cascade,
  price             numeric(20,6),
  change            numeric(20,6),
  change_pct        numeric(12,8),     -- decimal fraction
  previous_close    numeric(20,6),
  open              numeric(20,6),
  day_high          numeric(20,6),
  day_low           numeric(20,6),
  volume            bigint,
  market_cap        numeric(24,2),
  year_high         numeric(20,6),
  year_low          numeric(20,6),
  currency          char(3),
  quote_time        timestamptz,       -- exchange timestamp of the quote
  source_provider   public.provider_id not null,
  source_ref        text,
  fetched_at        timestamptz not null default now(),
  ingested_job_id   uuid
);

-- Daily OHLCV history (append-only per date; revisions recorded).
create table public.security_prices (
  company_id        uuid not null references public.companies(id) on delete cascade,
  price_date        date not null,
  open              numeric(20,6),
  high              numeric(20,6),
  low               numeric(20,6),
  close             numeric(20,6) not null,
  adj_close         numeric(20,6),
  volume            bigint,
  vwap              numeric(20,6),
  currency          char(3),
  source_provider   public.provider_id not null,
  source_ref        text,
  fetched_at        timestamptz not null default now(),
  revised_at        timestamptz,
  ingested_job_id   uuid,
  primary key (company_id, price_date)
);
create index security_prices_date_idx on public.security_prices (price_date);

-- Financial statements: one row per (company, type, period, fiscal period end).
-- line_items uses the normalized key dictionary in src/lib/domain/fundamentals.ts.
create table public.financial_statements (
  id                bigint generated always as identity primary key,
  company_id        uuid not null references public.companies(id) on delete cascade,
  statement_type    public.statement_type not null,
  period            public.statement_period not null,
  fiscal_year       integer,
  fiscal_quarter    smallint check (fiscal_quarter between 1 and 4),
  period_end        date not null,
  filed_at          date,
  currency          char(3),
  line_items        jsonb not null,
  data_kind         public.data_kind not null default 'reported',
  source_provider   public.provider_id not null,
  source_ref        text,                  -- e.g. endpoint, or SEC accession number
  fetched_at        timestamptz not null default now(),
  revised_at        timestamptz,
  ingested_job_id   uuid,
  unique (company_id, statement_type, period, period_end, source_provider)
);

-- Long-format metric store: powers scoring, screener, history charts.
create table public.financial_metrics (
  id                bigint generated always as identity primary key,
  company_id        uuid not null references public.companies(id) on delete cascade,
  metric_key        text not null,          -- e.g. 'roic', 'gross_margin', 'revenue_growth_yoy'
  period            public.statement_period not null,
  as_of             date not null,          -- period end (or calc date for TTM)
  value             numeric(28,10),         -- null = unavailable
  unit              text not null default 'ratio',  -- ratio | usd | usd_per_share | x | days | count
  data_kind         public.data_kind not null,
  source_provider   public.provider_id not null,
  source_ref        text,                   -- calc function + version when data_kind='calculated'
  inputs            jsonb,                  -- references to inputs for calculated metrics
  fetched_at        timestamptz not null default now(),
  ingested_job_id   uuid,
  unique (company_id, metric_key, period, as_of, source_provider)
);
create index financial_metrics_lookup_idx on public.financial_metrics (metric_key, as_of desc);

-- Daily valuation snapshot (our deterministic calculation from price + statements).
create table public.valuation_snapshots (
  company_id        uuid not null references public.companies(id) on delete cascade,
  snapshot_date     date not null,
  price             numeric(20,6),
  market_cap        numeric(24,2),
  enterprise_value  numeric(24,2),
  pe_ttm            numeric(14,4),
  pe_forward        numeric(14,4),
  peg               numeric(14,4),
  ev_ebitda         numeric(14,4),
  ev_sales          numeric(14,4),
  ps_ttm            numeric(14,4),
  p_fcf             numeric(14,4),
  fcf_yield         numeric(12,8),
  earnings_yield    numeric(12,8),
  dividend_yield    numeric(12,8),
  inputs            jsonb not null default '{}'::jsonb,   -- which price/statement/estimate rows were used
  data_kind         public.data_kind not null default 'calculated',
  calc_version      text not null,
  computed_at       timestamptz not null default now(),
  ingested_job_id   uuid,
  primary key (company_id, snapshot_date)
);

-- Consensus estimates, snapshotted on each fetch date so revisions are measurable.
create table public.analyst_estimates (
  id                bigint generated always as identity primary key,
  company_id        uuid not null references public.companies(id) on delete cascade,
  period            public.statement_period not null check (period in ('annual','quarter')),
  fiscal_period_end date not null,
  snapshot_date     date not null,
  revenue_avg       numeric(24,2),
  revenue_low       numeric(24,2),
  revenue_high      numeric(24,2),
  ebitda_avg        numeric(24,2),
  net_income_avg    numeric(24,2),
  eps_avg           numeric(14,6),
  eps_low           numeric(14,6),
  eps_high          numeric(14,6),
  num_analysts_revenue integer,
  num_analysts_eps  integer,
  data_kind         public.data_kind not null default 'estimate',
  source_provider   public.provider_id not null,
  source_ref        text,
  fetched_at        timestamptz not null default now(),
  ingested_job_id   uuid,
  unique (company_id, period, fiscal_period_end, snapshot_date, source_provider)
);

create table public.price_targets (
  id                bigint generated always as identity primary key,
  company_id        uuid not null references public.companies(id) on delete cascade,
  snapshot_date     date not null,
  target_high       numeric(20,6),
  target_low        numeric(20,6),
  target_mean       numeric(20,6),
  target_median     numeric(20,6),
  num_analysts      integer,
  data_kind         public.data_kind not null default 'estimate',
  source_provider   public.provider_id not null,
  fetched_at        timestamptz not null default now(),
  ingested_job_id   uuid,
  unique (company_id, snapshot_date, source_provider)
);

-- Individual rating actions (upgrade/downgrade/initiate).
create table public.analyst_ratings (
  id                bigint generated always as identity primary key,
  company_id        uuid not null references public.companies(id) on delete cascade,
  action_date       date not null,
  firm              text not null,
  action            text,                   -- upgrade | downgrade | maintain | initiate | reiterate
  from_grade        text,
  to_grade          text,
  source_provider   public.provider_id not null,
  fetched_at        timestamptz not null default now(),
  unique (company_id, action_date, firm, to_grade)
);

-- Earnings, dividends, splits, SEC filings, guidance.
create table public.company_events (
  id                bigint generated always as identity primary key,
  company_id        uuid not null references public.companies(id) on delete cascade,
  event_type        text not null check (event_type in ('earnings','dividend','split','filing','guidance','other')),
  event_date        date not null,
  event_time        text,                   -- 'bmo' | 'amc' | null
  title             text,
  details           jsonb not null default '{}'::jsonb,
  -- earnings: eps_estimate, eps_actual, revenue_estimate, revenue_actual
  -- dividend: amount, ex_date, record_date, pay_date
  -- split: numerator, denominator
  -- filing: form_type, accession, url
  url               text,
  dedupe_key        text not null,          -- provider-independent identity, e.g. 'earnings:2026-10-28'
  data_kind         public.data_kind not null default 'reported',
  source_provider   public.provider_id not null,
  fetched_at        timestamptz not null default now(),
  ingested_job_id   uuid,
  unique (company_id, dedupe_key)
);
create index company_events_date_idx on public.company_events (event_date);

create table public.news_articles (
  id                uuid primary key default gen_random_uuid(),
  url               text not null unique,
  title             text not null,
  publisher         text,
  published_at      timestamptz not null,
  summary           text,
  image_url         text,
  sentiment         numeric(6,4) check (sentiment between -1 and 1),  -- null when unavailable
  sentiment_source  public.provider_id,
  source_provider   public.provider_id not null,
  fetched_at        timestamptz not null default now(),
  ingested_job_id   uuid
);
create index news_articles_published_idx on public.news_articles (published_at desc);

create table public.news_article_symbols (
  article_id  uuid not null references public.news_articles(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  primary key (article_id, company_id)
);
create index news_article_symbols_company_idx on public.news_article_symbols (company_id);

create table public.insider_transactions (
  id                bigint generated always as identity primary key,
  company_id        uuid not null references public.companies(id) on delete cascade,
  filing_date       date,
  transaction_date  date not null,
  insider_name      text not null,
  insider_title     text,
  transaction_code  text,                   -- SEC Form 4 code: P, S, A, M, F, G...
  acquired_disposed char(1) check (acquired_disposed in ('A','D')),
  shares            numeric(24,4),
  price             numeric(20,6),
  value             numeric(24,2),
  shares_owned_after numeric(24,4),
  url               text,
  dedupe_key        text not null,
  data_kind         public.data_kind not null default 'reported',
  source_provider   public.provider_id not null,
  fetched_at        timestamptz not null default now(),
  ingested_job_id   uuid,
  unique (company_id, dedupe_key)
);
create index insider_transactions_date_idx on public.insider_transactions (company_id, transaction_date desc);

create table public.institutional_ownership (
  id                bigint generated always as identity primary key,
  company_id        uuid not null references public.companies(id) on delete cascade,
  report_date       date not null,          -- quarter end
  institutions_count integer,
  shares_held       numeric(24,4),
  ownership_pct     numeric(12,8),          -- decimal fraction of shares outstanding
  shares_change     numeric(24,4),
  new_positions     integer,
  closed_positions  integer,
  data_kind         public.data_kind not null default 'reported',
  source_provider   public.provider_id not null,
  fetched_at        timestamptz not null default now(),
  ingested_job_id   uuid,
  unique (company_id, report_date, source_provider)
);
