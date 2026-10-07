-- Last successful write per dataset (security_invoker: respects caller's RLS).
create or replace view public.data_freshness
with (security_invoker = true) as
with latest as (
  select 'quotes'::text as dataset, max(fetched_at) as last_fetched_at, max(quote_time)::text as latest_as_of from public.security_quotes
  union all select 'daily_prices', max(fetched_at), max(price_date)::text from public.security_prices
  union all select 'profiles', max(fetched_at), null from public.companies
  union all select 'fundamentals', max(fetched_at), max(period_end)::text from public.financial_statements
  union all select 'estimates', max(fetched_at), max(snapshot_date)::text from public.analyst_estimates
  union all select 'events', max(fetched_at), max(event_date)::text from public.company_events
  union all select 'news', max(fetched_at), max(published_at)::text from public.news_articles
  union all select 'insider', max(fetched_at), max(transaction_date)::text from public.insider_transactions
  union all select 'portfolio', max(computed_at), max(snapshot_date)::text from public.portfolio_daily_snapshots
)
select
  s.dataset,
  s.label,
  s.category,
  l.last_fetched_at,
  l.latest_as_of,
  s.max_age_hours,
  s.critical_age_hours,
  case
    when l.last_fetched_at is null then 'no_data'
    when now() - l.last_fetched_at <= make_interval(hours => s.max_age_hours) then 'healthy'
    when now() - l.last_fetched_at <= make_interval(hours => s.critical_age_hours) then 'stale'
    else 'critical'
  end as status
from public.dataset_freshness_sla s
left join latest l using (dataset);

