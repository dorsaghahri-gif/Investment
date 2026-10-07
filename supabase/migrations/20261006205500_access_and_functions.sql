-- ═══════════════════════════════════════════════════════════════════
-- Functions containing DELETE/DROP (the Supabase connector asks for explicit
-- approval before applying these). Applied manually via the SQL editor on the
-- live project; mark it applied with:
--   supabase migration repair --status applied 20261006205500
-- ═══════════════════════════════════════════════════════════════════

-- connector diagnostics cleanup (no-ops on fresh databases)
drop function if exists public._p3();
drop function if exists public._p4();
drop function if exists public._p5();

-- job logs become owner-only
drop policy if exists job_runs_read on public.job_runs;
drop policy if exists provider_requests_read on public.provider_requests;

-- Replace all holdings of one account (and optionally its cash) in a single
-- transaction, so a failure can never leave an account half-updated.
create or replace function public.replace_account_holdings(
  p_account_id uuid,
  p_holdings jsonb,          -- [{symbol, company_id, quantity, cost_basis_total, acquired_on, currency, source}]
  p_cash numeric default null
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.accounts where id = p_account_id and user_id = v_user) then
    raise exception 'account not found';
  end if;

  delete from public.portfolio_holdings where account_id = p_account_id;

  insert into public.portfolio_holdings
    (user_id, account_id, company_id, symbol, quantity, cost_basis_total, acquired_on, currency, source, as_of)
  select v_user, p_account_id,
         nullif(h->>'company_id', '')::uuid,
         upper(h->>'symbol'),
         (h->>'quantity')::numeric,
         nullif(h->>'cost_basis_total', '')::numeric,
         nullif(h->>'acquired_on', '')::date,
         coalesce(nullif(h->>'currency', ''), 'USD'),
         coalesce(nullif(h->>'source', ''), 'manual')::public.account_source,
         now()
  from jsonb_array_elements(p_holdings) as h;
  get diagnostics v_count = row_count;

  if p_cash is not null then
    update public.accounts set cash_balance = p_cash, cash_balance_as_of = now() where id = p_account_id;
  end if;
  return v_count;
end $$;

revoke all on function public.replace_account_holdings(uuid, jsonb, numeric) from public, anon;
grant execute on function public.replace_account_holdings(uuid, jsonb, numeric) to authenticated;

-- rate_limit_hit must also refuse revoked users
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_window timestamptz;
  v_hits integer;
begin
  if v_uid is null or not public.has_access() then
    raise exception 'not authorized';
  end if;
  if p_window_seconds <= 0 or p_max <= 0 then
    raise exception 'invalid rate limit parameters';
  end if;
  v_key := v_uid::text || ':' || p_key;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_buckets as b (bucket_key, window_start, hits)
  values (v_key, v_window, 1)
  on conflict (bucket_key, window_start) do update set hits = b.hits + 1
  returning hits into v_hits;
  delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
  return v_hits <= p_max;
end $$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon;
grant execute on function public.rate_limit_hit(text, integer, integer) to authenticated;

-- Owners cannot demote/revoke the last remaining owner (lock-out protection).
create or replace function public.protect_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and (new.role <> 'owner' or new.revoked_at is not null)) then
    if (select count(*) from public.access_list where role = 'owner' and revoked_at is null and lower(email::text) <> lower(old.email::text)) = 0 then
      raise exception 'Cannot remove the last owner';
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists access_list_protect_last_owner on public.access_list;
create trigger access_list_protect_last_owner before update or delete on public.access_list
  for each row execute function public.protect_last_owner();

