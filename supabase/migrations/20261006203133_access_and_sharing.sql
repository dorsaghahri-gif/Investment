-- ═══════════════════════════════════════════════════════════════════
-- 0007 MULTI-USER ACCESS: invite-only access list, owner/member roles,
--      read-only portfolio sharing.
--
--   • access_list   — who may use the app (invite-only). Enforced by:
--       1. before-user-created auth hook (blocks signups not on the list)
--       2. a RESTRICTIVE RLS policy on every table (revocation takes effect
--          immediately, even for existing sessions)
--       3. the app's DAL (requireUser)
--   • roles         — 'owner' (invites/revokes, Data Health, job logs) and
--                     'member' (own private portfolio).
--   • portfolio_shares — an owner of a portfolio grants another user
--                     read-only access to their accounts/holdings/history.
-- ═══════════════════════════════════════════════════════════════════

create type public.access_role as enum ('owner', 'member');

create table public.access_list (
  email        extensions.citext primary key,
  role         public.access_role not null default 'member',
  display_name text,
  invited_by   uuid references public.users(id) on delete set null,
  invited_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  note         text
);

-- Bootstrap owner (the account that owns this deployment).
insert into public.access_list (email, role, display_name, note)
values ('dorsa.ghahri@gmail.com', 'owner', 'Dorsa', 'bootstrap owner')
on conflict (email) do nothing;

-- ── Helper functions (SECURITY DEFINER: read access_list without recursion) ─

create or replace function public.current_email() returns text
language sql stable set search_path = '' as $$
  select nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '')
$$;

create or replace function public.current_access_role() returns public.access_role
language sql stable security definer set search_path = '' as $$
  select a.role from public.access_list a
  where lower(a.email::text) = public.current_email() and a.revoked_at is null
$$;

create or replace function public.has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.access_list a
    where lower(a.email::text) = public.current_email() and a.revoked_at is null
  )
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_access_role() = 'owner', false)
$$;

revoke all on function public.current_access_role() from public, anon;
revoke all on function public.has_access() from public, anon;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.current_email() to authenticated;
grant execute on function public.current_access_role() to authenticated;
grant execute on function public.has_access() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- Is this email on the active access list? (definer: callers can't read others' rows)
create or replace function public.is_invited(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.access_list a where lower(a.email::text) = lower(p_email) and a.revoked_at is null)
$$;
revoke all on function public.is_invited(text) from public, anon;
grant execute on function public.is_invited(text) to authenticated;

-- ── Signup gate: before-user-created auth hook ──────────────────────
-- Enable in Dashboard → Authentication → Hooks → "Before User Created"
-- → Postgres function → public.hook_before_user_created
create or replace function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if v_email <> '' and exists (
    select 1 from public.access_list a where lower(a.email::text) = v_email and a.revoked_at is null
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This app is invite-only.'
  ));
end $$;

revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin';
  end if;
end $$;

-- ── access_list policies: owners manage; everyone may read their own row ─
alter table public.access_list enable row level security;
create policy access_list_self_select on public.access_list for select to authenticated
  using (lower(email::text) = public.current_email());
create policy access_list_owner_all on public.access_list for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ── Portfolio sharing (read-only) ───────────────────────────────────
create table public.portfolio_shares (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.users(id) on delete cascade,
  viewer_email          extensions.citext not null,
  include_transactions  boolean not null default false,
  created_at            timestamptz not null default now(),
  revoked_at            timestamptz,
  unique (owner_id, viewer_email)
);

alter table public.portfolio_shares enable row level security;
create policy portfolio_shares_owner_all on public.portfolio_shares for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    -- may only share with people who have access to the app
    and public.is_invited(viewer_email::text)
    and lower(viewer_email::text) <> public.current_email()
  );
create policy portfolio_shares_viewer_select on public.portfolio_shares for select to authenticated
  using (lower(viewer_email::text) = public.current_email() and revoked_at is null);

create or replace function public.can_view_portfolio(p_owner uuid, p_need_transactions boolean default false)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_owner = auth.uid()
      or exists (
        select 1 from public.portfolio_shares s
        where s.owner_id = p_owner
          and lower(s.viewer_email::text) = public.current_email()
          and s.revoked_at is null
          and (not p_need_transactions or s.include_transactions)
      )
$$;
revoke all on function public.can_view_portfolio(uuid, boolean) from public, anon;
grant execute on function public.can_view_portfolio(uuid, boolean) to authenticated;

-- Read-only access for viewers (permissive SELECT policies, OR-ed with owner policies).
create policy accounts_shared_select on public.accounts for select to authenticated
  using (public.can_view_portfolio(user_id));
create policy portfolio_holdings_shared_select on public.portfolio_holdings for select to authenticated
  using (public.can_view_portfolio(user_id));
create policy portfolio_transactions_shared_select on public.portfolio_transactions for select to authenticated
  using (public.can_view_portfolio(user_id, true));
create policy portfolio_daily_snapshots_shared_select on public.portfolio_daily_snapshots for select to authenticated
  using (public.can_view_portfolio(user_id));
create policy portfolio_metrics_shared_select on public.portfolio_metrics for select to authenticated
  using (public.can_view_portfolio(user_id));
-- Viewers can see the sharer's display name; owners can see all members (for the Access page).
create policy users_shared_select on public.users for select to authenticated
  using (public.can_view_portfolio(id) or public.is_owner());

-- ── Ops tables: owner-only read policies (the old read-all policies are dropped in
--    the following migration) ─
create policy job_runs_owner_read on public.job_runs for select to authenticated using (public.is_owner());
create policy provider_requests_owner_read on public.provider_requests for select to authenticated using (public.is_owner());

-- ── RESTRICTIVE gate on every table: no access without an active invite ─
do $$
declare t text;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (public.has_access()) with check (public.has_access())',
                   t || '_require_access', t);
  end loop;
end $$;

