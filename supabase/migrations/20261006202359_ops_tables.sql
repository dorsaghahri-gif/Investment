-- ═══════════════════════════════════════════════════════════════════
-- 0004 OPERATIONS: job runs, provider request log, freshness, rate limits
-- ═══════════════════════════════════════════════════════════════════

create table public.job_runs (
  id               uuid primary key default gen_random_uuid(),
  job_name         text not null,
  trigger          text not null default 'cron' check (trigger in ('cron','manual','chained')),
  status           public.job_status not null default 'running',
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  records_updated  integer not null default 0,
  items_total      integer,
  items_failed     integer not null default 0,
  provider_stats   jsonb not null default '{}'::jsonb,  -- {fmp:{calls, failures, by_error:{...}}}
  error            text,
  failures         jsonb not null default '[]'::jsonb,   -- [{item, provider, error_class, message}] (capped)
  state            jsonb not null default '{}'::jsonb,   -- cursor for chunked jobs
  triggered_by     uuid references public.users(id) on delete set null
);
create index job_runs_name_started_idx on public.job_runs (job_name, started_at desc);

create table public.provider_requests (
  id            bigint generated always as identity primary key,
  provider      public.provider_id not null,
  category      text not null,       -- market_data | fundamentals | estimates | company_info | events | news | insider
  endpoint      text not null,       -- path only; never includes credentials
  symbol        text,
  http_status   integer,
  ok            boolean not null,
  error_class   text,
  error_message text,
  duration_ms   integer,
  schema_warnings text[],
  job_run_id    uuid references public.job_runs(id) on delete set null,
  requested_at  timestamptz not null default now()
);
create index provider_requests_time_idx on public.provider_requests (requested_at desc);
create index provider_requests_failed_idx on public.provider_requests (provider, requested_at desc) where not ok;

-- Freshness SLAs per dataset (hours). Weekend-aware logic lives in app code;
-- these thresholds are generous enough to avoid false alarms over weekends.
create table public.dataset_freshness_sla (
  dataset         text primary key,
  label           text not null,
  category        text not null,
  max_age_hours   integer not null,
  critical_age_hours integer not null
);

insert into public.dataset_freshness_sla (dataset, label, category, max_age_hours, critical_age_hours) values
  ('quotes',        'Latest quotes',         'market_data',  26,  96),
  ('daily_prices',  'Daily price history',   'market_data',  26,  96),
  ('profiles',      'Company profiles',      'company_info', 24*14, 24*45),
  ('fundamentals',  'Financial statements',  'fundamentals', 24*7,  24*30),
  ('estimates',     'Analyst estimates',     'estimates',    24*3,  24*10),
  ('events',        'Earnings / dividends / filings', 'events', 26, 96),
  ('news',          'News',                  'news',         26,  96),
  ('insider',       'Insider transactions',  'insider',      24*3,  24*10),
  ('portfolio',     'Portfolio snapshot',    'portfolio',    26,  96);

-- ── Rate limiting (fixed window, works across serverless instances) ─

create table public.rate_limit_buckets (
  bucket_key    text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket_key, window_start)
);

