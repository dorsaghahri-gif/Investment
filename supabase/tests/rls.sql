-- RLS verification. Run against a database with migrations applied:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
-- Each check raises an exception on failure.
begin;

-- 0. every public table has RLS enabled
do $$
declare missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if missing is not null then raise exception 'RLS disabled on: %', missing; end if;
end $$;

-- fixtures (as superuser)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
-- public.users rows come from the trigger in real Supabase; stub inserts them here
insert into public.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com')
  on conflict do nothing;
insert into public.accounts (id, user_id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A brokerage'),
  ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B brokerage');
insert into public.portfolio_holdings (user_id, account_id, symbol, quantity) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'NVDA', 10),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'MSFT', 5);
insert into public.companies (symbol, name, source_provider) values ('NVDA', 'NVIDIA', 'mock');
insert into public.access_list (email, role) values ('a@example.com', 'member'), ('b@example.com', 'member'), ('o@example.com', 'owner')
  on conflict (email) do nothing;
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'o@example.com');
insert into public.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'o@example.com') on conflict do nothing;
insert into public.job_runs (job_name, status) values ('refresh-prices', 'success');

create or replace function pg_temp.act_as(p_id text, p_email text) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', p_id, true),
         set_config('request.jwt.claims', json_build_object('sub', p_id, 'email', p_email)::text, true);
$f$;

-- act as user A
set local role authenticated;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111', 'a@example.com');

do $$
begin
  -- 1. A sees only own holdings
  if (select count(*) from public.portfolio_holdings) <> 1 then
    raise exception 'user A should see exactly 1 holding';
  end if;
  if exists (select 1 from public.portfolio_holdings where symbol = 'MSFT') then
    raise exception 'user A can see user B holding';
  end if;
  -- 2. A sees only own accounts
  if (select count(*) from public.accounts) <> 1 then raise exception 'account leak'; end if;
  -- 3. shared reference data readable
  if (select count(*) from public.companies) < 1 then raise exception 'companies not readable'; end if;
end $$;

-- 4. A cannot insert a holding into B's account
do $$
begin
  begin
    insert into public.portfolio_holdings (user_id, account_id, symbol, quantity)
    values ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001', 'AAPL', 1);
    raise exception 'FAIL: inserted into another user''s account';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 5. A cannot impersonate B
do $$
begin
  begin
    insert into public.accounts (user_id, name) values ('22222222-2222-2222-2222-222222222222', 'evil');
    raise exception 'FAIL: created account for another user';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 6. A cannot write shared market data
do $$
begin
  begin
    insert into public.companies (symbol, name) values ('FAKE', 'Fake Co');
    raise exception 'FAIL: authenticated user wrote reference data';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 7. Updating B's holding affects zero rows
do $$
declare n int;
begin
  update public.portfolio_holdings set quantity = 999 where symbol = 'MSFT';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: updated another user''s holding'; end if;
end $$;

-- 8. rate limiter: 3 allowed, 4th denied
do $$
begin
  if not public.rate_limit_hit('test', 60, 3) then raise exception 'hit 1 denied'; end if;
  if not public.rate_limit_hit('test', 60, 3) then raise exception 'hit 2 denied'; end if;
  if not public.rate_limit_hit('test', 60, 3) then raise exception 'hit 3 denied'; end if;
  if public.rate_limit_hit('test', 60, 3) then raise exception 'hit 4 allowed'; end if;
end $$;

-- 9. Investment profile versioning + history
insert into public.investment_profiles (user_id, horizon_years) values ('11111111-1111-1111-1111-111111111111', 10);
update public.investment_profiles set horizon_years = 15 where user_id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select version from public.investment_profiles) <> 2 then raise exception 'profile version not bumped'; end if;
  if (select count(*) from public.investment_profile_history) <> 2 then raise exception 'profile history not written'; end if;
end $$;


-- 11. atomic replace: own account works, other user's account is refused
do $$
declare n int;
begin
  n := public.replace_account_holdings('aaaaaaaa-0000-0000-0000-000000000001',
        '[{"symbol":"aapl","quantity":"3","cost_basis_total":"450"},{"symbol":"MSFT","quantity":"1"}]'::jsonb, 1234.5);
  if n <> 2 then raise exception 'replace returned %', n; end if;
  if (select count(*) from public.portfolio_holdings) <> 2 then raise exception 'replace count wrong'; end if;
  if (select cash_balance from public.accounts where id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1234.5 then raise exception 'cash not set'; end if;
  begin
    perform public.replace_account_holdings('bbbbbbbb-0000-0000-0000-000000000001', '[]'::jsonb, null);
    raise exception 'FAIL: replaced another user''s holdings';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;


-- 12. ops logs are owner-only
do $$ begin
  if (select count(*) from public.job_runs) <> 0 then raise exception 'FAIL: member can read job_runs'; end if;
end $$;
select pg_temp.act_as('33333333-3333-3333-3333-333333333333', 'o@example.com');
do $$ begin
  if (select count(*) from public.job_runs) <> 1 then raise exception 'FAIL: owner cannot read job_runs'; end if;
  if not public.is_owner() then raise exception 'FAIL: owner role'; end if;
end $$;

-- 13. sharing: B shares portfolio with A (read-only); A can read but not write
select pg_temp.act_as('22222222-2222-2222-2222-222222222222', 'b@example.com');
insert into public.portfolio_shares (owner_id, viewer_email) values ('22222222-2222-2222-2222-222222222222', 'a@example.com');
do $$ begin
  begin
    insert into public.portfolio_shares (owner_id, viewer_email) values ('22222222-2222-2222-2222-222222222222', 'stranger@example.com');
    raise exception 'FAIL: shared with non-invited email';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111', 'a@example.com');
do $$ declare n int; begin
  if not exists (select 1 from public.portfolio_holdings where user_id = '22222222-2222-2222-2222-222222222222') then raise exception 'FAIL: viewer cannot see shared holdings'; end if;
  update public.portfolio_holdings set quantity = 1 where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: viewer modified shared holding'; end if;
  if exists (select 1 from public.portfolio_transactions where user_id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'FAIL: transactions visible without include_transactions';
  end if;
end $$;

-- 14. revocation takes effect immediately (restrictive policy)
reset role;
update public.access_list set revoked_at = now() where email = 'a@example.com';
set local role authenticated;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111', 'a@example.com');
do $$ begin
  if exists (select 1 from public.portfolio_holdings) then raise exception 'FAIL: revoked user still sees holdings'; end if;
  if exists (select 1 from public.companies) then raise exception 'FAIL: revoked user still sees market data'; end if;
  begin
    perform public.rate_limit_hit('x', 60, 5);
    raise exception 'FAIL: revoked user passed rate limiter';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;

-- 15. signup hook
reset role;
do $$ begin
  if public.hook_before_user_created('{"user":{"email":"B@Example.com"}}'::jsonb) <> '{}'::jsonb then raise exception 'FAIL: invited email rejected'; end if;
  if public.hook_before_user_created('{"user":{"email":"stranger@example.com"}}'::jsonb) -> 'error' is null then raise exception 'FAIL: stranger allowed'; end if;
  if public.hook_before_user_created('{"user":{"email":"a@example.com"}}'::jsonb) -> 'error' is null then raise exception 'FAIL: revoked email allowed'; end if;
end $$;

-- 16. last owner cannot be removed
do $$ begin
  begin
    update public.access_list set revoked_at = now() where email = 'o@example.com';
    -- dorsa bootstrap owner still exists, so this is allowed; now try removing the final one
    update public.access_list set revoked_at = now() where email = 'dorsa.ghahri@gmail.com';
    raise exception 'FAIL: removed last owner';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
end $$;
set local role authenticated;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111', 'a@example.com');

-- 10. anon sees nothing
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.companies limit 1;
    raise exception 'FAIL: anon can read companies';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select 'RLS tests passed' as result;
rollback;
