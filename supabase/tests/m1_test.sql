-- ════════════════════════════════════════════════════════════════════════════════════════
-- M1 schema tests (plain SQL, no pgTAP). ONE transaction, rolled back at the end: safe on a
-- scratch or branch database. Never run against production.
--   local:     supabase/tests/local/run.sh
--   branch:    psql "$BRANCH_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/m1_test.sql
-- A failed assertion raises and aborts with the test name. Dates are relative to today, so the
-- arrears checks stay valid whatever day the suite runs.
-- ════════════════════════════════════════════════════════════════════════════════════════
begin;

create schema tests;
grant usage on schema tests to anon, authenticated, service_role;
create table tests.users (name text primary key, claims jsonb not null, role text not null);
create table tests.vars (k text primary key, v text);
grant select on tests.users to anon, authenticated, service_role;
grant select, insert, update on tests.vars to anon, authenticated, service_role;

create function tests.login(p_name text) returns void language plpgsql as $$
declare u tests.users;
begin
  reset role;
  select * into u from tests.users where name = p_name;
  if u.name is null then raise exception 'unknown test user %', p_name; end if;
  perform set_config('request.jwt.claims', u.claims::text, true);
  if u.role <> 'postgres' then execute format('set local role %I', u.role); end if;
end $$;

create function tests.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', what; end if;
  raise notice 'ok  %', what;
end $$;

-- Passes when `sql` raises and the SQLSTATE, HINT or message matches `expected`.
create function tests.throws(sql text, expected text, what text) returns void language plpgsql as $$
declare st text; h text; m text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, h = pg_exception_hint, m = message_text;
    if st = expected or h = expected or m ilike '%' || expected || '%' then
      raise notice 'ok  % (raised %/%)', what, st, coalesce(nullif(h, ''), '-');
      return;
    end if;
    raise exception 'FAIL: % raised % / % / % instead of %', what, st, h, m, expected;
  end;
  raise exception 'FAIL: % did not raise (expected %)', what, expected;
end $$;

create function tests.set(k text, v anyelement) returns void language sql as $$
  insert into tests.vars values (k, v::text) on conflict (k) do update set v = excluded.v $$;
create function tests.get(k text) returns text language sql stable as $$ select v from tests.vars where vars.k = get.k $$;
create function tests.id(k text) returns uuid language sql stable as $$ select tests.get(k)::uuid $$;
-- first day of the month `n` months from the current month (n <= 0 = past)
create function tests.m(n integer) returns date language sql stable as $$
  select (date_trunc('month', current_date) + make_interval(months => n))::date $$;
create function tests.month(member_key text, n integer, amount integer) returns jsonb language sql stable as $$
  select jsonb_build_object('kind', 'months', 'member_id', tests.id(member_key),
    'year', extract(year from tests.m(n))::int, 'month', extract(month from tests.m(n))::int, 'amount', amount) $$;
create function tests.pay(p_key text, p_amount integer, p_alloc jsonb, p_txn text default null) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  r := public.record_payment(gen_random_uuid(), 'دافع تجريبي', 'bankily', p_amount, current_date, p_alloc, p_txn);
  perform tests.set(p_key, r ->> 'id');
  return r;
end $$;
grant execute on all functions in schema tests to anon, authenticated, service_role;

/* ───────────── fixtures (as the server) ───────────── */

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a2', 'treasurer@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a3', 'deputy@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a4', 'committee@test.invalid'),
  ('00000000-0000-0000-0000-0000000000a5', 'former@test.invalid');

insert into tests.users values
  ('admin',     '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', 'authenticated'),
  ('treasurer', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', 'authenticated'),
  ('deputy',    '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}', 'authenticated'),
  ('committee', '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}', 'authenticated'),
  ('former',    '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}', 'authenticated'),
  ('public',    '{"role":"anon"}', 'anon'),
  ('server',    '{}', 'postgres');

select tests.login('server');
insert into public.groups (code, name) values ('A', 'A'), ('B', 'B') on conflict (code) do nothing;
insert into public.group_prices (group_id, year, monthly_amount)
select g.id, y, case g.code when 'A' then 1000 else 500 end
from public.groups g, generate_series(extract(year from current_date)::int - 1, extract(year from current_date)::int) y
on conflict (group_id, year) do nothing;
update public.settings set opening_balance = 0, grace_days = 10, show_amount_owed = false;

-- E: A, active for 4 months (3 back + this one).  F: B, exempt from last month.
-- G: A, deceased from 2 months back.  T: the treasurer's own membership.  K: spare A member.
select tests.set('E', public.add_member(1001, 'عضو هـ', 'A', tests.m(-3), '+22211111111'));
select tests.set('F', public.add_member(1002, 'عضو و',  'B', tests.m(-3), '+22222222222'));
select tests.set('G', public.add_member(1003, 'عضو ز',  'A', tests.m(-3), null));
select tests.set('T', public.add_member(1004, 'عضو ط',  'A', tests.m(-3), '+22244444444'));
select tests.set('K', public.add_member(1005, 'عضو ك',  'A', tests.m(-3), '+22255555555'));
select public.change_member_status(tests.id('F'), tests.m(-1), 'exempt', 'studying abroad');
select public.change_member_status(tests.id('G'), tests.m(-2), 'deceased', 'رحمه الله');

select public.set_committee_member('00000000-0000-0000-0000-0000000000a1', 'المدير', 'admin');
select public.set_committee_member('00000000-0000-0000-0000-0000000000a2', 'الأمين', 'treasurer', tests.id('T'));
select public.set_committee_member('00000000-0000-0000-0000-0000000000a3', 'النائب', 'deputy');
select public.set_committee_member('00000000-0000-0000-0000-0000000000a4', 'مشرف', 'committee');
select public.set_committee_member('00000000-0000-0000-0000-0000000000a5', 'سابق', 'committee', null, false);

insert into storage.objects (bucket_id, name) values ('proofs', 'payments/test.webp');

/* ───────────── public (anon) ───────────── */

select tests.login('public');
select tests.throws('select * from public.members', '42501', 'anon cannot read members (phones)');
select tests.throws('select * from public.payments', '42501', 'anon cannot read payments (proof paths)');
select tests.throws('select * from public.payment_allocations', '42501', 'anon cannot read allocations');
select tests.throws('select * from public.committee', '42501', 'anon cannot read committee');
select tests.throws('select * from public.audit_log', '42501', 'anon cannot read audit log');
select tests.throws('select * from public.arrears', '42501', 'anon cannot read the arrears view (phones)');
select tests.throws($$select public.record_payment(gen_random_uuid(), 'x', 'cash', 1000, current_date, '[]')$$, '42501',
  'anon cannot call record_payment');
select tests.throws($$select app_private.month_grid()$$, '42501', 'anon cannot call internal helpers');
select tests.ok((select count(*) from storage.objects where bucket_id = 'proofs') = 0, 'anon sees no proof images');
select tests.ok((select count(*) from public.member_status where number between 1001 and 1005) = 5, 'anon reads member_status');
select tests.ok((select ok from public.keepalive), 'anon reads the keepalive view');
select tests.ok((select count(*) from public.fund_summary) = 1, 'anon reads fund_summary');
select tests.ok((select count(*) from public.monthly_collection) > 0, 'anon reads monthly_collection');
select tests.ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name in ('member_status','member_months','fund_summary','monthly_collection',
        'expense_totals','recent_expenses','campaign_progress','activity_feed')
    and column_name ~ '(phone|proof|txn|payer|receipt)'), 'public views expose no phone/proof/txn/payer columns');
select tests.ok((select bool_and(amount_owed is null) from public.member_status), 'amount owed hidden by default');

/* ───────────── committee reads, cannot write tables ───────────── */

select tests.login('committee');
select tests.ok((select phone from public.members where number = 1001) = '+22211111111', 'committee reads phones');
select tests.ok((select count(*) from storage.objects where bucket_id = 'proofs') = 1, 'committee reads proofs');
select tests.throws($$update public.members set phone = '+22299999999' where number = 1001$$, '42501', 'committee cannot update tables directly');
select tests.throws($$insert into public.payments (payer_name, method, amount, paid_on) values ('x', 'cash', 1, current_date)$$,
  '42501', 'committee cannot insert payments directly');
select tests.throws($$select public.add_member(2000, 'x', 'A', current_date)$$, 'not_admin', 'only admin adds members');

select tests.login('former');
select tests.ok((select count(*) from public.members) = 0, 'inactive committee account sees no rows');
select tests.throws($$select tests.pay('x', 1000, jsonb_build_array(tests.month('E', -3, 1000)))$$, 'not_committee',
  'inactive committee account cannot record');

/* ───────────── record → confirm, first wins ───────────── */

select tests.login('committee');
select tests.ok((select tests.pay('p1', 1000, jsonb_build_array(tests.month('E', -3, 1000)), 'TXN-1') ->> 'status') = 'pending',
  'committee payment starts pending');
select tests.throws($$select public.confirm_payment(tests.id('p1'))$$, 'not_confirmer', 'plain committee cannot confirm');
select tests.throws($$select tests.pay('dup', 1000, jsonb_build_array(tests.month('K', -3, 1000)), 'TXN-1')$$, 'duplicate_txn_ref',
  'same wallet transaction number cannot be recorded twice');
select tests.throws($$select tests.pay('bad', 2000, jsonb_build_array(tests.month('K', -3, 1000)))$$, 'allocations_mismatch',
  'allocations must sum to the amount');
select tests.throws($$select tests.pay('bad', 500, jsonb_build_array(tests.month('K', -3, 500)))$$, 'wrong_month_amount',
  'a month costs the group price');
select tests.throws($$select tests.pay('bad', 1000, jsonb_build_array(tests.month('G', -1, 1000)))$$, 'month_not_owed',
  'cannot pay a month when the member is deceased');
select tests.throws($$select public.record_payment(gen_random_uuid(), 'x', 'paper', 1000, current_date, jsonb_build_array(tests.month('K', -3, 1000)))$$,
  'paper_admin_only', 'only admin records paper-sheet payments');

select tests.login('treasurer');
select tests.ok((public.confirm_payment(tests.id('p1')) ->> 'already')::boolean = false, 'treasurer confirms');
select tests.login('deputy');
select tests.ok((select r ->> 'already' = 'true' and r ->> 'decided_by_name' = 'الأمين'
                 from (select public.confirm_payment(tests.id('p1')) r) x),
  'second confirm is a no-op naming who confirmed first');
select tests.ok((select count(*) from public.payment_months where payment_id = tests.id('p1')) = 1, 'months written exactly once');
select tests.throws($$select public.reject_payment(tests.id('p1'), 'late')$$, 'not_pending', 'a confirmed payment cannot be rejected');

-- the same month cannot be paid twice
select tests.login('committee');
select tests.throws($$select tests.pay('p2', 1000, jsonb_build_array(tests.month('E', -3, 1000)))$$, 'month_already_paid',
  'recording an already-paid month is refused');
-- two pending payments for one month: the first confirmation wins, the second is refused
select tests.pay('k1', 1000, jsonb_build_array(tests.month('K', -3, 1000)));
select tests.pay('k2', 1000, jsonb_build_array(tests.month('K', -3, 1000)));
select tests.login('treasurer');
select public.confirm_payment(tests.id('k1'));
select tests.throws($$select public.confirm_payment(tests.id('k2'))$$, 'month_already_paid', 'second payment for the same month cannot be confirmed');
select tests.ok((select status from public.payments where id = tests.id('k2')) = 'pending', 'refused payment stays pending');
select public.reject_payment(tests.id('k2'), 'duplicate of another transfer');
select tests.ok((select status from public.payments where id = tests.id('k2')) = 'rejected', 'duplicate rejected with a reason');
select tests.throws($$select public.reject_payment(tests.id('p2'), '')$$, 'reason_required', 'reject needs a reason');

-- treasurer recording counts as confirmed at once
select tests.ok((select tests.pay('p3', 1000, jsonb_build_array(tests.month('E', -2, 1000))) ->> 'status') = 'confirmed',
  'treasurer-recorded payment is confirmed at once');

/* ───────────── treasurer cannot confirm own membership ───────────── */

select tests.ok((select tests.pay('own', 1000, jsonb_build_array(tests.month('T', -3, 1000))) ->> 'status') = 'pending',
  'treasurer paying own membership stays pending');
select tests.throws($$select public.confirm_payment(tests.id('own'))$$, 'own_membership', 'treasurer cannot confirm own membership');
select tests.login('deputy');
select tests.ok((public.confirm_payment(tests.id('own')) ->> 'status') = 'confirmed', 'deputy confirms the treasurer''s payment');

/* ───────────── cancel frees the month ───────────── */

select tests.throws($$select public.cancel_payment(tests.id('p3'), ' ')$$, 'reason_required', 'cancel needs a reason');
select public.cancel_payment(tests.id('p3'), 'wrong member');
select tests.ok((select released_at is not null from public.payment_months where payment_id = tests.id('p3')), 'cancelled payment releases its month');
select tests.login('committee');
select tests.ok((select tests.pay('p4', 1000, jsonb_build_array(tests.month('E', -2, 1000))) ->> 'status') = 'pending',
  'a released month can be paid again');
select tests.login('deputy');
select public.confirm_payment(tests.id('p4'));

/* ───────────── append-only ───────────── */

select tests.login('server');
select tests.throws($$update public.payments set amount = 1 where id = tests.id('p1')$$, 'append_only', 'amount cannot be edited');
select tests.throws($$delete from public.payments where id = tests.id('p1')$$, 'append_only', 'payments are never deleted');
select tests.throws($$delete from public.members where number = 1001$$, 'append_only', 'members are never deleted');
select tests.throws($$delete from public.audit_log$$, 'append_only', 'audit log rows are never deleted');
select tests.throws($$update public.audit_log set action = 'x'$$, 'append_only', 'audit log rows are never edited');
select tests.throws($$update public.payments set decided_at = now() - interval '1 day' where id = tests.id('p1')$$, 'stamp_once',
  'decision stamp is set once');
select tests.throws($$update public.payments set status = 'pending' where id = tests.id('p1')$$, 'bad_transition',
  'a confirmed payment cannot go back to pending');
select tests.throws($$insert into public.payment_months (payment_id, member_id, year, month, amount)
  values (tests.id('p1'), tests.id('E'), 2026, 12, 1000)$$, 'confirm_only', 'paid months are written only by confirm_payment');
select tests.throws($$insert into public.payment_allocations (payment_id, kind, member_id, amount)
  values (tests.id('p1'), 'credit', tests.id('E'), 100)$$, 'not_pending', 'no allocations added after the decision');
select tests.throws($$truncate public.audit_log$$, 'append_only', 'tables cannot be truncated');
-- deferred sum check on a hand-written payment
insert into public.payments (id, payer_name, method, amount, paid_on) values ('00000000-0000-0000-0000-00000000bad1', 'x', 'cash', 1500, current_date);
insert into public.payment_allocations (payment_id, kind, member_id, amount) values ('00000000-0000-0000-0000-00000000bad1', 'credit', tests.id('K'), 1000);
select tests.throws('set constraints all immediate', 'allocations_mismatch', 'allocations must sum even when written by hand');
select tests.ok((select count(*) > 0 from public.audit_log where action = 'confirm_payment'), 'confirmations are audited');
select tests.ok(not exists (select 1 from public.audit_log where 'phone' = any (changed) and action <> 'add_member'),
  'audit rows hold column names only');

/* ───────────── arrears (grace period + member statuses) ───────────── */

-- E: months -3,-2 paid (p1, p4); -1 owed; this month owed only after the grace period.
-- F: -3,-2 owed; exempt from -1.   G: -3 owed; deceased from -2.
-- K: -3 paid (k1); -2,-1 owed.     T: -3 paid (own); -2,-1 owed.
select tests.set('cur', (current_date >= tests.m(0) + 10)::int::text);
select tests.login('public');
select tests.ok((select months_behind from public.member_status where number = 1001) = 1 + tests.get('cur')::int,
  'arrears: paid months and grace period (E)');
select tests.ok((select months_behind from public.member_status where number = 1002) = 2, 'arrears: exempt months not owed (F)');
select tests.ok((select months_behind from public.member_status where number = 1003) = 1, 'arrears: deceased months not owed (G)');
select tests.ok((select status_label from public.member_status where number = 1001) = 'متأخر', 'late member labelled متأخر');
select tests.ok((select string_agg(state, ',' order by year, month) from public.member_months
   where member_id = tests.id('F') and make_date(year, month, 1) <= tests.m(0))
  = 'late,late,not_owed,not_owed', 'member_months shows exempt months as not_owed');
select tests.ok((select state from public.member_months where member_id = tests.id('E') and year = extract(year from tests.m(-3)) and month = extract(month from tests.m(-3))) = 'paid',
  'member_months shows paid months');

select tests.login('server');
update public.settings set grace_days = 0, show_amount_owed = true;
select tests.login('public');
select tests.ok((select months_behind from public.member_status where number = 1001) = 2, 'grace 0: this month is owed at once');
select tests.ok((select amount_owed from public.member_status where number = 1002) = 1000, 'amount owed shown once enabled (2 × 500)');
select tests.login('server');
update public.settings set grace_days = 10, show_amount_owed = false;

select tests.login('committee');
select tests.ok((select phone from public.arrears where number = 1001) = '+22211111111', 'committee arrears view carries the phone');
select tests.ok((select amount_owed from public.arrears where number = 1005) = 2000 + 1000 * tests.get('cur')::int, 'arrears amount (K)');
select tests.ok(not exists (select 1 from public.arrears where number = 1003 and amount_owed > 1000), 'deceased member owes only pre-death months');

/* ───────────── money totals ───────────── */

select tests.login('public');
select tests.set('bal', (select balance::text from public.fund_summary));
select tests.ok(tests.get('bal')::int = 3000 + 1000, 'balance = confirmed payments (p1, k1, own, p4) − 0');
select tests.login('committee');
select public.record_expense(gen_random_uuid(), current_date, 'sports', 300, 'كرة');
select public.log_reminder('individual', tests.id('K'));
select tests.login('public');
select tests.ok((select balance from public.fund_summary) = tests.get('bal')::int - 300, 'expense lowers the balance');
select tests.ok((select kind from public.activity_feed order by at desc limit 1) is not null, 'activity feed readable');
select tests.login('committee');
select tests.ok((select last_reminded_at is not null from public.arrears where number = 1005), 'reminders are logged');

/* ───────────── realtime ───────────── */

select tests.login('server');
select tests.ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'payments'),
  'payments are published to realtime');

rollback;
