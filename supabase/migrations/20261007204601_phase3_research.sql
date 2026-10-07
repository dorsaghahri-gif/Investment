-- Phase 3: research universe, ingestion bookkeeping, provider capability cache,
-- and set-based helpers for the scoring job (service role only).

alter table public.companies
  add column if not exists in_universe boolean not null default false,
  add column if not exists universe_tags text[] not null default '{}',
  add column if not exists fundamentals_fetched_at timestamptz,
  add column if not exists estimates_fetched_at timestamptz;

create index if not exists companies_in_universe_idx on public.companies (in_universe) where in_universe;

-- Remembers endpoints a data plan doesn't include, so jobs don't call them every run.
create table if not exists public.provider_capabilities (
  provider    public.provider_id not null,
  capability  text not null,
  available   boolean not null,
  detail      text,
  checked_at  timestamptz not null default now(),
  primary key (provider, capability)
);
alter table public.provider_capabilities enable row level security;
-- owner-visible (Data Health); written by the service role only
create policy provider_capabilities_read on public.provider_capabilities
  for select to authenticated using (public.current_access_role() = 'owner');
create policy provider_capabilities_access on public.provider_capabilities
  as restrictive for all to authenticated using (public.has_access()) with check (public.has_access());

-- Latest stored price date per company.
create or replace function public.latest_price_dates(p_ids uuid[])
returns table (company_id uuid, last_date date)
language sql stable
set search_path = ''
as $$
  select p.company_id, max(p.price_date)
  from public.security_prices p
  where p.company_id = any(p_ids)
  group by p.company_id
$$;

-- Price points the momentum metrics need, as of a date.
create or replace function public.research_momentum_inputs(p_as_of date)
returns table (
  company_id uuid, last_date date, last_close numeric,
  d_1m date, close_1m numeric, d_6m date, close_6m numeric, d_12m date, close_12m numeric,
  avg_200 numeric, n_200 integer
)
language sql stable
set search_path = ''
as $$
  with last as (
    select p.company_id, max(p.price_date) as last_date
    from public.security_prices p
    where p.price_date <= p_as_of and p.price_date > p_as_of - 30
    group by p.company_id
  )
  select
    l.company_id,
    l.last_date,
    (select close from public.security_prices x where x.company_id = l.company_id and x.price_date = l.last_date),
    m1.price_date, m1.close,
    m6.price_date, m6.close,
    m12.price_date, m12.close,
    w.avg_close, w.n
  from last l
  left join lateral (
    select price_date, close from public.security_prices x
    where x.company_id = l.company_id and x.price_date <= (l.last_date - interval '1 month')::date
    order by price_date desc limit 1
  ) m1 on true
  left join lateral (
    select price_date, close from public.security_prices x
    where x.company_id = l.company_id and x.price_date <= (l.last_date - interval '6 months')::date
    order by price_date desc limit 1
  ) m6 on true
  left join lateral (
    select price_date, close from public.security_prices x
    where x.company_id = l.company_id and x.price_date <= (l.last_date - interval '12 months')::date
    order by price_date desc limit 1
  ) m12 on true
  left join lateral (
    select avg(close) as avg_close, count(*)::int as n from (
      select close from public.security_prices x
      where x.company_id = l.company_id and x.price_date <= l.last_date
      order by price_date desc limit 200
    ) t
  ) w on true
$$;

-- Close on (or up to 10 days before) each annual period end, for own-history valuation.
create or replace function public.research_fy_end_closes()
returns table (company_id uuid, period_end date, close numeric)
language sql stable
set search_path = ''
as $$
  select fs.company_id, fs.period_end,
    (select x.close from public.security_prices x
     where x.company_id = fs.company_id and x.price_date <= fs.period_end and x.price_date > fs.period_end - 10
     order by x.price_date desc limit 1)
  from (select distinct company_id, period_end from public.financial_statements where period = 'annual') fs
$$;

revoke all on function public.latest_price_dates(uuid[]) from public, anon, authenticated;
revoke all on function public.research_momentum_inputs(date) from public, anon, authenticated;
revoke all on function public.research_fy_end_closes() from public, anon, authenticated;
grant execute on function public.latest_price_dates(uuid[]) to service_role;
grant execute on function public.research_momentum_inputs(date) to service_role;
grant execute on function public.research_fy_end_closes() to service_role;

-- Covering indexes for the scoring job's reads.
create index if not exists financial_statements_company_period_idx on public.financial_statements (company_id, period, period_end desc);
create index if not exists investment_scores_user_date_idx on public.investment_scores (user_id, snapshot_date desc);
create index if not exists recommendations_user_date_idx on public.recommendations (user_id, snapshot_date desc);

-- Score components are kept for the latest snapshot only (scores themselves keep full history).
create or replace function public.prune_score_components(p_user uuid, p_keep_from date)
returns integer
language sql
set search_path = ''
as $$
  with del as (
    delete from public.investment_score_components c
    using public.investment_scores s
    where c.score_id = s.id and s.user_id = p_user and s.snapshot_date < p_keep_from
    returning 1
  )
  select count(*)::int from del
$$;
revoke all on function public.prune_score_components(uuid, date) from public, anon, authenticated;
grant execute on function public.prune_score_components(uuid, date) to service_role;
