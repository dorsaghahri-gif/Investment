-- ═══════════════════════════════════════════════════════════════════
-- 0003 ANALYTICS, RESEARCH WORKFLOW, AI (per-user)
-- Daily tables are keyed by snapshot_date to support
-- today vs 1d / 7d / 30d change detection with simple joins.
-- ═══════════════════════════════════════════════════════════════════

-- ── Portfolio analytics ────────────────────────────────────────────

create table public.portfolio_daily_snapshots (
  user_id            uuid not null references public.users(id) on delete cascade,
  account_id         uuid references public.accounts(id) on delete cascade,  -- null = whole portfolio
  snapshot_date      date not null,
  market_value       numeric(20,4) not null,
  cash_value         numeric(20,4) not null,
  total_value        numeric(20,4) not null,
  cost_basis         numeric(20,4),
  net_external_flow  numeric(20,4) not null default 0,  -- deposits − withdrawals that day
  dividends          numeric(20,4) not null default 0,
  fees               numeric(20,4) not null default 0,
  daily_return       numeric(14,10),                    -- time-weighted, flow-adjusted
  positions          jsonb not null,                    -- [{symbol, qty, price, value, weight, price_date}]
  price_staleness    jsonb not null default '{}'::jsonb, -- {symbol: price_date} for any non-current prices
  calc_version       text not null,
  computed_at        timestamptz not null default now()
);
-- account_id may be null (portfolio-level), so uniqueness uses an expression index.
create unique index portfolio_daily_snapshots_uq
  on public.portfolio_daily_snapshots (user_id, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), snapshot_date);

create table public.portfolio_metrics (
  user_id        uuid not null references public.users(id) on delete cascade,
  snapshot_date  date not null,
  metric_key     text not null,     -- twr_ytd, irr_since_inception, vol_ann_1y, beta_spy_1y, sharpe_1y, max_dd_1y, downside_dev_1y, hhi, top5_weight ...
  window_label   text not null default 'na',  -- 1m | 3m | ytd | 1y | 3y | inception | na
  benchmark      text,              -- SPY | QQQ | custom symbol
  value          numeric(28,10),
  unit           text not null default 'ratio',
  data_kind      public.data_kind not null default 'calculated',
  calc_version   text not null,
  inputs         jsonb,
  computed_at    timestamptz not null default now(),
  primary key (user_id, snapshot_date, metric_key, window_label)
);

-- ── Scoring ────────────────────────────────────────────────────────

create table public.scoring_models (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  name         text not null default 'Default',
  is_active    boolean not null default true,
  weights      jsonb not null,      -- {"quality":20,"growth":15,...}
  metric_weights jsonb not null default '{}'::jsonb, -- optional per-metric overrides
  peer_blend   jsonb not null default '{"industry":0.35,"sector":0.25,"market":0.20,"history":0.20}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index scoring_models_one_active on public.scoring_models (user_id) where is_active;

create table public.investment_scores (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  company_id         uuid not null references public.companies(id) on delete cascade,
  snapshot_date      date not null,
  model_version      text not null,
  scoring_model_id   uuid references public.scoring_models(id) on delete set null,
  overall            numeric(6,2),          -- null when insufficient data
  personal           numeric(6,2),          -- DNA-adjusted
  quality            numeric(6,2),
  growth             numeric(6,2),
  valuation          numeric(6,2),
  forward            numeric(6,2),
  momentum           numeric(6,2),
  revisions          numeric(6,2),
  balance_sheet      numeric(6,2),
  competitive        numeric(6,2),
  ownership          numeric(6,2),
  coverage           numeric(6,4) not null, -- 0..1
  confidence         public.confidence_level not null,
  dna_pass           boolean,
  dna_failures       jsonb not null default '[]'::jsonb,
  computed_at        timestamptz not null default now(),
  unique (user_id, company_id, snapshot_date, model_version)
);
create index investment_scores_company_date_idx on public.investment_scores (company_id, snapshot_date desc);

create table public.investment_score_components (
  id                    bigint generated always as identity primary key,
  score_id              uuid not null references public.investment_scores(id) on delete cascade,
  category              text not null,
  metric_key            text not null,
  raw_value             numeric(28,10),
  unit                  text,
  direction             smallint not null check (direction in (-1, 1)), -- 1 higher is better
  peer_group            text,
  peer_count            integer,
  percentile_industry   numeric(6,2),
  percentile_sector     numeric(6,2),
  percentile_market     numeric(6,2),
  own_history_z         numeric(10,4),
  sub_score             numeric(6,2),
  weight                numeric(8,4) not null,
  contribution          numeric(8,4),
  is_missing            boolean not null default false,
  is_stale              boolean not null default false,
  source_provider       public.provider_id,
  data_kind             public.data_kind,
  as_of                 date,
  unique (score_id, metric_key)
);

-- ── Recommendations ────────────────────────────────────────────────

create table public.recommendations (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users(id) on delete cascade,
  company_id          uuid not null references public.companies(id) on delete cascade,
  snapshot_date       date not null,
  rating              public.recommendation_rating not null,   -- deterministic engine output
  confidence          public.confidence_level not null,
  engine_version      text not null,
  score_id            uuid references public.investment_scores(id) on delete set null,
  price               numeric(20,6),
  price_as_of         timestamptz,
  fair_value_low      numeric(20,6),
  fair_value_high     numeric(20,6),
  fair_value_methods  jsonb not null default '[]'::jsonb,
  positives           jsonb not null default '[]'::jsonb,      -- structured factor refs
  negatives           jsonb not null default '[]'::jsonb,
  risks               jsonb not null default '[]'::jsonb,
  catalysts           jsonb not null default '[]'::jsonb,
  portfolio_impact    jsonb not null default '{}'::jsonb,
  upgrade_triggers    jsonb not null default '[]'::jsonb,      -- "what would change my mind"
  downgrade_triggers  jsonb not null default '[]'::jsonb,
  rules_fired         jsonb not null default '[]'::jsonb,
  data_freshness      jsonb not null default '{}'::jsonb,
  narrative           jsonb,                                   -- Claude output (ai_interpretation), grounded
  narrative_model     text,
  narrative_fact_hash text,
  created_at          timestamptz not null default now(),
  unique (user_id, company_id, snapshot_date)
);

create table public.recommendation_history (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references public.users(id) on delete cascade,
  company_id         uuid not null references public.companies(id) on delete cascade,
  changed_on         date not null,
  from_rating        public.recommendation_rating,
  to_rating          public.recommendation_rating not null,
  from_recommendation_id uuid references public.recommendations(id) on delete set null,
  to_recommendation_id   uuid references public.recommendations(id) on delete set null,
  reasons            jsonb not null default '[]'::jsonb,   -- links to change_events + deltas
  created_at         timestamptz not null default now()
);

-- Detected meaningful changes (input to brief, alerts, recommendation explanations).
create table public.change_events (
  id               bigint generated always as identity primary key,
  user_id          uuid references public.users(id) on delete cascade,   -- null = market-wide (shared)
  company_id       uuid references public.companies(id) on delete cascade,
  detected_on      date not null,
  window_label     text not null check (window_label in ('1d','7d','30d','event')),
  category         text not null,  -- score | price | valuation | estimates | filing | earnings | guidance | insider | news | risk | concentration | rating
  metric_key       text,
  from_value       numeric(28,10),
  to_value         numeric(28,10),
  magnitude        numeric(28,10),
  severity         smallint not null default 1 check (severity between 1 and 3),
  details          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index change_events_user_date_idx on public.change_events (user_id, detected_on desc);

-- ── Watchlists, journal ────────────────────────────────────────────

create table public.watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        text not null,
  kind        text not null default 'custom' check (kind in ('own','high_conviction','buy_on_weakness','research','speculative','dividend','ai','custom')),
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table public.watchlist_members (
  watchlist_id  uuid not null references public.watchlists(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  added_at      timestamptz not null default now(),
  added_price   numeric(20,6),
  added_score   numeric(6,2),
  target_price  numeric(20,6),
  notes         text,
  removed_at    timestamptz,               -- soft remove keeps history
  primary key (watchlist_id, company_id)
);

create table public.journal_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  company_id         uuid references public.companies(id) on delete set null,
  symbol             text not null,
  decision           public.journal_decision not null,
  decided_on         date not null,
  price_at_decision  numeric(20,6),
  price_source       public.provider_id,
  thesis             text,
  expected_catalysts text,
  risks              text,
  confidence         smallint check (confidence between 1 and 5),
  review_on          date,
  outcome_notes      text,
  linked_transaction_id uuid references public.portfolio_transactions(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── Screeners ──────────────────────────────────────────────────────

create table public.screeners (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  name           text not null,
  description    text,
  natural_language_query text,              -- when created via AI screening
  root_logic     text not null default 'and' check (root_logic in ('and','or')),
  universe       text not null default 'default',
  run_daily      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, name)
);

create table public.screener_rules (
  id            uuid primary key default gen_random_uuid(),
  screener_id   uuid not null references public.screeners(id) on delete cascade,
  group_id      smallint not null default 0,   -- rules in the same group combine with group_logic
  group_logic   text not null default 'and' check (group_logic in ('and','or')),
  metric_key    text not null,
  operator      text not null check (operator in ('>','>=','<','<=','=','!=','between','in','not_in','is_null','not_null')),
  value         jsonb not null,
  weight        numeric(8,4) not null default 1,
  is_required   boolean not null default true,  -- false = scoring-only (weighted preference)
  sort_order    integer not null default 0
);

create table public.screener_runs (
  id            uuid primary key default gen_random_uuid(),
  screener_id   uuid not null references public.screeners(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  run_date      date not null,
  rules_snapshot jsonb not null,             -- exact rules used (reproducibility)
  universe_size integer,
  match_count   integer,
  data_as_of    jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create table public.screener_results (
  run_id        uuid not null references public.screener_runs(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  rank          integer,
  match_score   numeric(8,4),
  metric_values jsonb not null,              -- values of each rule metric at run time
  why_matches   jsonb not null default '[]'::jsonb,
  primary key (run_id, company_id)
);

-- ── Alerts ─────────────────────────────────────────────────────────

create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  name            text not null,
  alert_type      text not null check (alert_type in ('price','valuation','score','recommendation','earnings','revision','filing','insider','concentration','drawdown','screener_match','custom')),
  company_id      uuid references public.companies(id) on delete cascade,  -- null = portfolio-level
  condition       jsonb not null,      -- e.g. {"metric":"pe_forward","op":"<","value":25}
  cooldown_hours  integer not null default 24,
  is_active       boolean not null default true,
  last_triggered_at timestamptz,
  notify_email    boolean not null default true,
  created_at      timestamptz not null default now()
);

create table public.alert_events (
  id            bigint generated always as identity primary key,
  alert_id      uuid not null references public.alerts(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  triggered_at  timestamptz not null default now(),
  observed      jsonb not null,        -- value(s) that triggered + provenance
  message       text not null,
  acknowledged_at timestamptz
);

-- ── Scenarios & planning ───────────────────────────────────────────

create table public.scenario_runs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  kind           text not null check (kind in ('position_change','contribution','macro','monte_carlo','planner')),
  name           text,
  prompt         text,                 -- natural-language request, if any
  assumptions    jsonb not null,       -- every assumption, labelled scenario_assumption
  seed           bigint,               -- RNG seed for reproducibility
  engine_version text not null,
  data_as_of     jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create table public.scenario_results (
  id           bigint generated always as identity primary key,
  run_id       uuid not null references public.scenario_runs(id) on delete cascade,
  result_key   text not null,          -- before | after | percentiles | distribution | strategy:balanced ...
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  unique (run_id, result_key)
);

-- ── Daily brief & AI ───────────────────────────────────────────────

create table public.daily_briefs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  brief_date       date not null,
  status           text not null default 'ready' check (status in ('generating','ready','degraded','failed')),
  sections         jsonb not null,     -- structured sections (facts) rendered by the UI
  narrative        jsonb,              -- Claude commentary per section (grounded)
  action_board     jsonb not null default '{"review_now":[],"watch":[],"no_action":[]}'::jsonb,
  no_action_today  boolean not null default false,
  data_freshness   jsonb not null default '{}'::jsonb,
  model            text,
  fact_hash        text,
  job_run_id       uuid,
  created_at       timestamptz not null default now(),
  unique (user_id, brief_date)
);

create table public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.ai_messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.ai_conversations(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  role             text not null check (role in ('user','assistant','tool')),
  content          jsonb not null,
  tool_calls       jsonb,
  grounding        jsonb,              -- {checked: n, ungrounded: [...], redacted: bool}
  model            text,
  input_tokens     integer,
  output_tokens    integer,
  created_at       timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages (conversation_id, id);
