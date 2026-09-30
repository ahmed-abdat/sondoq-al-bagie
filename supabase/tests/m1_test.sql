-- ════════════════════════════════════════════════════════════════════════════════════════
-- Schema tests for ALL migrations (m1 … m27; the name is historical). Plain SQL, no pgTAP. ONE transaction, rolled back at the end: safe on a
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

-- DETAIL (as jsonb) of the error `sql` raises; fails the suite when it does not raise.
create function tests.detail(sql text) returns jsonb language plpgsql as $$
declare d text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics d = pg_exception_detail;
    return nullif(d, '')::jsonb;
  end;
  raise exception 'FAIL: % did not raise', sql;
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
-- A pending payment like the ones recorded before m29 (record_payment now confirms at once), to
-- test the confirm / reject rules that still apply to them.
create function tests.pend(p_key text, p_amount integer, p_alloc jsonb, p_txn text default null) returns uuid
language plpgsql security definer as $$
declare pid uuid := gen_random_uuid();
begin
  insert into public.payments (id, payer_name, method, amount, paid_on, txn_ref, created_by)
  values (pid, 'دافع تجريبي', 'bankily', p_amount, current_date, p_txn, auth.uid());
  insert into public.payment_allocations (payment_id, kind, member_id, campaign_id, year, month, amount)
  select pid, a.kind, a.member_id, a.campaign_id, a.year, a.month, a.amount
  from jsonb_to_recordset(p_alloc) a(kind public.allocation_kind, member_id uuid, campaign_id uuid, year smallint, month smallint,
                                     amount integer);
  perform tests.set(p_key, pid::text);
  return pid;
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
update public.settings set opening_balance = 0, grace_days = 10, show_amount_owed = false where id;

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
select tests.login('server');
select tests.ok((select count(*) from public.member_status where number between 1001 and 1005) = 5, 'the server reads member_status');
select tests.login('public');
select tests.ok((select ok from public.keepalive), 'anon reads the keepalive view');
select tests.login('server');
select tests.ok((select count(*) from public.fund_summary) = 1, 'the server reads fund_summary');
select tests.ok((select count(*) from public.monthly_collection) > 0, 'the server reads monthly_collection');
select tests.login('public');
select tests.ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name in ('member_status','member_months','fund_summary','monthly_collection',
        'expense_totals','recent_expenses','campaign_progress','activity_feed','campaign_contributions',
        'fund_accounts_public','fund_info')
    and column_name ~ '(phone|proof|txn|payer|receipt_path)'), 'public views expose no phone/proof/txn/payer/receipt image columns');
select tests.login('server');
select tests.ok((select bool_and(amount_owed is null) from public.member_status), 'amount owed hidden by default');
select tests.login('public');

/* ───────────── committee reads, cannot write tables ───────────── */

select tests.login('committee');
select tests.ok((select phone from public.members where number = 1001) = '+22211111111', 'committee reads phones');
select tests.ok((select count(*) from storage.objects where bucket_id = 'proofs') = 1, 'committee reads proofs');
select tests.throws($$update public.members set phone = '+22299999999' where number = 1001$$, '42501', 'committee cannot update tables directly');
select tests.throws($$insert into public.payments (payer_name, method, amount, paid_on) values ('x', 'cash', 1, current_date)$$,
  '42501', 'committee cannot insert payments directly');

select tests.login('former');
select tests.ok((select count(*) from public.members) = 0, 'inactive committee account sees no rows');
select tests.throws($$select tests.pay('x', 1000, jsonb_build_array(tests.month('E', -3, 1000)))$$, 'not_committee',
  'inactive committee account cannot record');

/* ───────────── record → confirm, first wins ───────────── */

select tests.login('committee');
select tests.pend('p1', 1000, jsonb_build_array(tests.month('E', -3, 1000)), 'TXN-1');
select tests.ok((select status from public.payments where id = tests.id('p1')) = 'pending', 'an old pending payment (before m29)');
select tests.throws($$select tests.pay('dup', 1000, jsonb_build_array(tests.month('K', -3, 1000)), 'TXN-1')$$, 'duplicate_txn_ref',
  'same wallet transaction number cannot be recorded twice');
select tests.throws($$select tests.pay('bad', 2000, jsonb_build_array(tests.month('K', -3, 1000)))$$, 'allocations_mismatch',
  'allocations must sum to the amount');
select tests.throws($$select tests.pay('bad', 500, jsonb_build_array(tests.month('K', -3, 500)))$$, 'wrong_month_amount',
  'a month costs the group price');
select tests.throws($$select tests.pay('bad', 1000, jsonb_build_array(tests.month('G', -1, 1000)))$$, 'month_not_owed',
  'cannot pay a month when the member is deceased');

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
select tests.pend('k1', 1000, jsonb_build_array(tests.month('K', -3, 1000)));
select tests.pend('k2', 1000, jsonb_build_array(tests.month('K', -3, 1000)));
select tests.login('treasurer');
select public.confirm_payment(tests.id('k1'));
select tests.throws($$select public.confirm_payment(tests.id('k2'))$$, 'month_already_paid', 'second payment for the same month cannot be confirmed');
select tests.ok((select d ? 'name' and d ? 'ref' and d ? 'ym' from (select tests.detail($$select public.confirm_payment(tests.id('k2'))$$) d) x),
  'the confirm-time month_already_paid names the member and month');
select tests.ok((select status from public.payments where id = tests.id('k2')) = 'pending', 'refused payment stays pending');
select public.reject_payment(tests.id('k2'), 'duplicate of another transfer');
select tests.ok((select status from public.payments where id = tests.id('k2')) = 'rejected', 'duplicate rejected with a reason');
select tests.throws($$select public.reject_payment(tests.id('p2'), '')$$, 'reason_required', 'reject needs a reason');

-- treasurer recording counts as confirmed at once
select tests.ok((select tests.pay('p3', 1000, jsonb_build_array(tests.month('E', -2, 1000))) ->> 'status') = 'confirmed',
  'treasurer-recorded payment is confirmed at once');

/* ───────────── own membership (m29: no special rule) ───────────── */

select tests.ok((select tests.pay('own', 1000, jsonb_build_array(tests.month('T', -3, 1000))) ->> 'status') = 'confirmed',
  'a committee member''s own membership is confirmed at once');
select tests.login('deputy');

/* ───────────── cancel frees the month ───────────── */

select tests.login('admin');
select tests.throws($$select public.cancel_payment(tests.id('p3'), ' ')$$, 'reason_required', 'cancel needs a reason');
select tests.login('deputy');
select tests.login('admin');
select public.cancel_payment(tests.id('p3'), 'wrong member');
select tests.login('deputy');
select tests.ok((select released_at is not null from public.payment_months where payment_id = tests.id('p3')), 'cancelled payment releases its month');
select tests.login('committee');
select tests.ok((select tests.pay('p4', 1000, jsonb_build_array(tests.month('E', -2, 1000))) ->> 'status') = 'confirmed',
  'a released month can be paid again, confirmed at once');
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
select tests.login('server');
select tests.ok((select months_behind from public.member_status where number = 1001) = 1 + tests.get('cur')::int,
  'arrears: paid months and grace period (E)');
select tests.ok((select months_behind from public.member_status where number = 1002) = 2, 'arrears: exempt months not owed (F)');
select tests.ok((select months_behind from public.member_status where number = 1003) = 1, 'arrears: deceased months not owed (G)');
select tests.ok((select status_label from public.member_status where number = 1001) = 'متأخر', 'late member labelled متأخر');
select tests.login('public');
select tests.login('server');
select tests.ok((select string_agg(state, ',' order by year, month) from public.member_months
   where member_id = tests.id('F') and make_date(year, month, 1) <= tests.m(0))
  = 'late,late,not_owed,not_owed', 'member_months shows exempt months as not_owed');
select tests.ok((select state from public.member_months where member_id = tests.id('E') and year = extract(year from tests.m(-3)) and month = extract(month from tests.m(-3))) = 'paid',
  'member_months shows paid months');
select tests.login('public');

select tests.login('server');
update public.settings set grace_days = 0, show_amount_owed = true where id;
select tests.login('public');
select tests.login('server');
select tests.ok((select months_behind from public.member_status where number = 1001) = 2, 'grace 0: this month is owed at once');
select tests.ok((select amount_owed from public.member_status where number = 1002) = 1000, 'amount owed shown once enabled (2 × 500)');
select tests.login('public');
select tests.login('server');
update public.settings set grace_days = 10, show_amount_owed = false where id;

select tests.login('committee');
select tests.ok((select phone from public.arrears where number = 1001) = '+22211111111', 'committee arrears view carries the phone');
select tests.ok((select amount_owed from public.arrears where number = 1005) = 2000 + 1000 * tests.get('cur')::int, 'arrears amount (K)');
select tests.ok(not exists (select 1 from public.arrears where number = 1003 and amount_owed > 1000), 'deceased member owes only pre-death months');

/* ───────────── money totals ───────────── */

select tests.login('public');
select tests.login('server');
select tests.set('bal', (select balance::text from public.fund_summary));
select tests.login('public');
select tests.ok(tests.get('bal')::int = 3000 + 1000, 'balance = confirmed payments (p1, k1, own, p4) − 0');
select tests.login('committee');
select public.record_expense(gen_random_uuid(), current_date, 'sports', 300, 'كرة');
select public.log_reminder('individual', tests.id('K'));
select tests.login('public');
select tests.login('server');
select tests.ok((select balance from public.fund_summary) = tests.get('bal')::int - 300, 'expense lowers the balance');
select tests.ok((select kind from public.activity_feed order by at desc limit 1) is not null, 'activity feed readable');
select tests.login('public');
select tests.login('committee');
select tests.ok((select last_reminded_at is not null from public.arrears where number = 1005), 'reminders are logged');

/* ───────────── realtime ───────────── */

select tests.login('server');
select tests.ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'payments'),
  'payments are published to realtime');

/* ───────────── M2: fund accounts, contact, payment queue, undo ───────────── */

select tests.login('admin');
select tests.set('acc', public.add_fund_account('bankily', '2222 3333', 'صندوق الرابطة', null, 1));
select tests.ok((select account_number from public.fund_accounts where id = tests.id('acc')) = '22223333', 'account number stored without spaces');
select tests.throws($$select public.add_fund_account('bankily', '22223333', 'x')$$, 'account_exists', 'same active wallet number twice');
select tests.throws($$select public.add_fund_account('cash', '22223333', 'x')$$, 'not_a_wallet', 'cash is not a wallet account');
select tests.set('acc2', public.add_fund_account('click', '44445555', 'أمين الصندوق', 'رقم ثان', 2));
select public.update_settings(p_whatsapp_contact => '+222 3333 4444');
select tests.login('former');
select tests.throws($$select public.add_fund_account('masrvi', '11112222', 'x')$$, 'not_committee', 'an inactive account cannot add accounts');
select tests.throws($$select public.update_settings(p_whatsapp_contact => '+22200000000')$$, 'not_committee', 'an inactive account cannot change settings');
select tests.login('public');
select tests.login('server');
select tests.ok((select count(*) from public.fund_accounts_public) = 2, 'active fund accounts are listed');
select tests.ok((select whatsapp_contact from public.fund_info) = '+22233334444', 'the WhatsApp contact is readable');
select tests.login('public');
select tests.throws('select * from public.fund_accounts', '42501', 'anon cannot read the fund_accounts table');
select tests.throws('select * from public.payment_queue', '42501', 'anon cannot read the payment queue');
select tests.login('admin');
select public.update_fund_account(tests.id('acc2'), 'أمين الصندوق', null, 2, false);
select tests.login('public');
select tests.login('server');
select tests.ok((select count(*) from public.fund_accounts_public) = 1, 'deactivated account hidden from the public');
select tests.login('public');
select tests.login('server');
select tests.throws($$delete from public.fund_accounts where id = tests.id('acc2')$$, 'append_only', 'fund accounts are never deleted');
select tests.throws($$update public.fund_accounts set account_number = '99998888' where id = tests.id('acc')$$, 'append_only',
  'account number cannot be edited');
select tests.ok(exists (select 1 from public.audit_log where table_name = 'fund_accounts' and action = 'deactivate_fund_account'),
  'deactivation is audited');
select tests.login('admin');
select public.update_settings(p_whatsapp_contact => '');
select tests.ok((select whatsapp_contact from public.fund_info) is null, 'empty contact clears it');
select public.update_settings(p_grace_days => 10);
select tests.ok((select grace_days from public.fund_info) = 10, 'null contact leaves it (other settings still update)');

-- the new wallets are payment methods
select tests.login('treasurer');
select tests.ok((public.record_payment(gen_random_uuid(), 'دافع', 'click', 1000, current_date,
  jsonb_build_array(tests.month('K', 0, 1000))) ->> 'status') = 'confirmed', 'click payment recorded and confirmed');

select tests.login('committee');
select tests.set('u1', tests.pay('u1', 1000, jsonb_build_array(tests.month('E', 0, 1000))) ->> 'id');
select tests.ok((select allocations -> 0 ->> 'number' from public.payment_queue where id = tests.id('u1')) = '1001',
  'payment queue shows the member number in allocations');
select tests.ok((select created_by_name from public.payment_queue where id = tests.id('u1')) = 'مشرف', 'queue shows who recorded it');
select public.undo_payment(tests.id('u1'));
select tests.ok((select status from public.payments where id = tests.id('u1')) = 'cancelled', 'the recorder undoes his own payment');
select tests.ok((select cancel_reason from public.payments where id = tests.id('u1')) = 'undo', 'undo reason recorded');
select public.undo_payment(tests.id('u1'));   -- repeat is a no-op
select tests.login('admin');
select tests.set('u2', (public.record_payment(gen_random_uuid(), 'دافع', 'cash', 1000, current_date,
  jsonb_build_array(tests.month('E', 0, 1000))) ->> 'id'));
select tests.login('committee');
select tests.throws($$select public.undo_payment(tests.id('u2'))$$, 'undo_expired', 'only the recorder can undo');
select tests.login('admin');
select public.undo_payment(tests.id('u2'));
select tests.ok(not exists (select 1 from public.payment_months where payment_id = tests.id('u2') and released_at is null),
  'undo of a confirmed payment releases its months');
select tests.login('server');
select tests.set('n_conf', (select count(*) from public.payments where status = 'confirmed' and method <> 'paper'));
select tests.login('public');
select tests.login('server');
select tests.ok((select count(*) from public.activity_feed where kind = 'payment_confirmed') = least(30, tests.get('n_conf')::int),
  'activity feed lists confirmed payments only (undone/cancelled ones drop out)');
select tests.login('public');
select tests.login('deputy');
select tests.ok((public.record_payment(gen_random_uuid(), 'دافع', 'cash', 1000, current_date,
  jsonb_build_array(tests.month('E', 0, 1000))) ->> 'status') = 'confirmed', 'the released month can be paid again');

/* ───────────── M2: receipts ───────────── */

select tests.login('treasurer');
select tests.set('r1', public.record_payment(gen_random_uuid(), 'دافع الإيصال', 'masrvi', 1000, current_date,
  jsonb_build_array(tests.month('K', 1, 1000))) ->> 'id');
select tests.set('r2', public.record_payment(gen_random_uuid(), 'دافع ثان', 'cash', 1000, current_date,
  jsonb_build_array(tests.month('K', 2, 1000))) ->> 'id');
select tests.login('server');
select tests.set('r1_code', (select receipt_code from public.payments where id = tests.id('r1')));
select tests.ok(tests.get('r1_code') ~ '^BQ-[A-Z]{4}-[0-9]{4}$', 'confirmed payment gets a BQ-XXXX-NNNN code');
select tests.ok((select p2.receipt_seq = p1.receipt_seq + 1 from public.payments p1, public.payments p2
                 where p1.id = tests.id('r1') and p2.id = tests.id('r2')), 'receipt numbers are consecutive');
select tests.ok(not exists (select 1 from public.payments where status = 'pending' and receipt_code is not null),
  'pending payments have no receipt');
select tests.throws($$update public.payments set receipt_code = 'BQ-AAAA-0000' where id = tests.id('r1')$$, 'stamp_once',
  'a receipt code never changes');
select tests.login('committee');
select tests.ok((select receipt_no from public.payment_queue where id = tests.id('r1')) ~ '^[0-9]{4}-[0-9]{4}$',
  'queue shows the receipt number');

select tests.login('server');
select tests.ok((select receipt_code from public.activity_feed where payment_id = tests.id('r1')) = tests.get('r1_code')
  and (select amount from public.activity_feed where payment_id = tests.id('r1')) = 1000, 'feed shows amount and receipt code');
select tests.login('public');
select tests.throws('select * from public.receipt_counters', '42501', 'anon cannot read receipt counters');
select tests.login('treasurer');
select tests.login('admin');
select public.cancel_payment(tests.id('r1'), 'خطأ في التسجيل');
select tests.login('treasurer');
select tests.login('server');
select tests.ok((select status = 'cancelled' and receipt_code = tests.get('r1_code') from public.payments where id = tests.id('r1')),
  'a cancelled payment keeps its receipt code');

select tests.login('server');
insert into public.campaigns (id, title, amount_mode) values ('00000000-0000-0000-0000-00000000c002', 'حملة اختبار', 'open');
select tests.set('camp2', '00000000-0000-0000-0000-00000000c002'::uuid);
select tests.login('treasurer');
select public.record_payment(gen_random_uuid(), 'متبرع من الخارج', 'bankily', 2000, current_date,
  jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('camp2'), 'member_id', null, 'amount', 2000)), 'TXN-C1234');
select tests.login('public');
select tests.login('server');
select tests.ok((select contributor_name from public.campaign_contributions where campaign_id = tests.id('camp2')) = 'متبرع من الخارج'
  and (select amount from public.campaign_contributions where campaign_id = tests.id('camp2')) = 2000,
  'campaign contributions list the donor and amount');
select tests.login('public');

select tests.login('server');
select tests.ok((public.record_payment(gen_random_uuid(), 'سجل', 'paper', 1000, current_date,
  jsonb_build_array(tests.month('K', 3, 1000))) ->> 'status') = 'confirmed', 'paper payment confirmed by the server');
select tests.ok(not exists (select 1 from public.payments where method = 'paper' and receipt_code is not null),
  'paper imports get no receipt');

/* ───────────── M6: campaigns ───────────── */

select tests.login('former');
select tests.throws($$select public.create_campaign(gen_random_uuid(), 'حملة')$$, 'not_admin', 'an inactive account cannot open a campaign');
select tests.login('treasurer');
select tests.login('admin');
select tests.set('c6', public.create_campaign('00000000-0000-0000-0000-00000000c006', 'ترميم', 'fixed', 'السقف', 20000, null,
  jsonb_build_array(jsonb_build_object('member_id', tests.id('E'), 'expected_amount', 3000))));
select tests.login('treasurer');
select tests.login('admin');
select public.create_campaign('00000000-0000-0000-0000-00000000c006', 'ترميم');   -- retry is a no-op
select tests.ok((select count(*) from public.campaigns where id = tests.id('c6')) = 1, 'retried create adds nothing');
select tests.login('treasurer');
-- one transfer pays a month and the campaign
select tests.ok((public.record_payment(gen_random_uuid(), 'دافع', 'bankily', 4000, current_date,
  jsonb_build_array(tests.month('E', 1, 1000),
                    jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('c6'), 'member_id', tests.id('E'), 'amount', 3000)))
  ->> 'status') = 'confirmed', 'one payment splits a month and a campaign');
select tests.login('admin');
select public.update_campaign(tests.id('c6'), 'ترميم المسجد', 'السقف', 25000, current_date + 30);
select tests.login('treasurer');
select public.record_expense(gen_random_uuid(), current_date, 'other', 1000, 'مواد', tests.id('c6'));
select tests.login('public');
select tests.login('server');
select tests.ok((select collected = 3000 and spent = 1000 and balance = 2000 and participants_paid = 1 and target_amount = 25000
                 from public.campaign_progress where campaign_id = tests.id('c6')), 'campaign progress after split payment, edit and expense');
select tests.set('bal6', (select balance from public.fund_summary));
select tests.login('public');
-- a pending contribution blocks closing (audit C1)
select tests.login('committee');
select tests.pend('cp6', 500, jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('c6'), 'member_id', null, 'amount', 500)));
select tests.login('treasurer');
select tests.login('admin');
select tests.throws($$select public.close_campaign(tests.id('c6'), 'to_fund')$$, 'campaign_has_pending',
  'a campaign with a pending contribution cannot be closed');
select tests.login('treasurer');
select public.reject_payment(tests.id('cp6'), 'اختبار');
select tests.login('admin');
select tests.ok(public.close_campaign(tests.id('c6'), 'to_fund') = 2000, 'closing moves the surplus to the fund');
select tests.login('treasurer');
select tests.login('admin');
select tests.ok(public.close_campaign(tests.id('c6'), 'to_fund') = 0, 'closing twice is a no-op');
select tests.login('treasurer');
select tests.login('admin');
select tests.throws($$select public.update_campaign(tests.id('c6'), 'x', null, null, null)$$, 'campaign_closed', 'closed campaigns are not edited');
select tests.login('treasurer');
select tests.throws($$select public.record_payment(gen_random_uuid(), 'دافع', 'cash', 500, current_date,
  jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('c6'), 'member_id', null, 'amount', 500)))$$,
  'campaign_closed', 'no contributions after closing');
select tests.throws($$select public.record_expense(gen_random_uuid(), current_date, 'other', 100, 'بعد الإغلاق', tests.id('c6'))$$,
  'campaign_closed', 'no expenses on a closed campaign (audit C2)');
-- a contribution still pending when a campaign closed (older data, or a race) cannot be confirmed (audit C1)
select tests.login('admin');
select tests.set('c7', public.create_campaign('00000000-0000-0000-0000-00000000c007', 'حملة مغلقة'));
select tests.login('treasurer');
select tests.login('committee');
select tests.pend('cp7', 500, jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('c7'), 'member_id', null, 'amount', 500)));
select tests.login('server');
update public.campaigns set status = 'closed', closed_at = now(), surplus_action = 'keep' where id = tests.id('c7');
select tests.login('deputy');
select tests.throws($$select public.confirm_payment(tests.id('cp7'))$$, 'campaign_closed',
  'a contribution to a closed campaign cannot be confirmed');
select public.reject_payment(tests.id('cp7'), 'الحملة مغلقة');
select tests.login('public');
select tests.login('server');
select tests.ok((select balance from public.fund_summary) = tests.get('bal6')::int + 2000, 'main fund balance grows by the surplus');
select tests.ok((select balance from public.campaign_progress where campaign_id = tests.id('c6')) = 0, 'campaign balance is zero after transfer');
select tests.login('public');
-- owner decision: closing always moves the leftover to the fund, even when an old client sends 'keep'
select tests.login('treasurer');
select tests.login('admin');
select tests.set('c8', public.create_campaign('00000000-0000-0000-0000-00000000c008', 'حملة ثامنة'));
select tests.login('treasurer');
select public.record_payment(gen_random_uuid(), 'متبرع', 'cash', 700, current_date,
  jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('c8'), 'member_id', null, 'amount', 700)));
select tests.login('admin');
select tests.ok(public.close_campaign(tests.id('c8'), 'keep') = 700, 'closing with keep still moves the leftover to the fund');
select tests.login('treasurer');
select tests.ok((select surplus_action from public.campaigns where id = tests.id('c8')) = 'to_fund', 'and is stored as to_fund');

select tests.login('public');
select tests.login('server');
select tests.ok((select monthly_amount from public.group_prices_public
                 where group_code = 'B' and year = extract(year from current_date)) = 500, 'anon reads group prices');
select tests.login('public');

/* ───────────── M7: two member lists, statuses ───────────── */

select tests.login('admin');
select tests.set('LA', public.add_member(1, 'عضو القائمة أ', 'A', tests.m(-3), null, null, 'active', 'A'));
select tests.set('LB', public.add_member(1, 'عضو القائمة ب', 'B', tests.m(-3)));
select tests.ok((select list_code from public.members where id = tests.id('LB')) = 'B', 'list defaults to the group');
select tests.throws($$select public.add_member(1, 'مكرر', 'A', tests.m(0), null, null, 'active', 'A')$$, 'number_taken',
  'same number twice in one list');
select tests.ok(public.next_member_number('a') = (select max(number) + 1 from public.members where list_code = 'A'),
  'next free number of list A');
select public.update_member(tests.id('LA'), 'عضو القائمة أ', null, null, 7);
select tests.ok((select number from public.members where id = tests.id('LA')) = 7, 'admin renumbers a member');
select tests.throws($$select public.update_member(tests.id('LB'), 'x', null, null, 1002)$$, 'number_taken',
  'renumbering onto a taken number in the same list');
select public.change_member_group(tests.id('LB'), tests.m(0), 'A');
select tests.ok((select group_code from public.members_admin where member_id = tests.id('LB')) = 'A'
                and (select member_status from public.members_admin where member_id = tests.id('LB')) = 'active',
  'group change keeps the status');
select public.change_member_status(tests.id('LA'), tests.m(-1), 'left', 'سافر نهائياً');
select tests.login('committee');
select tests.ok(not exists (select 1 from public.arrears where member_id = tests.id('LA')), 'a member who left is not in arrears');
select tests.ok((select member_ref from public.members_admin where member_id = tests.id('LA')) = 'A-7', 'members_admin shows A-7');
select tests.login('public');
select tests.login('server');
select tests.ok((select member_ref || ' ' || status_label from public.member_status where member_id = tests.id('LA')) = 'A-7 غادر',
  'public status shows list reference and «غادر»');
select tests.ok((select members_active from public.fund_summary)
                = (select count(*) from public.member_status where member_status = 'active'), 'active count');
select tests.ok((select members_ok + members_behind from public.fund_summary) = (select members_active from public.fund_summary),
  'up to date + late = active members');
select tests.login('public');
select tests.throws('select * from public.members_admin', '42501', 'anon cannot read members_admin');
select tests.login('former');   -- signed in but not an active committee member
select tests.ok((select count(*) from public.members_admin) = 0 and (select count(*) from public.arrears) = 0
                and (select count(*) from public.payment_queue) = 0, 'non-committee accounts see no member/arrears/payment rows');

/* ───────────── admin confirms payments (owner decision) ───────────── */

select tests.login('committee');
select tests.pend('ac1', 500, jsonb_build_array(tests.month('LB', -1, 500)));
select tests.login('admin');
select tests.ok((public.confirm_payment(tests.id('ac1')) ->> 'status') = 'confirmed', 'the admin confirms a pending payment');
select tests.login('committee');
select tests.pend('ac2', 500, jsonb_build_array(tests.month('LB', -2, 500)));
select tests.login('admin');
select public.reject_payment(tests.id('ac2'), 'صورة غير واضحة');
select tests.ok((select status from public.payments where id = tests.id('ac2')) = 'rejected', 'the admin rejects a pending payment');
select tests.login('server');
select public.set_committee_member('00000000-0000-0000-0000-0000000000a1', 'المدير', 'admin', tests.id('LB'));
select tests.login('committee');
select tests.pend('ac3', 500, jsonb_build_array(tests.month('LB', -3, 500)));
select tests.login('admin');
select tests.ok((public.confirm_payment(tests.id('ac3')) ->> 'status') = 'confirmed',
  'the admin confirms a payment covering his own membership (m29: no own-membership rule)');
select tests.login('server');
select public.set_committee_member('00000000-0000-0000-0000-0000000000a1', 'المدير', 'admin', null);
select tests.login('former');
select tests.throws($$select public.confirm_payment(tests.id('ac1'))$$, 'not_confirmer', 'an inactive account cannot confirm');

/* ───────────── M9: committee accounts ───────────── */

select tests.login('admin');
select tests.ok((select count(*) from public.committee_accounts) >= 4, 'the admin lists committee accounts');
select tests.ok((select login from public.committee_accounts where display_name = 'الأمين') = 'treasurer@test.invalid',
  'the list shows each login');
select public.set_committee_active('00000000-0000-0000-0000-0000000000a4', false);
select tests.ok(not (select active from public.committee where user_id = '00000000-0000-0000-0000-0000000000a4'), 'admin deactivates an account');
select public.set_committee_active('00000000-0000-0000-0000-0000000000a4', true);
select tests.ok((select active from public.committee where user_id = '00000000-0000-0000-0000-0000000000a4'), 'and reactivates it');
select tests.throws($$select public.set_committee_active('00000000-0000-0000-0000-0000000000a1', false)$$, 'cannot_demote_self',
  'the admin cannot deactivate himself');
select tests.login('treasurer');
select tests.ok((select count(*) from public.committee_accounts) = 0, 'non-admins see no logins');
select tests.throws($$select public.set_committee_active('00000000-0000-0000-0000-0000000000a4', false)$$, 'not_admin',
  'only the admin (de)activates accounts');
select tests.login('public');
select tests.throws('select * from public.committee_accounts', '42501', 'anon cannot read committee accounts');

/* ───────────── M10: push subscriptions ───────────── */

select tests.login('treasurer');
select public.save_push_subscription('https://push.example/t1', repeat('p', 40), 'authauth', 'Android');
select public.save_push_subscription('https://push.example/t1', repeat('q', 40), 'authauth', 'Android');
select tests.ok((select count(*) from public.push_subscriptions) = 1, 'a member sees their own subscription, saved once per endpoint');
select tests.throws($$select public.save_push_subscription('http://insecure', repeat('p', 40), 'authauth')$$, '23514',
  'only https endpoints');
select tests.login('deputy');
select tests.ok((select count(*) from public.push_subscriptions) = 0, 'members do not see each other''s subscriptions');
select public.delete_push_subscription('https://push.example/t1');
select tests.login('server');
select tests.ok((select count(*) from public.push_subscriptions where endpoint = 'https://push.example/t1') = 1,
  'nobody deletes another member''s subscription');
select tests.login('deputy');
select public.save_push_subscription('https://push.example/t1', repeat('d', 40), 'authauth');
select tests.login('server');
select tests.ok((select user_id from public.push_subscriptions where endpoint = 'https://push.example/t1')
  = '00000000-0000-0000-0000-0000000000a3', 'the same browser signed in by another member moves to them');
select tests.login('deputy');
select public.delete_push_subscription('https://push.example/t1');
select tests.ok((select count(*) from public.push_subscriptions) = 0, 'a member removes their own subscription');
select tests.login('public');
select tests.throws($$select public.save_push_subscription('https://push.example/x', repeat('p', 40), 'authauth')$$, '42501',
  'anon cannot save a subscription');
select tests.throws('select * from public.push_subscriptions', '42501', 'anon cannot read subscriptions');

/* ───────────── M12: «حسابي» ───────────── */

select tests.login('deputy');
select public.update_my_profile('  النائب محمد ', null);
select tests.ok((select display_name from public.committee where user_id = '00000000-0000-0000-0000-0000000000a3') = 'النائب محمد',
  'a member renames themselves');
select tests.throws($$select public.update_my_profile('', null)$$, 'invalid_input', 'the name cannot be empty');
select tests.throws($$select public.update_my_profile('النائب', tests.id('T'))$$, 'member_taken',
  'a member row linked to someone else cannot be claimed');
select tests.throws($$select public.update_my_profile('النائب', tests.id('G'))$$, 'member_not_active',
  'only an active member row can be linked');
select public.update_my_profile('النائب', tests.id('K'));
select tests.ok((select member_id from public.committee where user_id = '00000000-0000-0000-0000-0000000000a3') = tests.id('K'),
  'a member without a link links their own member row once');
select tests.throws($$select public.update_my_profile('النائب', null)$$, 'member_link_admin_only',
  'a confirmer cannot unlink themselves (own-membership rule)');
select tests.login('treasurer');
select tests.throws($$select public.update_my_profile('الأمين', tests.id('E'))$$, 'member_link_admin_only',
  'nor move the link to another member');
select tests.login('public');
select tests.throws($$select public.update_my_profile('x', null)$$, '42501', 'anon cannot edit a profile');
select tests.login('admin');
select public.set_committee_member('00000000-0000-0000-0000-0000000000a3', 'النائب', 'deputy');

/* ───────────── M11: deleting an account without history ───────────── */

select tests.login('server');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a6', 'mistake@test.invalid');
select tests.ok((select count(*) from pg_constraint where contype = 'f' and confrelid = 'auth.users'::regclass
                   and connamespace = 'public'::regnamespace) = 26,
  'every column pointing at auth.users is checked by account_has_history (update it when this count changes)');
select tests.login('admin');
select public.set_committee_member('00000000-0000-0000-0000-0000000000a6', 'خطأ', 'committee');
select tests.ok((select can_delete from public.committee_accounts where user_id = '00000000-0000-0000-0000-0000000000a6'),
  'a new account without history can be deleted');
select tests.ok(not (select can_delete from public.committee_accounts where display_name = 'الأمين'),
  'an account with history cannot');
select tests.ok(not (select can_delete from public.committee_accounts where user_id = '00000000-0000-0000-0000-0000000000a1'),
  'nor the admin himself');
select tests.throws($$select public.delete_committee_member('00000000-0000-0000-0000-0000000000a2')$$, 'has_history',
  'deleting an account with history is refused');
select tests.throws($$select public.delete_committee_member('00000000-0000-0000-0000-0000000000a1')$$, 'cannot_delete_self',
  'the admin cannot delete himself');
select tests.login('treasurer');
select tests.throws($$select public.delete_committee_member('00000000-0000-0000-0000-0000000000a6')$$, 'not_admin',
  'only the admin deletes accounts');
select tests.login('server');
select tests.throws($$delete from public.committee where user_id = '00000000-0000-0000-0000-0000000000a6'$$, 'append_only',
  'committee rows are never deleted directly');
select tests.login('admin');
select public.delete_committee_member('00000000-0000-0000-0000-0000000000a6');
select tests.ok(not exists (select 1 from public.committee where user_id = '00000000-0000-0000-0000-0000000000a6'),
  'the admin deletes the account');
select tests.ok(exists (select 1 from public.audit_log where action = 'delete_committee_member'
                          and row_id = '00000000-0000-0000-0000-0000000000a6'), 'and the deletion is audited');
select tests.login('server');
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a6';
select tests.ok(true, 'the login can then be removed');

/* ───────────── M13: API exposes no SECURITY DEFINER function ───────────── */

select tests.login('server');
select tests.ok(not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and prosecdef),
  'every SECURITY DEFINER function lives in app_private; public has invoker wrappers only');
select tests.login('public');
select tests.throws($$select public.record_payment(gen_random_uuid(), 'x', 'cash', 1000, current_date, '[]'::jsonb)$$, '42501',
  'anon still cannot call a write RPC');
select tests.throws($$select app_private.record_payment(gen_random_uuid(), 'x', 'cash', 1000, current_date, '[]'::jsonb)$$, '42501',
  'nor the moved definer function directly');

/* ───────────── M17: month errors name the member and month ───────────── */

select tests.login('server');
select tests.set('paid_m', (select pm.member_id from public.payment_months pm join public.members m on m.id = pm.member_id
                            where pm.released_at is null and m.id = tests.id('K') order by pm.year, pm.month limit 1));
select tests.set('paid_y', (select pm.year from public.payment_months pm where pm.member_id = tests.id('K') and pm.released_at is null
                            order by pm.year, pm.month limit 1));
select tests.set('paid_mo', (select pm.month from public.payment_months pm where pm.member_id = tests.id('K') and pm.released_at is null
                             order by pm.year, pm.month limit 1));
select tests.login('committee');
select tests.ok((select d ->> 'name' = 'عضو ك' and d ->> 'ref' = 'A-1005'
                        and d ->> 'ym' = tests.get('paid_y') || '-' || lpad(tests.get('paid_mo'), 2, '0')
                 from (select tests.detail(format($$select public.record_payment(gen_random_uuid(), 'x', 'cash', 1000, current_date,
                   jsonb_build_array(jsonb_build_object('kind', 'months', 'member_id', %L::uuid, 'year', %s, 'month', %s, 'amount', 1000)))$$,
                   tests.get('paid_m'), tests.get('paid_y'), tests.get('paid_mo'))) d) x),
  'month_already_paid names the member and the month');
select tests.ok((select d ->> 'ym' = to_char(tests.m(-6), 'YYYY-MM') and d ->> 'ref' = 'A-1005' and not d ? 'price'
                 from (select tests.detail($$select public.record_payment(gen_random_uuid(), 'x', 'cash', 1000, current_date,
                   jsonb_build_array(tests.month('K', -6, 1000)))$$) d) x),
  'month_not_owed names the month before joining');
select tests.ok((select (d ->> 'price')::int = 1000 and d ->> 'ym' = to_char(tests.m(1), 'YYYY-MM')
                 from (select tests.detail($$select public.record_payment(gen_random_uuid(), 'x', 'cash', 999, current_date,
                   jsonb_build_array(tests.month('K', 1, 999)))$$) d) x),
  'wrong_month_amount gives the month and its price');

/* ───────────── M18: month prices, price fallback for owed ───────────── */

select tests.login('public');
select tests.login('server');
select tests.ok((select price from public.member_months where member_id = tests.id('K') and year = extract(year from current_date)
                 and month = extract(month from current_date)) = 1000, 'member_months gives the price a month must be paid with');
select tests.login('public');
select tests.login('server');
insert into public.groups (code, name) values ('C', 'C');
insert into public.group_prices (group_id, year, monthly_amount)
select id, extract(year from current_date)::int - 3, 700 from public.groups where code = 'C';
select tests.set('GC', public.add_member(9001, 'عضو ج', 'C', make_date(extract(year from current_date)::int - 2, 1, 1), null, null, 'active', 'A'));
select tests.ok((select price is null and owed = 700 from app_private.month_grid()
                 where member_id = tests.id('GC') and year = extract(year from current_date)::int - 2 and month = 1),
  'a year without prices: no payable price, but owed uses the latest earlier price');
select tests.login('public');
select tests.login('server');
select tests.ok((select price is null and state = 'late' from public.member_months
                 where member_id = tests.id('GC') and year = extract(year from current_date)::int - 2 and month = 1),
  'past-year late months are listed with their (missing) price');
select tests.login('public');

/* ───────────── M19: undo a status change, correct a join month ───────────── */

select tests.login('admin');
select tests.set('D', public.add_member(9002, 'عضو د', 'A', tests.m(-4)));
select public.change_member_status(tests.id('D'), tests.m(-1), 'left', 'غادر');
select tests.ok((select state from public.member_months where member_id = tests.id('D')
                 and year = extract(year from tests.m(-1)) and month = extract(month from tests.m(-1))) = 'not_owed',
  'a wrong «غادر» makes the month not owed');
select tests.login('former');
select tests.throws($$select public.cancel_last_period(tests.id('D'), 'x')$$, 'not_admin', 'an inactive account cannot undo a period');
select tests.login('admin');
select tests.throws($$select public.cancel_last_period(tests.id('D'), '  ')$$, 'reason_required', 'undo needs a reason');
select public.cancel_last_period(tests.id('D'), 'خطأ في الإدخال');
select tests.ok((select state from public.member_months where member_id = tests.id('D')
                 and year = extract(year from tests.m(-1)) and month = extract(month from tests.m(-1))) <> 'not_owed'
                and (select count(*) = 1 and bool_and(from_month = tests.m(-4) and to_month is null and status = 'active')
                     from public.membership_periods where member_id = tests.id('D') and cancelled_at is null)
                and (select count(*) = 2 from public.membership_periods where member_id = tests.id('D') and cancelled_at is not null),
  'undo: the wrong period and the closed one are cancelled, the previous period is open again');
select tests.throws($$select public.cancel_last_period(tests.id('D'), 'x')$$, 'no_previous_period', 'the first period cannot be undone');
select public.record_payment(gen_random_uuid(), 'د', 'cash', 1000, current_date, jsonb_build_array(tests.month('D', -1, 1000)));
select public.change_member_group(tests.id('D'), tests.m(-1), 'B', 'تغيير');
select tests.throws($$select public.cancel_last_period(tests.id('D'), 'x')$$, 'period_has_payments',
  'no undo over a paid month');
select public.set_join_month(tests.id('D'), tests.m(-6), 'تاريخ الانضمام الصحيح');
select tests.ok((select state from public.member_months where member_id = tests.id('D')
                 and year = extract(year from tests.m(-6)) and month = extract(month from tests.m(-6))) = 'late'
                and (select from_month = tests.m(-6) and to_month = tests.m(-2) from public.membership_periods
                     where member_id = tests.id('D') and cancelled_at is null order by from_month limit 1),
  'an earlier join month makes those months owed, the period end is kept');
select tests.throws($$select public.set_join_month(tests.id('D'), tests.m(-1), 'x')$$, 'join_month_invalid',
  'the join month cannot move past the first period');
select public.record_payment(gen_random_uuid(), 'د', 'cash', 1000, current_date, jsonb_build_array(tests.month('D', -5, 1000)));
select tests.throws($$select public.set_join_month(tests.id('D'), tests.m(-4), 'x')$$, 'period_has_payments',
  'the join month cannot move past a paid month');
select tests.ok(public.set_join_month(tests.id('D'), tests.m(-6), 'x')
                = (select id from public.membership_periods where member_id = tests.id('D') and cancelled_at is null
                   order by from_month limit 1), 'same join month is a no-op');

/* ───────────── M20: small guards ───────────── */

select tests.login('server');
update public.settings set opening_balance_on = make_date(extract(year from current_date)::int - 1, 1, 1) where id;
select tests.login('admin');
select tests.throws($$select public.record_expense(gen_random_uuid(), make_date(extract(year from current_date)::int - 2, 6, 1), 'other', 100)$$,
  'before_opening', 'no expense before the records start');
select tests.throws($$select public.record_payment(gen_random_uuid(), 'x', 'cash', 100, make_date(extract(year from current_date)::int - 2, 6, 1),
  jsonb_build_array(jsonb_build_object('kind', 'credit', 'member_id', tests.id('K'), 'amount', 100)))$$,
  'before_opening', 'no payment before the records start');
select tests.ok((public.record_payment(gen_random_uuid(), 'سجل', 'paper', 100, make_date(extract(year from current_date)::int - 2, 6, 1),
  jsonb_build_array(jsonb_build_object('kind', 'credit', 'member_id', tests.id('K'), 'amount', 100))) ->> 'status') = 'confirmed',
  'paper records may be older');

select tests.set('D2', public.add_member(9003, 'عضو هـ', 'A', tests.m(-4)));
select tests.login('committee');
select tests.pend('d2p', 1000, jsonb_build_array(tests.month('D2', -1, 1000)));
select tests.login('admin');
select tests.throws($$select public.change_member_status(tests.id('D2'), tests.m(-2), 'exempt', 'x')$$, 'months_pending_after',
  'no back-dated exemption over a pending payment');
select public.change_member_status(tests.id('D2'), tests.m(0), 'exempt', 'بعد الدفعة');

select tests.login('server');
select tests.throws($$select public.set_committee_member('00000000-0000-0000-0000-0000000000a1', 'المدير', 'treasurer')$$,
  'last_admin', 'the only admin cannot be demoted');
select tests.throws($$select public.set_committee_active('00000000-0000-0000-0000-0000000000a1', false)$$,
  'last_admin', 'the only admin cannot be deactivated');

/* ───────────── M21: pay months from credit ───────────── */

select tests.login('admin');
select tests.set('F', public.add_member(9004, 'عضو و', 'A', tests.m(-3)));
select tests.login('treasurer');
select public.record_payment(gen_random_uuid(), 'و', 'cash', 2500, current_date,
  jsonb_build_array(jsonb_build_object('kind', 'credit', 'member_id', tests.id('F'), 'amount', 2500)));
select tests.login('server');
select tests.ok((select credit from app_private.member_credit() where member_id = tests.id('F')) = 2500, 'overpayment is credit');
select tests.set('bal21', (select balance from public.fund_summary));
select tests.set('in21', (select money_in from public.fund_summary));
select tests.login('former');
select tests.throws($$select public.apply_credit(gen_random_uuid(), tests.id('F'),
  jsonb_build_array(jsonb_build_object('year', extract(year from tests.m(-3)), 'month', extract(month from tests.m(-3)))))$$,
  'not_confirmer', 'an inactive account cannot pay from credit');
select tests.login('deputy');
select tests.throws($$select public.apply_credit(gen_random_uuid(), tests.id('F'), jsonb_build_array(
  jsonb_build_object('year', extract(year from tests.m(-3)), 'month', extract(month from tests.m(-3))),
  jsonb_build_object('year', extract(year from tests.m(-2)), 'month', extract(month from tests.m(-2))),
  jsonb_build_object('year', extract(year from tests.m(-1)), 'month', extract(month from tests.m(-1)))))$$,
  'credit_insufficient', 'credit must cover every month');
select tests.throws($$select public.apply_credit(gen_random_uuid(), tests.id('F'),
  jsonb_build_array(jsonb_build_object('year', extract(year from tests.m(-6)), 'month', extract(month from tests.m(-6)))))$$,
  'month_not_owed', 'a month before joining is not owed');
select tests.set('cr1', '00000000-0000-0000-0000-00000000cc01'::uuid);
select tests.ok((public.apply_credit(tests.id('cr1'), tests.id('F'), jsonb_build_array(
  jsonb_build_object('year', extract(year from tests.m(-3)), 'month', extract(month from tests.m(-3))),
  jsonb_build_object('year', extract(year from tests.m(-2)), 'month', extract(month from tests.m(-2))))) ->> 'status') = 'confirmed',
  'two months paid from credit');
select tests.ok((public.apply_credit(tests.id('cr1'), tests.id('F'), '[]'::jsonb) ->> 'replay')::boolean, 'a retry is a replay');
select tests.login('public');
select tests.login('server');
select tests.ok((select count(*) from public.member_months where member_id = tests.id('F') and state = 'paid'
                 and make_date(year, month, 1) in (tests.m(-3), tests.m(-2))) = 2, 'the months show paid');
select tests.login('public');
select tests.login('server');
select tests.ok((select balance from public.fund_summary) = tests.get('bal21')::bigint
                and (select money_in from public.fund_summary) = tests.get('in21')::bigint,
  'the fund does not count credit money twice');
select tests.ok(not exists (select 1 from public.activity_feed where payment_id = tests.id('cr1')), 'credit use is not in the public feed');
select tests.login('public');
select tests.login('server');
select tests.ok((select credit from app_private.member_credit() where member_id = tests.id('F')) = 500, 'credit left after use');
select tests.login('treasurer');
select tests.throws($$select public.record_payment(gen_random_uuid(), 'x', 'credit', 1000, current_date,
  jsonb_build_array(tests.month('F', -1, 1000)))$$, 'invalid_input', 'credit payments only through apply_credit');
select tests.login('admin');
select public.cancel_payment(tests.id('cr1'), 'خطأ');
select tests.login('treasurer');
select tests.login('server');
select tests.ok((select credit from app_private.member_credit() where member_id = tests.id('F')) = 2500
                and not exists (select 1 from public.payment_months where member_id = tests.id('F') and released_at is null),
  'cancelling a credit payment gives the credit back and frees the months');

/* ───────────── M22: confirmers linked to a member, former members' debt ───────────── */

select tests.login('admin');
select tests.ok((select needs_member_link from public.committee_accounts where user_id = '00000000-0000-0000-0000-0000000000a3')
                and not (select needs_member_link from public.committee_accounts where user_id = '00000000-0000-0000-0000-0000000000a2')
                and not (select needs_member_link from public.committee_accounts where user_id = '00000000-0000-0000-0000-0000000000a4'),
  'a confirmer without a member is flagged; a linked treasurer and a plain member are not');
select tests.login('treasurer');
select tests.throws($$select public.set_committee_not_member('00000000-0000-0000-0000-0000000000a3', true)$$, 'not_admin',
  'only the admin marks an account as not a member');
select tests.login('admin');
select public.set_committee_not_member('00000000-0000-0000-0000-0000000000a3', true);
select tests.ok(not (select needs_member_link from public.committee_accounts where user_id = '00000000-0000-0000-0000-0000000000a3')
                and (select not_member from public.committee_accounts where user_id = '00000000-0000-0000-0000-0000000000a3'),
  'marked «not a member» clears the flag');
select public.set_committee_not_member('00000000-0000-0000-0000-0000000000a3', false);

select tests.ok((select cardinality(former_debt_months) >= 3 and former_debt_amount = cardinality(former_debt_months) * 1000
                 from public.members_admin where member_id = tests.id('D2')),
  'an exempt member keeps the unpaid months from before, in the member sheet');
select tests.ok((select former_debt_months is null and former_debt_amount is null from public.members_admin where member_id = tests.id('K')),
  'active members have no «former» debt (it is arrears)');
select tests.ok(not exists (select 1 from public.arrears where member_id = tests.id('D2')), 'former debt stays out of reminders');

/* ───────────── M23: P2 guards ───────────── */

select tests.login('admin');
select tests.set('G', public.add_member(9005, 'عضو ز', 'A', tests.m(-3)));
select tests.login('committee');
select tests.ok(not (tests.pay('g0', 1000, jsonb_build_array(tests.month('G', -2, 1000))) ->> 'pending_overlap')::boolean,
  'no pending twin: no overlap');
select tests.pend('g1', 1000, jsonb_build_array(tests.month('G', -3, 1000)));
select tests.ok((tests.pay('g2', 1000, jsonb_build_array(tests.month('G', -3, 1000))) ->> 'pending_overlap')::boolean,
  'a payment for a month an old pending payment also covers is flagged');
select tests.pay('g3', 500, jsonb_build_array(jsonb_build_object('kind', 'credit', 'member_id', tests.id('G'), 'amount', 500)), '00AB 123');
select tests.throws($$select tests.pay('g4', 500, jsonb_build_array(jsonb_build_object('kind', 'credit', 'member_id', tests.id('G'), 'amount', 500)), 'ab123')$$,
  'duplicate_txn_ref', 'the same transaction reference with other spacing, case or leading zeros is a duplicate');

select tests.login('admin');
select public.change_member_status(tests.id('G'), tests.m(0), 'left', 'غادر');
select tests.throws($$select public.set_committee_member('00000000-0000-0000-0000-0000000000a4', 'مشرف', 'committee', tests.id('G'))$$,
  'member_not_active', 'the admin cannot link a member who left');

select tests.set('c9', public.create_campaign('00000000-0000-0000-0000-00000000c009', 'حملة تاسعة'));
select tests.set('cp9', public.record_payment(gen_random_uuid(), 'متبرع', 'cash', 300, current_date,
  jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('c9'), 'member_id', null, 'amount', 300))) ->> 'id');
select public.close_campaign(tests.id('c9'), 'to_fund');
select tests.throws($$select public.cancel_payment(tests.id('cp9'), 'خطأ')$$, 'campaign_closed',
  'a contribution already moved to the fund cannot be cancelled');

/* ───────────── M24/M25: member links (retired by m28) ───────────── */

select tests.login('server');
insert into tests.users values ('service', '{"role":"service_role"}', 'service_role');

/* ───────────── M26: public views without money ───────────── */

create function tests.money_columns(p_relations text[]) returns text[] language sql stable as $$
  select coalesce(array_agg(c.table_name || '.' || c.column_name order by 1), '{}')
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = any (p_relations)
    and c.column_name in ('amount', 'balance', 'money_in', 'money_out', 'transfers_in', 'collected', 'spent',
                          'collected_this_year', 'spent_this_year', 'adjustment', 'adjustments', 'opening_balance',
                          'closing_balance', 'target_amount', 'transferred', 'total', 'expected', 'amount_owed');
$$;
grant execute on function tests.money_columns(text[]) to anon, authenticated, service_role;
select tests.ok(tests.money_columns(array['fund_stats', 'activity_public', 'campaigns_public', 'expenses_public',
                                          'terms_info', 'campaign_contributors_public', 'member_status_public']) = '{}',
  'the public variants carry no money columns');
select tests.ok(not exists (select 1 from information_schema.columns where table_schema = 'public'
                             and table_name = 'activity_public' and column_name = 'receipt_code'),
  'no receipt codes for strangers (a code opens /r/<code>, which shows the amount)');
select tests.login('public');
select tests.login('server');
select tests.ok((select members_active > 0 from public.fund_stats)
                and (select count(*) from public.member_status_public) = (select count(*) from public.member_status)
                and (select count(*) from public.activity_public) = (select count(*) from public.activity_feed)
                and (select count(*) from public.campaigns_public) = (select count(*) from public.campaign_progress)
                and (select count(*) from public.expenses_public) = (select count(*) from public.recent_expenses)
                and (select count(*) from public.terms_info) = (select count(*) from public.terms_public)
                and (select count(*) from public.campaign_contributors_public) = (select count(*) from public.campaign_contributions),
  'strangers read the same rows without amounts');
select tests.login('public');
select tests.login('server');
select tests.ok(app_private.can_see_money(), 'the server may read money (members, after the link check)');
select tests.login('committee');
select tests.ok(app_private.can_see_money(), 'the committee may read money');
select tests.login('former');
select tests.ok(not app_private.can_see_money(), 'a signed-in account that is not active committee may not');

/* ───────────── M27: money is private ───────────── */

select tests.login('server');
select tests.ok(tests.money_columns((select array_agg(c.relname::text) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                     where n.nspname = 'public' and c.relkind in ('v', 'r', 'm')
                                       and has_table_privilege('anon', c.oid, 'select'))) = '{}',
  'no relation strangers can read has a money column');
select tests.login('public');
select tests.throws('select balance from public.fund_summary', '42501', 'strangers cannot read the balance');
select tests.throws('select amount from public.activity_feed', '42501', 'strangers cannot read activity amounts');
select tests.throws('select * from public.member_status', '42501', 'strangers read member_status_public instead');
select tests.login('former');
select tests.ok((select count(*) from public.fund_summary) = 0 and (select count(*) from public.activity_feed) = 0,
  'a signed-in account that is not active committee sees no money');
select tests.login('committee');
select tests.ok((select count(*) from public.fund_summary) = 1, 'the committee reads the money');
select tests.login('service');
select tests.ok((select count(*) from public.fund_summary) = 1, 'our server reads money for members');

/* ───────────── M28: committee only ───────────── */

select tests.login('server');
select tests.ok((select array_agg(c.relname::text order by 1) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname in ('public', 'app_private') and c.relkind in ('v', 'r', 'm')
                   and has_table_privilege('anon', c.oid, 'select')) = '{keepalive}',
  'strangers read nothing but keepalive');
-- keepalive() behind that view; trigger functions and norm_txn only run inside the committee's writes
select tests.ok((select array_agg(n.nspname || '.' || p.proname order by 1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname in ('public', 'app_private') and has_function_privilege('anon', p.oid, 'execute')
                   and p.proname not in ('tg_keep_an_admin', 'tg_not_before_opening', 'tg_credit_payment_guard', 'norm_txn'))
                = '{app_private.keepalive}',
  'strangers call no function but keepalive');
select tests.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                            where n.nspname in ('public', 'app_private')
                              and p.proname in ('verify_receipt', 'member_session', 'member_sessions', 'member_history',
                                                'member_recent_beneficiaries', 'member_submit_payment', 'member_save_push',
                                                'member_delete_push', 'create_member_link', 'revoke_member_link',
                                                'member_links_admin', 'link_member', 'member_link_for', 'require_server'))
                and to_regclass('public.member_links_admin') is null and to_regclass('public.member_push_subscriptions') is null,
  'member-link and receipt-check functions are gone');
select tests.ok(to_regclass('public.member_links') is not null, 'member_links is kept (history)');
select tests.login('public');
select tests.throws('select * from public.member_months', '42501', 'strangers cannot read the month grid');
select tests.throws('select * from public.fund_info', '42501', 'strangers cannot read the fund info');
select tests.ok((select count(*) from public.keepalive) = 1, 'the keepalive cron still reads');
select tests.login('committee');
select tests.ok((select count(*) from public.member_months) > 0 and (select count(*) from public.fund_info) = 1
                and (select count(*) from public.member_status_public) > 0 and (select count(*) from public.group_prices_public) > 0,
  'the committee still reads the former public views');
select tests.ok((select bool_and(submitted_by_member is null) from public.payment_queue), 'the queue no longer names a link member');

/* ───────────── M29: one committee level, activity log, statement, push kinds ───────────── */

select tests.login('committee');
select tests.login('admin');
select tests.set('m29m', public.add_member(9101, 'عضو م٢٩', 'A', tests.m(-2)));
select tests.login('committee');
select tests.ok((select r ->> 'status' = 'confirmed' and r ->> 'receipt_code' is not null
                 from (select tests.pay('m29p', 1000, jsonb_build_array(tests.month('m29m', -2, 1000))) r) x),
  'any committee member records: confirmed at once, with a receipt');
select tests.ok((public.record_payment(gen_random_uuid(), 'سجل', 'paper', 1000, current_date,
                   jsonb_build_array(tests.month('m29m', -1, 1000))) ->> 'status') = 'confirmed',
  'paper records are no longer admin-only');
select tests.throws($$select public.set_committee_active('00000000-0000-0000-0000-0000000000a3', false)$$, 'not_admin',
  'account management stays with «مسؤول»');

select tests.set('log1', (select min(id)::text from (select id from public.activity_log(null, 3)) x));
select tests.ok((select count(*) from public.activity_log(null, 3)) = 3, 'activity log pages');
select tests.ok((select bool_and(id < tests.get('log1')::bigint) from public.activity_log(tests.get('log1')::bigint, 50)),
  'the next page starts before the last entry shown');
select tests.ok(exists (select 1 from public.activity_log(null, 200)
                        where action = 'record_payment' and actor_name = 'مشرف' and subject = 'دافع تجريبي' and amount = 1000),
  'entries name who did it, the payer and the amount');
select tests.ok(exists (select 1 from public.activity_log(null, 200) where action = 'cancel_payment' and reason = 'wrong member'),
  'a cancellation shows its reason');
select tests.ok((select count(*) = count(distinct (at, actor, action)) from public.activity_log(null, 200)),
  'one entry per action, not per changed row');

select tests.ok((select s -> 'member' ->> 'member_ref' = 'A-9101' and jsonb_array_length(s -> 'payments') = 2
                        and s -> 'payments' -> 0 ->> 'confirmed_by_name' = 'مشرف'
                        and s -> 'payments' -> 0 ->> 'recorded_by_name' = 'مشرف'
                 from (select public.member_statement(tests.id('m29m'))) x(s)),
  'the statement lists each payment with who recorded and confirmed it');
select tests.ok((select exists (select 1 from jsonb_array_elements(s -> 'payments') e
                                where e ->> 'status' = 'rejected' and e ->> 'reason' = 'duplicate of another transfer')
                 from (select public.member_statement(tests.id('K'))) x(s)),
  'the statement shows a rejected entry with its reason');
select tests.ok((select (s -> 'owed' ? 'credit') and jsonb_typeof(s -> 'months') = 'array'
                 from (select public.member_statement(tests.id('E'))) x(s)), 'the statement has the month grid, what is owed and credit');

select tests.login('admin');
select tests.set('cX', public.add_member(9103, 'أخ أ', 'A', tests.m(-1)));
select tests.set('cY', public.add_member(9104, 'أخ ب', 'A', tests.m(-1)));
select tests.set('cZ', public.add_member(9105, 'ابن عم', 'A', tests.m(-1)));
select tests.login('committee');
select tests.pay('cp1', 2000, jsonb_build_array(tests.month('cX', -1, 1000), tests.month('cY', -1, 1000)));
select tests.pay('cp2', 3000, jsonb_build_array(tests.month('cX', 0, 1000), tests.month('cY', 0, 1000), tests.month('cZ', 0, 1000)));
select tests.ok((select array_agg(full_name || ':' || times order by times desc, member_ref) from public.co_paid_members(tests.id('cX')))
                = array['أخ ب:2', 'ابن عم:1'],
  'members paid together before are suggested, most often first');
select tests.ok((select count(*) from public.co_paid_members(tests.id('cX'), 1)) = 1, 'the list is limited');
select tests.ok(not exists (select 1 from public.co_paid_members(tests.id('cX')) where member_id = tests.id('cX')), 'never the member himself');
select public.save_push_subscription('https://push.test/c29', 'p256dh-key-for-testing-000', 'auth-key-0000');
select tests.ok((select kinds = array['payment', 'expense', 'contribution', 'levy', 'cancel', 'member']
                 from public.push_subscriptions where endpoint = 'https://push.test/c29'), 'a new device gets every kind');
select public.set_push_kinds('https://push.test/c29', array['payment', 'payment', 'expense']);
select tests.ok((select kinds from public.push_subscriptions where endpoint = 'https://push.test/c29') = array['expense', 'payment'],
  'kinds are chosen per device (deduplicated)');
select tests.throws($$select public.set_push_kinds('https://push.test/c29', array['spam'])$$, 'invalid_input', 'unknown kinds are refused');
select tests.login('deputy');
select tests.throws($$select public.set_push_kinds('https://push.test/c29', array['payment'])$$, 'not_found',
  'nobody changes another person''s device');

select tests.login('former');
select tests.throws('select * from public.activity_log()', 'not_committee', 'an inactive account cannot read the activity log');
select tests.throws($$select public.member_statement(tests.id('E'))$$, 'not_committee', 'nor a statement');
select tests.throws($$select * from public.co_paid_members(tests.id('E'))$$, 'not_committee', 'nor the paid-together suggestions');
select tests.login('public');
select tests.throws('select * from public.activity_log()', '42501', 'strangers cannot read the activity log');

/* ───────────── M30: «اللوحة» levies ───────────── */

select tests.login('server');
create function tests.levy(p_member text, p_amount integer, p_campaign text default 'L1') returns jsonb language sql as $$
  select public.record_payment(gen_random_uuid(), 'دافع', 'cash', p_amount, current_date,
    jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id(p_campaign),
                                         'member_id', case when p_member is not null then tests.id(p_member) end, 'amount', p_amount)))
$$;
grant execute on function tests.levy(text, integer, text) to authenticated;
select tests.login('committee');
select tests.login('admin');
select tests.set('L1B', public.add_member(9102, 'عضو ب', 'B', tests.m(-1)));
select tests.login('committee');
select tests.login('admin');
select tests.set('L1', public.create_levy('00000000-0000-4000-8000-0000000000e1', 'مساعدة مريض', 2000,
  array[tests.id('E'), tests.id('K'), tests.id('T'), tests.id('L1B'), tests.id('E')], 'علاج', null, 1000)::text);
select tests.login('committee');
select tests.ok((select count(*) = 4 and bool_and(left_amount = expected) from public.levy_shares where campaign_id = tests.id('L1')),
  'a levy puts one share on each chosen member (duplicates ignored)');
select tests.ok((select expected from public.levy_shares where campaign_id = tests.id('L1') and member_id = tests.id('L1B')) = 1000
                and (select expected from public.levy_shares where campaign_id = tests.id('L1') and member_id = tests.id('E')) = 2000,
  'group B gets its own amount when one is given');
select tests.ok((select kind = 'levy' and amount_mode = 'per_group' from public.campaigns where id = tests.id('L1')), 'stored as a levy');

select tests.ok((tests.levy('E', 2000) ->> 'status') = 'confirmed', 'a full share is recorded and confirmed');
select tests.ok((select paid = 2000 and left_amount = 0 from public.levy_shares where campaign_id = tests.id('L1') and member_id = tests.id('E')),
  'the share is paid');
select tests.throws($$select tests.levy('E', 2000)$$, 'levy_share_paid', 'a share is paid once');
select tests.throws($$select tests.levy('K', 1000)$$, 'levy_full_share', 'a share is paid in full, not in parts');
select tests.throws($$select tests.levy('K', 3000)$$, 'levy_full_share', 'nor more than the share');
select tests.throws($$select tests.levy('m29m', 2000)$$, 'not_levy_member', 'only the levy''s members pay a share');
select tests.throws($$select tests.levy(null, 2000)$$, 'levy_member_required', 'a share is paid for a member');

select tests.login('admin');
select tests.throws($$select public.exempt_levy_share(tests.id('L1'), tests.id('K'), ' ')$$, 'reason_required', 'exempting needs a reason');
select tests.login('committee');
select tests.login('admin');
select public.exempt_levy_share(tests.id('L1'), tests.id('K'), 'ظروف صعبة');
select tests.login('committee');
select tests.ok((select exempt and left_amount = 0 from public.levy_shares where campaign_id = tests.id('L1') and member_id = tests.id('K')),
  'an exempt share owes nothing');
select tests.throws($$select tests.levy('K', 2000)$$, 'levy_exempt', 'an exempt share cannot be paid');
select tests.login('admin');
select tests.throws($$select public.exempt_levy_share(tests.id('L1'), tests.id('E'), 'x')$$, 'levy_share_paid', 'a paid share cannot be exempted');
select tests.login('committee');
select tests.ok(exists (select 1 from public.activity_log(null, 20) where action = 'exempt_levy_share' and reason = 'ظروف صعبة'),
  'the exemption is in «سجل العمليات» with its reason');
select tests.login('admin');
select public.unexempt_levy_share(tests.id('L1'), tests.id('K'));
select tests.login('committee');
select tests.ok((select not exempt and left_amount = 2000 from public.levy_shares where campaign_id = tests.id('L1') and member_id = tests.id('K')),
  'taking the exemption back makes the share owed again');

select tests.login('admin');
select public.set_levy_share(tests.id('L1'), tests.id('T'), 1500);
select tests.login('committee');
select tests.ok((tests.levy('T', 1500) ->> 'status') = 'confirmed', 'a per-member share is paid at its own amount');
select tests.login('admin');
select tests.throws($$select public.set_levy_share(tests.id('L1'), tests.id('T'), 1000)$$, 'levy_share_paid', 'a paid share keeps its amount');
select tests.login('committee');
select tests.login('admin');
select tests.ok(public.add_levy_members(tests.id('L1'), array[tests.id('K'), tests.id('m29m')], 2000) = 1,
  'adding members keeps the ones already in');
select tests.login('committee');

select tests.ok((select levy_left = 2000 and levies -> 0 ->> 'title' = 'مساعدة مريض' from public.arrears where member_id = tests.id('K')),
  'unpaid shares are arrears');
select tests.ok((select jsonb_array_length(s -> 'levies') = 1 and (s -> 'owed' ->> 'levy_left')::int = 2000
                 from (select public.member_statement(tests.id('K'))) x(s)), 'and in the member statement');

select tests.login('admin');
select public.close_campaign(tests.id('L1'), 'to_fund');
select tests.login('committee');
select tests.set('tr30', (select count(*)::text from public.transfers where from_campaign_id = tests.id('L1')));
select tests.ok((tests.levy('K', 2000) ->> 'status') = 'confirmed', 'a closed levy still takes a late share');
select tests.ok((select count(*) from public.transfers where from_campaign_id = tests.id('L1')) = tests.get('tr30')::int + 1
                and exists (select 1 from public.transfers where from_campaign_id = tests.id('L1') and amount = 2000)
                and (select paid = 2000 from public.levy_shares where campaign_id = tests.id('L1') and member_id = tests.id('K')),
  'the late share goes to the main fund, still recorded against the levy');
select tests.login('admin');
select tests.throws($$select public.add_levy_members(tests.id('L1'), array[tests.id('G')], 2000)$$, 'campaign_closed',
  'no new members on a closed levy');
select tests.login('committee');
select tests.throws($$select public.record_payment(gen_random_uuid(), 'x', 'cash', 500, current_date,
  jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('c6'), 'member_id', null, 'amount', 500)))$$,
  'campaign_closed', 'a closed donation campaign still takes nothing');

select tests.login('former');
select tests.ok((select count(*) from public.levy_shares) = 0, 'an inactive account sees no shares');
select tests.throws($$select public.create_levy(gen_random_uuid(), 'x', 100, array[tests.id('E')])$$, 'not_admin',
  'nor creates a levy');
select tests.login('public');
select tests.throws('select * from public.levy_shares', '42501', 'strangers cannot read levy shares');

/* ───────────── M29/M30: what only «مسؤول» may do (owner 2026-09-30) ───────────── */

select tests.login('committee');
create temp table admin_only (sql text) on commit drop;
insert into admin_only values
  ($$select public.cancel_payment(tests.id('m29p'), 'سبب')$$),
  ($$select public.cancel_expense(gen_random_uuid(), 'سبب')$$),
  ($$select public.create_campaign(gen_random_uuid(), 'حملة')$$),
  ($$select public.update_campaign(tests.id('c6'), 'x', null, null, null)$$),
  ($$select public.close_campaign(tests.id('c6'), 'to_fund')$$),
  ($$select public.start_handover(gen_random_uuid())$$),
  ($$select public.add_member(9199, 'x', 'A', current_date)$$),
  ($$select public.change_member_status(tests.id('m29m'), current_date, 'exempt', 'سبب')$$),
  ($$select public.change_member_group(tests.id('m29m'), current_date, 'B', 'سبب')$$),
  ($$select public.cancel_last_period(tests.id('m29m'), 'سبب')$$),
  ($$select public.create_levy(gen_random_uuid(), 'x', 100, array[tests.id('E')])$$),
  ($$select public.add_levy_members(tests.id('L1'), array[tests.id('E')], 100)$$),
  ($$select public.set_levy_share(tests.id('L1'), tests.id('E'), 100)$$),
  ($$select public.exempt_levy_share(tests.id('L1'), tests.id('E'), 'سبب')$$),
  ($$select public.unexempt_levy_share(tests.id('L1'), tests.id('E'))$$),
  ($$select public.set_committee_active('00000000-0000-0000-0000-0000000000a3', false)$$);
grant select on admin_only to authenticated;
select tests.throws(sql, 'not_admin', 'committee refused: ' || left(sql, 40)) from admin_only;
select tests.ok((tests.pay('m29q', 1000, jsonb_build_array(tests.month('m29m', 0, 1000))) ->> 'status') = 'confirmed'
                and public.record_expense(gen_random_uuid(), current_date, 'other', 100, 'لوازم') is not null,
  'every committee member records payments and expenses');
select public.update_member(tests.id('m29m'), 'عضو م٢٩ معدل', '+22200009101', null, 9101);
select tests.ok((select full_name from public.members where id = tests.id('m29m')) = 'عضو م٢٩ معدل',
  'every committee member edits member details');
select tests.login('admin');
select public.cancel_payment(tests.id('m29q'), 'خطأ');
select tests.ok((select status from public.payments where id = tests.id('m29q')) = 'cancelled', '«مسؤول» cancels a payment');

/* ───────────── M31: report reads ───────────── */

select tests.login('committee');
select tests.set('rp', public.report_period(date_trunc('year', current_date)::date, (date_trunc('year', current_date) + interval '1 year - 1 day')::date)::text);
select tests.login('server');
select tests.ok((select (r ->> 'closing')::bigint
                   = (select balance from public.fund_summary) + (select sum(balance) from public.campaign_progress)
                 from (select tests.get('rp')::jsonb r) x),
  'the year''s closing = main fund + money still held by campaigns and levies');
select tests.ok((select (r ->> 'closing')::bigint = (r ->> 'opening')::bigint + (r -> 'income' ->> 'total')::bigint
                        - (r -> 'spending' ->> 'total')::bigint + (r ->> 'adjustments')::bigint
                 from (select tests.get('rp')::jsonb r) x), 'closing = opening + income − spending + adjustments');
select tests.ok((select (r -> 'income' ->> 'total')::bigint = (r -> 'income' ->> 'fees')::bigint + (r -> 'income' ->> 'levies')::bigint
                        + (r -> 'income' ->> 'donations')::bigint and (r -> 'income' ->> 'levies')::bigint > 0
                        and jsonb_array_length(r -> 'months') = 12
                        and (select sum((m ->> 'income')::bigint) from jsonb_array_elements(r -> 'months') m) = (r -> 'income' ->> 'total')::bigint
                 from (select tests.get('rp')::jsonb r) x), 'income by source adds up, 12 months add up, levies counted');
select tests.login('committee');
select tests.ok((select (a -> 'income' ->> 'total')::bigint + (b -> 'income' ->> 'total')::bigint
                        = (c -> 'income' ->> 'total')::bigint and (b ->> 'opening')::bigint = (a ->> 'closing')::bigint
                 from (select public.report_period(date_trunc('year', current_date)::date, (current_date - 40)) a,
                              public.report_period(current_date - 39, current_date + 400) b,
                              public.report_period(date_trunc('year', current_date)::date, current_date + 400) c) x),
  'two periods chain: the second opens with the first''s closing');
select tests.throws($$select public.report_period(current_date, current_date - 1)$$, 'invalid_input', 'a period ends after it starts');
select tests.ok((select sum(in_amount) from public.report_wallets('2000-01-01', '2100-01-01'))
                = (select sum(amount) from public.payments where status = 'confirmed' and method::text <> 'credit')
                and (select sum(out_amount) from public.report_wallets('2000-01-01', '2100-01-01'))
                = (select sum(amount) from public.expenses where cancelled_at is null),
  'wallets add up to the confirmed money in and every expense out');
-- an expense names its wallet (a fund account or cash) from m31; older ones are «غير محدد» (method null)
select tests.set('w1', public.record_expense(gen_random_uuid(), current_date, 'other', 700, 'وقود', null, null, tests.id('acc'))::text);
select tests.set('w2', public.record_expense(gen_random_uuid(), current_date, 'other', 300, 'ماء', null, null, null, true)::text);
select tests.ok((select out_amount >= 700 from public.report_wallets(current_date, current_date) where method = 'bankily')
                and (select out_amount >= 300 from public.report_wallets(current_date, current_date) where method = 'cash'),
  'money out per wallet from the expense''s wallet');
select tests.ok(exists (select 1 from public.report_wallets('2000-01-01', '2100-01-01') where method is null and out_amount > 0),
  'older expenses without a wallet are counted as not specified');
select tests.throws($$select public.record_expense(gen_random_uuid(), current_date, 'other', 1, 'x', null, null, tests.id('acc'), true)$$,
  'invalid_input', 'an expense is paid from one wallet or cash, not both');
-- a donation from someone who is not a member: a name on the row
select tests.login('admin');
select tests.set('cd', public.create_campaign(gen_random_uuid(), 'تبرع مفتوح')::text);
select tests.login('committee');
select tests.ok((public.record_payment(gen_random_uuid(), 'تحويل جماعي', 'bankily', 1500, current_date,
                   jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('cd'), 'member_id', null,
                                                        'amount', 1500, 'donor_name', ' متبرع من خارج الصندوق '))) ->> 'status') = 'confirmed',
  'a non-member donation is recorded with the donor''s name');
select tests.throws($$select public.record_payment(gen_random_uuid(), 'x', 'cash', 100, current_date,
  jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('cd'), 'member_id', tests.id('E'),
                                       'amount', 100, 'donor_name', 'x')))$$, '23514', 'a donor name is only for a non-member');
select tests.login('server');
select tests.ok((select contributor_name from public.campaign_contributions where campaign_id = tests.id('cd')) = 'متبرع من خارج الصندوق',
  'the campaign lists the donor by name');
select tests.login('committee');
select tests.ok((select payments_count > 0 and cancellations > 0 from public.report_committee_work('2000-01-01', '2100-01-01')
                 where display_name = 'المدير'), 'committee work counts records and cancellations per person');
select tests.login('former');
select tests.throws($$select public.report_period(current_date, current_date)$$, 'not_committee', 'reports are committee only');
select tests.login('public');
select tests.throws($$select * from public.report_wallets(current_date, current_date)$$, '42501', 'strangers get no report');

/* ───────────── M32: «الإحصاءات» analytics ───────────── */

select tests.login('committee');
select tests.set('fs', public.report_fee_stats(extract(year from current_date)::int)::text);
select tests.ok((select (o ->> 'paid_up')::int + (o ->> 'owe_1')::int + (o ->> 'owe_2_3')::int + (o ->> 'owe_4plus')::int
                        = (o ->> 'active')::int and (o ->> 'active')::int > 0
                 from (select tests.get('fs')::jsonb -> 'overall' o) x), 'paid up + owing buckets = active members');
select tests.ok((select sum((g ->> 'active')::int) from jsonb_array_elements(tests.get('fs')::jsonb -> 'groups') g)
                = (tests.get('fs')::jsonb -> 'overall' ->> 'active')::int, 'groups add up to the whole');
select tests.ok((select bool_and((m ->> 'paid')::int + (m ->> 'unpaid')::int <= (m ->> 'active')::int)
                        and count(*) = 12
                 from jsonb_array_elements(tests.get('fs')::jsonb -> 'months') m), '12 months, paid + unpaid within active');
select tests.ok((tests.get('fs')::jsonb ->> 'ref_month')::int = extract(month from current_date)::int
                and (public.report_fee_stats(extract(year from current_date)::int - 1) ->> 'ref_month')::int = 12,
  'this year counts to this month, last year to December');
select tests.ok(tests.get('fs') !~ 'full_name|member_ref|عضو', 'no names in the fee analytics');
-- a new member paid up this year moves the numbers by one
select tests.login('admin');
select tests.set('sX', public.add_member(9301, 'إحصاء', 'B', date_trunc('month', current_date)::date));
select tests.login('committee');
select tests.pay('sXp', 500, jsonb_build_array(tests.month('sX', 0, 500)));
select tests.ok((select (n ->> 'active')::int = (o ->> 'active')::int + 1 and (n ->> 'paid_up')::int = (o ->> 'paid_up')::int + 1
                 from (select tests.get('fs')::jsonb -> 'overall' o,
                              public.report_fee_stats(extract(year from current_date)::int) -> 'overall' n) x),
  'a new active member who paid counts as paid up');

select tests.ok((select (l ->> 'shares')::int = (l ->> 'paid')::int + (l ->> 'unpaid')::int + (l ->> 'exempt')::int
                        and (l ->> 'paid')::int = 3 and (l ->> 'collected')::int = 5500
                        and (l ->> 'expected')::int = (select sum(expected) from public.levy_shares where campaign_id = tests.id('L1') and not exempt)
                        and jsonb_array_length(l -> 'groups') = 2
                 from (select public.report_levy_stats(tests.id('L1')) -> 0 l) x),
  'levy analytics: paid / not yet / exempt, collected vs expected, per group');
select tests.ok((select (d ->> 'outside_givers')::int = 1 and (d ->> 'member_givers')::int = 0 and (d ->> 'collected')::int = 1500
                        and (d ->> 'active_members')::int > 0
                 from (select public.report_donation_stats(tests.id('cd')) -> 0 d) x),
  'donation analytics: members and outside donors, collected');
select tests.ok(jsonb_array_length(public.report_levy_stats()) >= 1 and jsonb_array_length(public.report_donation_stats()) >= 2,
  'all levies and donations at once');
select tests.login('former');
select tests.throws($$select public.report_fee_stats(2026)$$, 'not_committee', 'analytics are committee only');
select tests.login('public');
select tests.throws($$select public.report_levy_stats()$$, '42501', 'strangers get no analytics');

/* ───────────── M33: fee groups («الفئات») ───────────── */

select tests.login('committee');
select tests.throws($$select public.set_group_price('A', extract(year from current_date)::int + 1, 1200)$$, 'not_admin',
  'changing a fee is «مسؤول» only');
select tests.throws($$select public.create_group('ج', 700, extract(year from current_date)::int)$$, 'not_admin',
  'creating a group is «مسؤول» only');
select tests.login('admin');
select public.set_group_price('A', extract(year from current_date)::int + 1, 1200);
select tests.ok((select monthly_amount from public.group_prices gp join public.groups g on g.id = gp.group_id
                 where g.code = 'A' and gp.year = extract(year from current_date) + 1) = 1200, '«مسؤول» sets next year''s fee');
select tests.ok(public.create_group('ج', 700, extract(year from current_date)::int) = 'D', 'a new group gets the next free letter');
select tests.ok(public.create_group('د', 800, extract(year from current_date)::int) = 'E', 'and the one after');
select tests.throws($$select public.create_group(' ج ', 900, 2030::int)$$, 'group_name_taken', 'group names are unique');

-- a mid-year move: past months keep their fee
select tests.set('mv1', public.add_member(9401, 'منتقل', 'A', tests.m(-3)));
select tests.login('committee');
select tests.pay('mv1p', 1000, jsonb_build_array(tests.month('mv1', -3, 1000)));
select tests.throws($$select public.move_members_to_group('D', tests.m(-1), array[tests.id('mv1')])$$, 'not_admin',
  'moving members is «مسؤول» only');
select tests.login('admin');
select tests.set('ln', (select list_code || '-' || number from public.members where id = tests.id('mv1')));
select tests.ok(public.move_members_to_group('D', tests.m(-1), array[tests.id('mv1')]) = 1, 'a chosen member moves');
select tests.login('server');
select tests.ok(app_private.price_at(tests.id('mv1'), extract(year from tests.m(-2))::int, extract(month from tests.m(-2))::int) = 1000
                and app_private.price_at(tests.id('mv1'), extract(year from tests.m(-1))::int, extract(month from tests.m(-1))::int) = 700
                and (select amount from public.payment_months where payment_id = tests.id('mv1p')) = 1000,
  'months before the move keep the old fee, later months take the new one, a paid month is untouched');
select tests.login('admin');
select tests.ok((select list_code || '-' || number from public.members where id = tests.id('mv1')) = tests.get('ln'),
  'the paper list number does not change');

-- a month already paid from the start month: refused
select tests.set('mv2', public.add_member(9402, 'دفع مقدمًا', 'A', tests.m(-2)));
select tests.login('committee');
select tests.pay('mv2p', 1000, jsonb_build_array(tests.month('mv2', 0, 1000)));
select tests.login('admin');
select tests.throws($$select public.move_members_to_group('D', tests.m(0), array[tests.id('mv2')])$$, 'months_already_paid_after',
  'never change a month already paid');

-- a whole group at once, then again (nothing left to move)
select tests.set('mv3', public.add_member(9403, 'ج ١', 'D', tests.m(-2)));
select tests.set('mv4', public.add_member(9404, 'ج ٢', 'D', tests.m(-2)));
select tests.ok(public.move_members_to_group('E', tests.m(0), null, 'D') = 3, 'a whole group moves');
select tests.ok(public.move_members_to_group('E', tests.m(0), null, 'D') = 0, 'a repeat moves nobody');
select tests.throws($$select public.move_members_to_group('E', tests.m(0))$$, 'invalid_input', 'members or a group, one of them');
select tests.ok((select members from public.groups_overview(extract(year from current_date)::int) where code = 'E') = 3
                and (select members from public.groups_overview(extract(year from current_date)::int) where code = 'D') = 0
                and (select fee from public.groups_overview(extract(year from current_date)::int) where code = 'D') = 700
                and (select next_year_fee from public.groups_overview(extract(year from current_date)::int) where code = 'A') = 1200,
  'groups overview: fees this year and next, members now');

-- retire
select tests.throws($$select public.retire_group('E', extract(year from current_date)::int + 1)$$, 'group_has_members',
  'a group with members cannot be retired');
select public.retire_group('D', extract(year from current_date)::int + 1);
select tests.ok((select retired_from from public.groups where code = 'D') = extract(year from current_date) + 1, 'an empty group is retired');
select tests.throws($$select public.add_member(9405, 'x', 'D', make_date(extract(year from current_date)::int + 1, 1, 1))$$,
  'group_retired', 'nobody joins a retired group');
select tests.throws($$select public.set_group_price('D', extract(year from current_date)::int + 1, 900)$$, 'group_retired',
  'no fee for a retired year');
select tests.ok(exists (select 1 from public.activity_log(null, 50) where action = 'move_members_to_group'),
  'moves are in «سجل العمليات»');
select tests.ok((select g ? 'expected' and g ? 'collected' from jsonb_array_elements(public.report_levy_stats(tests.id('L1')) -> 0 -> 'groups') g limit 1),
  'levy analytics carry expected and collected per group');
select tests.login('committee');
select tests.ok((select count(*) from public.groups_overview(extract(year from current_date)::int)) = 5, 'every committee member reads the groups');
select tests.login('public');
select tests.throws($$select * from public.groups_overview(2026::int)$$, '42501', 'strangers do not');

/* ───────────── M16: backup snapshot and job runs ───────────── */

select tests.login('server');
select tests.ok((select jsonb_array_length(x -> 'members') = (select count(*) from public.members)
                        and jsonb_array_length(x -> 'audit_log') = (select count(*) from public.audit_log)
                        and x ?& array['members', 'audit_log'] and not x ? 'payments'
                 from (select public.backup_snapshot(array['members', 'audit_log']) x) s),
  'backup_snapshot returns exactly the listed tables, every row');
select tests.throws($$select public.backup_snapshot(array['members', 'nope'])$$, 'invalid_input', 'unknown tables are refused');
select tests.throws($$select public.backup_snapshot(array['users'])$$, 'invalid_input', 'only public tables');
insert into public.job_runs (job, last_run_at, ok, detail, last_ok_at) values ('backup', now(), true, '2026/2026-09-28.json', now());
select tests.login('admin');
select tests.throws($$select public.backup_snapshot(array['members'])$$, '42501', 'the committee cannot call backup_snapshot');
select tests.ok((select ok from public.job_runs where job = 'backup'), 'the committee reads the last backup result');
select tests.throws($$insert into public.job_runs (job, last_run_at, ok) values ('backup', now(), false)$$, '42501',
  'the committee cannot write job runs');
select tests.login('public');
select tests.throws($$select public.backup_snapshot(array['members'])$$, '42501', 'anon cannot call backup_snapshot');
select tests.throws('select * from public.job_runs', '42501', 'anon cannot read job runs');

/* ───────────── M8: terms and handover (keep last: it deactivates committee accounts) ───────────── */

select tests.login('public');
select tests.login('server');
select tests.ok((select term_number from public.fund_summary) = 1, 'the fund is in term 1');
select tests.ok((select count(*) from public.terms_public) = 1, 'the server reads the terms list');
select tests.login('public');
select tests.throws('select * from public.handovers', '42501', 'anon cannot read handovers');
select tests.throws('select * from public.handovers_admin', '42501', 'anon cannot read the handover view');
select tests.login('server');
select tests.throws($$insert into public.terms (number, started_on, opening_balance) values (9, current_date, 0)$$, '23505',
  'only one open term');

select tests.login('former');
select tests.throws($$select public.start_handover(gen_random_uuid())$$, 'not_admin', 'an inactive account cannot start a handover');
select tests.login('treasurer');
select tests.login('admin');
select tests.set('h1', public.start_handover('00000000-0000-0000-0000-0000000000d1', 'نهاية الدورة'));
select tests.login('treasurer');
select tests.login('admin');
select tests.throws($$select public.start_handover(gen_random_uuid())$$, 'handover_in_progress', 'one handover at a time');
select tests.login('treasurer');
select tests.login('admin');
select tests.throws($$select public.submit_handover(tests.id('h1'))$$, 'counted_required', 'cannot submit without counted money');
select tests.login('treasurer');
select tests.set('bal8', app_private.current_balance());
select tests.login('admin');
select public.update_handover_draft(tests.id('h1'),
  jsonb_build_array(jsonb_build_object('label', 'نقداً', 'method', 'cash', 'amount', 700),
                    jsonb_build_object('label', 'بنكيلي', 'method', 'bankily', 'amount', tests.get('bal8')::int - 1200)),
  array['00000000-0000-0000-0000-0000000000a3'::uuid]);
select tests.login('treasurer');
select tests.login('admin');
select tests.throws($$select public.update_handover_draft(tests.id('h1'), '[{"label":"x","amount":-5}]'::jsonb)$$, 'invalid_input',
  'negative counted amounts are refused');
select tests.login('treasurer');
select tests.login('admin');
select public.submit_handover(tests.id('h1'));
select tests.login('treasurer');
select tests.throws($$select public.accept_handover(tests.id('h1'))$$, 'not_admin', 'the treasurer cannot accept');
-- money confirmed between submit and accept is fund activity, not a handover difference (audit H1)
select tests.pay('hp', 1000, jsonb_build_array(jsonb_build_object('kind', 'credit', 'member_id', tests.id('K'), 'amount', 1000)));
select tests.login('deputy');
select public.confirm_payment(tests.id('hp'));
select tests.login('admin');
select tests.ok(public.accept_handover(tests.id('h1'), 'الدورة الثانية') = 2, '«مسؤول» does the handover alone: term 2 opens');
select tests.ok(public.accept_handover(tests.id('h1')) = 2, 'accepting twice is a no-op');
select tests.login('public');
select tests.login('server');
select tests.ok((select term_number from public.fund_summary) = 2, 'fund is now in term 2');
select tests.ok((select balance from public.fund_summary) = tests.get('bal8')::int - 500 + 1000,
  'balance = counted money + the payment confirmed after submit (difference booked at submit)');
select tests.ok((select closing_balance from public.terms_public where number = 1) = tests.get('bal8')::int + 500
                and (select ended_on from public.terms_public where number = 1) is not null
                and (select opening_balance from public.terms_public where number = 2) = tests.get('bal8')::int + 500,
  'term 1 closes at the balance at acceptance; term 2 opens with it');
select tests.ok((select amount from public.activity_feed where kind = 'balance_adjustment') = -500,
  'the handover difference is public as «فرق عند التسليم»');
select tests.login('public');
select tests.login('server');
select tests.ok((select difference from public.handovers where id = tests.id('h1')) = -500, 'difference recorded');
select tests.ok((select array_agg(display_name order by display_name) from public.committee where active) = array['المدير', 'النائب'],
  'only the carried-over deputy and «مسؤول» stay active');

select tests.login('admin');
select tests.set('h2', public.start_handover(gen_random_uuid()));
select public.update_handover_draft(tests.id('h2'), '[{"label":"نقداً","amount":10}]'::jsonb);
select public.submit_handover(tests.id('h2'));
select public.cancel_handover(tests.id('h2'), 'خطأ');
select tests.ok((select status from public.handovers where id = tests.id('h2')) = 'cancelled', 'a handover can be cancelled with a reason');

rollback;
