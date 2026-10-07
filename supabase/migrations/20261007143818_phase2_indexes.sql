-- ═══════════════════════════════════════════════════════════════════
-- Phase 2: snapshot primary key (upsert target) + covering FK indexes
-- (Supabase performance advisor). Additive only.
-- ═══════════════════════════════════════════════════════════════════

-- Portfolio-level snapshots have account_id NULL; a generated key gives the
-- table a real primary key usable as an ON CONFLICT target.
alter table public.portfolio_daily_snapshots
  add column account_key uuid generated always as (coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;
alter table public.portfolio_daily_snapshots
  add constraint portfolio_daily_snapshots_pkey primary key (user_id, account_key, snapshot_date);

create index if not exists access_list_invited_by_idx on public.access_list (invited_by);
create index if not exists accounts_brokerage_connection_idx on public.accounts (brokerage_connection_id);
create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id);
create index if not exists ai_messages_user_idx on public.ai_messages (user_id);
create index if not exists alert_events_alert_idx on public.alert_events (alert_id);
create index if not exists alert_events_user_idx on public.alert_events (user_id);
create index if not exists alerts_company_idx on public.alerts (company_id);
create index if not exists alerts_user_idx on public.alerts (user_id);
create index if not exists brokerage_connections_user_idx on public.brokerage_connections (user_id);
create index if not exists change_events_company_idx on public.change_events (company_id);
create index if not exists company_peers_peer_idx on public.company_peers (peer_company_id);
create index if not exists import_batches_account_idx on public.import_batches (account_id);
create index if not exists import_batches_user_idx on public.import_batches (user_id);
create index if not exists investment_profile_history_user_idx on public.investment_profile_history (user_id);
create index if not exists investment_scores_model_idx on public.investment_scores (scoring_model_id);
create index if not exists job_runs_triggered_by_idx on public.job_runs (triggered_by);
create index if not exists journal_entries_company_idx on public.journal_entries (company_id);
create index if not exists journal_entries_txn_idx on public.journal_entries (linked_transaction_id);
create index if not exists journal_entries_user_idx on public.journal_entries (user_id);
create index if not exists portfolio_daily_snapshots_account_idx on public.portfolio_daily_snapshots (account_id);
create index if not exists portfolio_holdings_company_idx on public.portfolio_holdings (company_id);
create index if not exists portfolio_holdings_batch_idx on public.portfolio_holdings (import_batch_id);
create index if not exists portfolio_transactions_company_idx on public.portfolio_transactions (company_id);
create index if not exists portfolio_transactions_batch_idx on public.portfolio_transactions (import_batch_id);
create index if not exists provider_requests_job_idx on public.provider_requests (job_run_id);
create index if not exists recommendation_history_company_idx on public.recommendation_history (company_id);
create index if not exists recommendation_history_from_idx on public.recommendation_history (from_recommendation_id);
create index if not exists recommendation_history_to_idx on public.recommendation_history (to_recommendation_id);
create index if not exists recommendation_history_user_idx on public.recommendation_history (user_id);
create index if not exists recommendations_company_idx on public.recommendations (company_id);
create index if not exists recommendations_score_idx on public.recommendations (score_id);
create index if not exists scenario_runs_user_idx on public.scenario_runs (user_id);
create index if not exists screener_results_company_idx on public.screener_results (company_id);
create index if not exists screener_rules_screener_idx on public.screener_rules (screener_id);
create index if not exists screener_runs_screener_idx on public.screener_runs (screener_id);
create index if not exists screener_runs_user_idx on public.screener_runs (user_id);
create index if not exists watchlist_members_company_idx on public.watchlist_members (company_id);
create index if not exists watchlist_members_user_idx on public.watchlist_members (user_id);
create index if not exists portfolio_shares_viewer_idx on public.portfolio_shares (viewer_email);
