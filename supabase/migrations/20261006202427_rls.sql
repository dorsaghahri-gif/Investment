-- ═══════════════════════════════════════════════════════════════════
-- 0005 ROW-LEVEL SECURITY
--   • Every table has RLS enabled.
--   • User-owned rows: only the owner (auth.uid()) can read/write.
--   • Shared market/reference data: authenticated users may read;
--     only the service role (jobs) may write (no write policies exist).
--   • Service role bypasses RLS by design; its key exists only server-side.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Simple owner tables (user_id column), full CRUD for the owner ─
do $$
declare t text;
begin
  foreach t in array array[
    'investment_profiles',
    'accounts',
    'import_batches',
    'watchlists',
    'watchlist_members',
    'journal_entries',
    'screeners',
    'screener_runs',
    'alerts',
    'scenario_runs',
    'ai_conversations',
    'ai_messages',
    'scoring_models'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))$p$, t || '_owner_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))$p$, t || '_owner_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$p$, t || '_owner_update', t);
    execute format($p$create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))$p$, t || '_owner_delete', t);
  end loop;
end $$;

-- ── 2. Owner-read-only tables (written by jobs with the service role) ─
do $$
declare t text;
begin
  foreach t in array array[
    'investment_profile_history',
    'portfolio_daily_snapshots',
    'portfolio_metrics',
    'investment_scores',
    'recommendations',
    'recommendation_history',
    'daily_briefs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))$p$, t || '_owner_select', t);
  end loop;
end $$;

-- alert events: owner can read and acknowledge
alter table public.alert_events enable row level security;
create policy alert_events_owner_select on public.alert_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy alert_events_owner_update on public.alert_events for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- change events: own rows + market-wide rows (user_id is null)
alter table public.change_events enable row level security;
create policy change_events_select on public.change_events for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));

-- ── 3. users ────────────────────────────────────────────────────────
alter table public.users enable row level security;
create policy users_self_select on public.users for select to authenticated using (id = (select auth.uid()));
create policy users_self_update on public.users for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ── 4. Holdings & transactions: owner AND account must belong to owner ─
alter table public.portfolio_holdings enable row level security;
alter table public.portfolio_transactions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['portfolio_holdings', 'portfolio_transactions'] loop
    execute format($p$create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))$p$, t || '_owner_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check (
        user_id = (select auth.uid())
        and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))$p$, t || '_owner_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (
        user_id = (select auth.uid())
        and exists (select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())))$p$, t || '_owner_update', t);
    execute format($p$create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))$p$, t || '_owner_delete', t);
  end loop;
end $$;

-- ── 5. Child tables secured through their parent ────────────────────
alter table public.investment_score_components enable row level security;
create policy isc_owner_select on public.investment_score_components for select to authenticated
  using (exists (select 1 from public.investment_scores s where s.id = score_id and s.user_id = (select auth.uid())));

alter table public.screener_rules enable row level security;
create policy screener_rules_owner_all on public.screener_rules for all to authenticated
  using (exists (select 1 from public.screeners s where s.id = screener_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.screeners s where s.id = screener_id and s.user_id = (select auth.uid())));

alter table public.screener_results enable row level security;
create policy screener_results_owner_select on public.screener_results for select to authenticated
  using (exists (select 1 from public.screener_runs r where r.id = run_id and r.user_id = (select auth.uid())));

alter table public.scenario_results enable row level security;
create policy scenario_results_owner_select on public.scenario_results for select to authenticated
  using (exists (select 1 from public.scenario_runs r where r.id = run_id and r.user_id = (select auth.uid())));
create policy scenario_results_owner_insert on public.scenario_results for insert to authenticated
  with check (exists (select 1 from public.scenario_runs r where r.id = run_id and r.user_id = (select auth.uid())));

-- ── 6. Brokerage connections: owner may see metadata, never the token ─
alter table public.brokerage_connections enable row level security;
create policy brokerage_connections_owner_select on public.brokerage_connections for select to authenticated
  using (user_id = (select auth.uid()));
create policy brokerage_connections_owner_delete on public.brokerage_connections for delete to authenticated
  using (user_id = (select auth.uid()));
-- Column-level: the encrypted token is not readable by client roles at all.
revoke select on public.brokerage_connections from authenticated, anon;
grant select (id, user_id, provider, institution_name, status, last_synced_at, last_error, created_at, updated_at)
  on public.brokerage_connections to authenticated;

-- ── 7. Shared reference / market data: read-only for authenticated ──
do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'company_peers', 'company_executives',
    'security_quotes', 'security_prices',
    'financial_statements', 'financial_metrics', 'valuation_snapshots',
    'analyst_estimates', 'price_targets', 'analyst_ratings',
    'company_events', 'news_articles', 'news_article_symbols',
    'insider_transactions', 'institutional_ownership',
    'dataset_freshness_sla'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (true)$p$, t || '_read', t);
  end loop;
end $$;

-- ── 8. Operations tables ────────────────────────────────────────────
-- Single-user deployment: the authenticated owner may read job/provider logs
-- for the Data Health page. Writes are service-role only.
alter table public.job_runs enable row level security;
create policy job_runs_read on public.job_runs for select to authenticated using (true);

alter table public.provider_requests enable row level security;
create policy provider_requests_read on public.provider_requests for select to authenticated using (true);

alter table public.rate_limit_buckets enable row level security;  -- no policies: function-only access

-- anon gets nothing anywhere
revoke all on all tables in schema public from anon;
