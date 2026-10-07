-- ═══════════════════════════════════════════════════════════════════
-- 0001 CORE: extensions, enums, users, investment profile, portfolio
-- ═══════════════════════════════════════════════════════════════════

-- gen_random_uuid() is built into Postgres 13+. citext lives in the `extensions`
-- schema (Supabase convention; keeps extensions out of public).
create schema if not exists extensions;
create extension if not exists citext with schema extensions;

-- ── Enums ──────────────────────────────────────────────────────────

-- Provenance classification shown in the UI for every value.
create type public.data_kind as enum (
  'reported',            -- as filed / as published by the exchange (facts)
  'provider_derived',    -- ratio/metric computed by the data provider
  'calculated',          -- computed deterministically by this app
  'estimate',            -- analyst / consensus estimates
  'ai_interpretation',   -- LLM narrative; never a numeric source
  'scenario_assumption'  -- user/system hypothetical inputs
);

create type public.provider_id as enum (
  'fmp', 'sec_edgar', 'polygon', 'plaid', 'manual', 'csv', 'calc', 'mock'
);

create type public.security_type as enum ('stock', 'etf', 'fund', 'adr', 'index', 'cash', 'crypto', 'other');
create type public.asset_class as enum ('equity', 'fixed_income', 'cash', 'commodity', 'real_estate', 'crypto', 'multi_asset', 'other');
create type public.account_type as enum ('taxable', 'ira_traditional', 'ira_roth', '401k', 'hsa', 'other');
create type public.account_source as enum ('manual', 'csv', 'plaid');
create type public.tracking_mode as enum ('positions', 'transactions');

create type public.transaction_type as enum (
  'buy', 'sell', 'dividend', 'interest', 'deposit', 'withdrawal',
  'fee', 'split', 'transfer_in', 'transfer_out', 'reinvest', 'other'
);

create type public.recommendation_rating as enum ('strong_buy', 'buy', 'watch', 'hold', 'reduce', 'avoid');
create type public.confidence_level as enum ('high', 'medium', 'low');
create type public.job_status as enum ('running', 'success', 'partial', 'failed', 'skipped');
create type public.statement_period as enum ('annual', 'quarter', 'ttm');
create type public.statement_type as enum ('income', 'balance', 'cash_flow');
create type public.journal_decision as enum ('buy', 'sell', 'watch', 'pass', 'add', 'trim');

-- ── Helpers ────────────────────────────────────────────────────────

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Users (mirror of auth.users) ───────────────────────────────────

create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         extensions.citext not null unique,
  display_name  text,
  base_currency char(3) not null default 'USD',
  timezone      text not null default 'America/Chicago',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- Create the public.users row when an auth user is created.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ── Investment DNA ─────────────────────────────────────────────────
-- One active profile per user; every save also writes a history row so
-- recommendations can be explained against the profile in force at the time.

create table public.investment_profiles (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null unique references public.users(id) on delete cascade,
  version                     integer not null default 1,
  horizon_years               integer check (horizon_years between 0 and 80),
  risk_tolerance              smallint check (risk_tolerance between 1 and 10),
  target_return               numeric(8,5),   -- decimal fraction, e.g. 0.10
  max_drawdown                numeric(8,5),   -- decimal fraction, positive, e.g. 0.30
  market_cap_min              numeric(20,2),
  market_cap_max              numeric(20,2),
  preferred_sectors           text[] not null default '{}',
  excluded_sectors            text[] not null default '{}',
  growth_value_tilt           smallint check (growth_value_tilt between -5 and 5),  -- -5 deep value … +5 high growth
  dividend_preference         smallint check (dividend_preference between 0 and 5),
  max_position_weight         numeric(8,5),
  max_sector_weight           numeric(8,5),
  min_revenue_growth          numeric(8,5),
  min_eps_growth              numeric(8,5),
  min_fcf_growth              numeric(8,5),
  min_roic                    numeric(8,5),
  max_net_debt_to_ebitda      numeric(10,4),
  valuation_ranges            jsonb not null default '{}'::jsonb,   -- e.g. {"pe_forward":{"max":35},"ev_ebitda":{"max":25}}
  momentum_preference         smallint check (momentum_preference between 0 and 5),
  require_profitability       boolean not null default false,
  quality_requirements        jsonb not null default '{}'::jsonb,
  cash_target_weight          numeric(8,5),
  preferred_position_weight   numeric(8,5),
  max_speculative_weight      numeric(8,5),
  freeform_instructions       text,
  -- structured rules proposed from freeform text; only applied once confirmed
  derived_rules               jsonb not null default '[]'::jsonb,
  derived_rules_confirmed_at  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create trigger investment_profiles_updated_at before update on public.investment_profiles
  for each row execute function public.set_updated_at();

create table public.investment_profile_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users(id) on delete cascade,
  profile_id  uuid not null references public.investment_profiles(id) on delete cascade,
  version     integer not null,
  snapshot    jsonb not null,
  created_at  timestamptz not null default now(),
  unique (profile_id, version)
);

create or replace function public.bump_investment_profile_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end $$;

create or replace function public.snapshot_investment_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.investment_profile_history (user_id, profile_id, version, snapshot)
  values (new.user_id, new.id, new.version, to_jsonb(new));
  return null;
end $$;

create trigger investment_profiles_version before update on public.investment_profiles
  for each row execute function public.bump_investment_profile_version();
-- AFTER so the parent row exists for the FK.
create trigger investment_profiles_history after insert or update on public.investment_profiles
  for each row execute function public.snapshot_investment_profile();

-- ── Security master ("companies" covers stocks, ETFs, funds) ───────

create table public.companies (
  id                 uuid primary key default gen_random_uuid(),
  symbol             text not null unique check (symbol = upper(symbol)),
  name               text,
  security_type      public.security_type not null default 'stock',
  asset_class        public.asset_class not null default 'equity',
  exchange           text,
  currency           char(3),
  country            text,
  sector             text,
  industry           text,
  description        text,
  website            text,
  cik                text,
  isin               text,
  cusip              text,
  ipo_date           date,
  employees          integer,
  is_active          boolean not null default true,
  -- provenance of profile fields
  source_provider    public.provider_id,
  source_ref         text,
  fetched_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index companies_sector_idx on public.companies (sector);
create index companies_industry_idx on public.companies (industry);
create trigger companies_updated_at before update on public.companies
  for each row execute function public.set_updated_at();

create table public.company_peers (
  company_id       uuid not null references public.companies(id) on delete cascade,
  peer_company_id  uuid not null references public.companies(id) on delete cascade,
  method           text not null default 'provider',  -- provider | industry | correlation | manual
  rank             smallint,
  source_provider  public.provider_id not null,
  fetched_at       timestamptz not null default now(),
  primary key (company_id, peer_company_id, method)
);

create table public.company_executives (
  id               bigint generated always as identity primary key,
  company_id       uuid not null references public.companies(id) on delete cascade,
  name             text not null,
  title            text,
  since_year       integer,
  pay              numeric(20,2),
  pay_currency     char(3),
  source_provider  public.provider_id not null,
  fetched_at       timestamptz not null default now(),
  unique (company_id, name, title)
);

-- ── Accounts & holdings ────────────────────────────────────────────

create table public.brokerage_connections (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  provider              public.provider_id not null check (provider in ('plaid')),
  institution_name      text,
  external_item_id      text,
  -- AES-256-GCM ciphertext (app-level encryption, key in CREDENTIALS_ENCRYPTION_KEY)
  access_token_cipher   text,
  status                text not null default 'active',
  last_synced_at        timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger brokerage_connections_updated_at before update on public.brokerage_connections
  for each row execute function public.set_updated_at();

create table public.accounts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.users(id) on delete cascade,
  name                   text not null,
  institution            text,
  account_type           public.account_type not null default 'taxable',
  source                 public.account_source not null default 'manual',
  tracking_mode          public.tracking_mode not null default 'positions',
  brokerage_connection_id uuid references public.brokerage_connections(id) on delete set null,
  external_account_id    text,
  base_currency          char(3) not null default 'USD',
  cash_balance           numeric(20,4) not null default 0,
  cash_balance_as_of     timestamptz,
  is_archived            boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, name)
);
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

create table public.import_batches (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  account_id     uuid references public.accounts(id) on delete cascade,
  kind           text not null check (kind in ('positions', 'transactions')),
  filename       text,
  row_count      integer not null default 0,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  errors         jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

-- Current positions. In 'transactions' tracking mode these rows are derived
-- from portfolio_transactions; in 'positions' mode they are the source of truth.
create table public.portfolio_holdings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  account_id        uuid not null references public.accounts(id) on delete cascade,
  company_id        uuid references public.companies(id),
  symbol            text not null check (symbol = upper(symbol)),
  quantity          numeric(28,10) not null check (quantity >= 0),
  cost_basis_total  numeric(20,4),          -- null = unknown (never assume 0)
  currency          char(3) not null default 'USD',
  acquired_on       date,
  source            public.account_source not null default 'manual',
  import_batch_id   uuid references public.import_batches(id) on delete set null,
  notes             text,
  as_of             timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (account_id, symbol)
);
create index portfolio_holdings_user_idx on public.portfolio_holdings (user_id);
create trigger portfolio_holdings_updated_at before update on public.portfolio_holdings
  for each row execute function public.set_updated_at();

create table public.portfolio_transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  account_id        uuid not null references public.accounts(id) on delete cascade,
  company_id        uuid references public.companies(id),
  symbol            text check (symbol is null or symbol = upper(symbol)),
  type              public.transaction_type not null,
  trade_date        date not null,
  settle_date       date,
  quantity          numeric(28,10),
  price             numeric(20,6),
  amount            numeric(20,4) not null,   -- signed cash impact on the account (+ in, − out)
  fees              numeric(20,4) not null default 0,
  currency          char(3) not null default 'USD',
  split_ratio       numeric(20,10),           -- for 'split': new shares per old share
  description       text,
  source            public.account_source not null default 'manual',
  external_id       text,                     -- broker/Plaid id for dedupe
  import_batch_id   uuid references public.import_batches(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (account_id, external_id)
);
create index portfolio_transactions_user_date_idx on public.portfolio_transactions (user_id, trade_date);
create index portfolio_transactions_symbol_idx on public.portfolio_transactions (user_id, symbol);
