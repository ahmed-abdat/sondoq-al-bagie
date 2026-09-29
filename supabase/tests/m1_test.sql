-- ════════════════════════════════════════════════════════════════════════════════════════
-- Schema tests for ALL migrations (m1 … m14; the name is historical). Plain SQL, no pgTAP. ONE transaction, rolled back at the end: safe on a
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
select tests.ok((select count(*) from public.member_status where number between 1001 and 1005) = 5, 'anon reads member_status');
select tests.ok((select ok from public.keepalive), 'anon reads the keepalive view');
select tests.ok((select count(*) from public.fund_summary) = 1, 'anon reads fund_summary');
select tests.ok((select count(*) from public.monthly_collection) > 0, 'anon reads monthly_collection');
select tests.ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name in ('member_status','member_months','fund_summary','monthly_collection',
        'expense_totals','recent_expenses','campaign_progress','activity_feed','campaign_contributions',
        'fund_accounts_public','fund_info')
    and column_name ~ '(phone|proof|txn|payer|receipt_path)'), 'public views expose no phone/proof/txn/payer/receipt image columns');
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
update public.settings set grace_days = 0, show_amount_owed = true where id;
select tests.login('public');
select tests.ok((select months_behind from public.member_status where number = 1001) = 2, 'grace 0: this month is owed at once');
select tests.ok((select amount_owed from public.member_status where number = 1002) = 1000, 'amount owed shown once enabled (2 × 500)');
select tests.login('server');
update public.settings set grace_days = 10, show_amount_owed = false where id;

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

/* ───────────── M2: fund accounts, contact, payment queue, undo ───────────── */

select tests.login('admin');
select tests.set('acc', public.add_fund_account('bankily', '2222 3333', 'صندوق الرابطة', null, 1));
select tests.ok((select account_number from public.fund_accounts where id = tests.id('acc')) = '22223333', 'account number stored without spaces');
select tests.throws($$select public.add_fund_account('bankily', '22223333', 'x')$$, 'account_exists', 'same active wallet number twice');
select tests.throws($$select public.add_fund_account('cash', '22223333', 'x')$$, 'not_a_wallet', 'cash is not a wallet account');
select tests.set('acc2', public.add_fund_account('click', '44445555', 'أمين الصندوق', 'رقم ثان', 2));
select public.update_settings(p_whatsapp_contact => '+222 3333 4444');
select tests.login('committee');
select tests.throws($$select public.add_fund_account('masrvi', '11112222', 'x')$$, 'not_admin', 'committee cannot add accounts');
select tests.throws($$select public.update_settings(p_whatsapp_contact => '+22200000000')$$, 'not_admin', 'committee cannot change settings');
select tests.login('public');
select tests.ok((select count(*) from public.fund_accounts_public) = 2, 'anon reads active fund accounts');
select tests.ok((select whatsapp_contact from public.fund_info) = '+22233334444', 'anon reads the WhatsApp contact');
select tests.throws('select * from public.fund_accounts', '42501', 'anon cannot read the fund_accounts table');
select tests.throws('select * from public.payment_queue', '42501', 'anon cannot read the payment queue');
select tests.login('admin');
select public.update_fund_account(tests.id('acc2'), 'أمين الصندوق', null, 2, false);
select tests.login('public');
select tests.ok((select count(*) from public.fund_accounts_public) = 1, 'deactivated account hidden from the public');
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
select tests.login('deputy');
select tests.throws($$select public.undo_payment(tests.id('u1'))$$, 'undo_expired', 'only the recorder can undo');
select tests.login('committee');
select public.undo_payment(tests.id('u1'));
select tests.ok((select status from public.payments where id = tests.id('u1')) = 'cancelled', 'undo cancels the payment');
select tests.ok((select cancel_reason from public.payments where id = tests.id('u1')) = 'undo', 'undo reason recorded');
select public.undo_payment(tests.id('u1'));   -- repeat is a no-op
select tests.login('deputy');
select tests.set('u2', (public.record_payment(gen_random_uuid(), 'دافع', 'cash', 1000, current_date,
  jsonb_build_array(tests.month('E', 0, 1000))) ->> 'id'));
select tests.ok((select status from public.payments where id = tests.id('u2')) = 'confirmed', 'deputy payment confirmed');
select public.undo_payment(tests.id('u2'));
select tests.ok(not exists (select 1 from public.payment_months where payment_id = tests.id('u2') and released_at is null),
  'undo of a confirmed payment releases its months');
select tests.login('server');
select tests.set('n_conf', (select count(*) from public.payments where status = 'confirmed' and method <> 'paper'));
select tests.login('public');
select tests.ok((select count(*) from public.activity_feed where kind = 'payment_confirmed') = least(30, tests.get('n_conf')::int),
  'activity feed lists confirmed payments only (undone/cancelled ones drop out)');
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

select tests.login('public');
select tests.set('v', public.verify_receipt(lower(' ' || tests.get('r1_code') || ' ')));
select tests.ok(tests.get('v')::jsonb ->> 'status' = 'valid', 'anon verifies a receipt (case/space-insensitive)');
select tests.ok(tests.get('v')::jsonb -> 'members' -> 0 ->> 'number' = '1005', 'receipt lists the member number');
select tests.ok(jsonb_array_length(tests.get('v')::jsonb -> 'members' -> 0 -> 'months') = 1, 'receipt lists the months');
select tests.ok(not (tests.get('v')::jsonb ? 'phone') and not (tests.get('v')::jsonb ? 'proof_path'), 'no phone or proof on a receipt');
select tests.ok(tests.get('v')::jsonb ->> 'confirmed_by_name' = 'الأمين', 'receipt names the confirmer');
select tests.ok((select receipt_code from public.activity_feed where payment_id = tests.id('r1')) = tests.get('r1_code')
  and (select amount from public.activity_feed where payment_id = tests.id('r1')) = 1000, 'feed shows amount and receipt code');
select tests.ok(public.verify_receipt('BQ-ZZZZ-9999') ->> 'status' = 'not_found', 'unknown code → not_found');
select tests.throws('select * from public.receipt_counters', '42501', 'anon cannot read receipt counters');
select tests.login('treasurer');
select public.cancel_payment(tests.id('r1'), 'خطأ في التسجيل');
select tests.login('public');
select tests.ok(public.verify_receipt(tests.get('r1_code')) ->> 'status' = 'cancelled', 'a cancelled payment verifies as cancelled');

select tests.login('server');
insert into public.campaigns (id, title, amount_mode) values ('00000000-0000-0000-0000-00000000c002', 'حملة اختبار', 'open');
select tests.set('camp2', '00000000-0000-0000-0000-00000000c002'::uuid);
select tests.login('treasurer');
select public.record_payment(gen_random_uuid(), 'متبرع من الخارج', 'bankily', 2000, current_date,
  jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('camp2'), 'member_id', null, 'amount', 2000)), 'TXN-C1234');
select tests.login('public');
select tests.ok((select contributor_name from public.campaign_contributions where campaign_id = tests.id('camp2')) = 'متبرع من الخارج'
  and (select amount from public.campaign_contributions where campaign_id = tests.id('camp2')) = 2000,
  'campaign contributions list the donor and amount');
select tests.ok(public.verify_receipt((select receipt_code from public.activity_feed where amount = 2000 and kind = 'payment_confirmed' limit 1))
  ->> 'txn_ref_last4' = '1234', 'receipt shows only the last 4 of the transaction number');

select tests.login('server');
select tests.ok((public.record_payment(gen_random_uuid(), 'سجل', 'paper', 1000, current_date,
  jsonb_build_array(tests.month('K', 3, 1000))) ->> 'status') = 'confirmed', 'paper payment confirmed by the server');
select tests.ok(not exists (select 1 from public.payments where method = 'paper' and receipt_code is not null),
  'paper imports get no receipt');

/* ───────────── M6: campaigns ───────────── */

select tests.login('committee');
select tests.throws($$select public.create_campaign(gen_random_uuid(), 'حملة')$$, 'not_allowed', 'plain committee cannot open a campaign');
select tests.login('treasurer');
select tests.set('c6', public.create_campaign('00000000-0000-0000-0000-00000000c006', 'ترميم', 'fixed', 'السقف', 20000, null,
  jsonb_build_array(jsonb_build_object('member_id', tests.id('E'), 'expected_amount', 3000))));
select public.create_campaign('00000000-0000-0000-0000-00000000c006', 'ترميم');   -- retry is a no-op
select tests.ok((select count(*) from public.campaigns where id = tests.id('c6')) = 1, 'retried create adds nothing');
-- one transfer pays a month and the campaign
select tests.ok((public.record_payment(gen_random_uuid(), 'دافع', 'bankily', 4000, current_date,
  jsonb_build_array(tests.month('E', 1, 1000),
                    jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('c6'), 'member_id', tests.id('E'), 'amount', 3000)))
  ->> 'status') = 'confirmed', 'one payment splits a month and a campaign');
select public.update_campaign(tests.id('c6'), 'ترميم المسجد', 'السقف', 25000, current_date + 30);
select public.record_expense(gen_random_uuid(), current_date, 'other', 1000, 'مواد', tests.id('c6'));
select tests.login('public');
select tests.ok((select collected = 3000 and spent = 1000 and balance = 2000 and participants_paid = 1 and target_amount = 25000
                 from public.campaign_progress where campaign_id = tests.id('c6')), 'campaign progress after split payment, edit and expense');
select tests.set('bal6', (select balance from public.fund_summary));
select tests.login('treasurer');
select tests.ok(public.close_campaign(tests.id('c6'), 'to_fund') = 2000, 'closing moves the surplus to the fund');
select tests.ok(public.close_campaign(tests.id('c6'), 'to_fund') = 0, 'closing twice is a no-op');
select tests.throws($$select public.update_campaign(tests.id('c6'), 'x', null, null, null)$$, 'campaign_closed', 'closed campaigns are not edited');
select tests.throws($$select public.record_payment(gen_random_uuid(), 'دافع', 'cash', 500, current_date,
  jsonb_build_array(jsonb_build_object('kind', 'campaign', 'campaign_id', tests.id('c6'), 'member_id', null, 'amount', 500)))$$,
  'campaign_closed', 'no contributions after closing');
select tests.login('public');
select tests.ok((select balance from public.fund_summary) = tests.get('bal6')::int + 2000, 'main fund balance grows by the surplus');
select tests.ok((select balance from public.campaign_progress where campaign_id = tests.id('c6')) = 0, 'campaign balance is zero after transfer');

select tests.login('public');
select tests.ok((select monthly_amount from public.group_prices_public
                 where group_code = 'B' and year = extract(year from current_date)) = 500, 'anon reads group prices');

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
select tests.ok((select member_ref || ' ' || status_label from public.member_status where member_id = tests.id('LA')) = 'A-7 غادر',
  'public status shows list reference and «غادر»');
select tests.ok((select members_active from public.fund_summary)
                = (select count(*) from public.member_status where member_status = 'active'), 'active count');
select tests.ok((select members_ok + members_behind from public.fund_summary) = (select members_active from public.fund_summary),
  'up to date + late = active members');
select tests.throws('select * from public.members_admin', '42501', 'anon cannot read members_admin');
select tests.login('former');   -- signed in but not an active committee member
select tests.ok((select count(*) from public.members_admin) = 0 and (select count(*) from public.arrears) = 0
                and (select count(*) from public.payment_queue) = 0, 'non-committee accounts see no member/arrears/payment rows');

/* ───────────── admin confirms payments (owner decision) ───────────── */

select tests.login('committee');
select tests.set('ac1', tests.pay('ac1', 500, jsonb_build_array(tests.month('LB', -1, 500))) ->> 'id');
select tests.login('admin');
select tests.ok((public.confirm_payment(tests.id('ac1')) ->> 'status') = 'confirmed', 'the admin confirms a pending payment');
select tests.login('committee');
select tests.set('ac2', tests.pay('ac2', 500, jsonb_build_array(tests.month('LB', -2, 500))) ->> 'id');
select tests.login('admin');
select public.reject_payment(tests.id('ac2'), 'صورة غير واضحة');
select tests.ok((select status from public.payments where id = tests.id('ac2')) = 'rejected', 'the admin rejects a pending payment');
select tests.login('server');
select public.set_committee_member('00000000-0000-0000-0000-0000000000a1', 'المدير', 'admin', tests.id('LB'));
select tests.login('committee');
select tests.set('ac3', tests.pay('ac3', 500, jsonb_build_array(tests.month('LB', -3, 500))) ->> 'id');
select tests.login('admin');
select tests.throws($$select public.confirm_payment(tests.id('ac3'))$$, 'own_membership',
  'the admin cannot confirm a payment covering their own membership');
select tests.login('server');
select public.set_committee_member('00000000-0000-0000-0000-0000000000a1', 'المدير', 'admin', null);
select tests.login('committee');
select tests.throws($$select public.confirm_payment(tests.id('ac3'))$$, 'not_confirmer', 'plain committee still cannot confirm');

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
                   and connamespace = 'public'::regnamespace) = 23,
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
select public.verify_receipt('BQ-XXXX-0000');
select tests.ok(true, 'anon still verifies receipts through the wrapper');

/* ───────────── M8: terms and handover (keep last: it deactivates committee accounts) ───────────── */

select tests.login('public');
select tests.ok((select term_number from public.fund_summary) = 1, 'the fund is in term 1');
select tests.ok((select count(*) from public.terms_public) = 1, 'anon reads the terms list');
select tests.throws('select * from public.handovers', '42501', 'anon cannot read handovers');
select tests.throws('select * from public.handovers_admin', '42501', 'anon cannot read the handover view');
select tests.login('server');
select tests.throws($$insert into public.terms (number, started_on, opening_balance) values (9, current_date, 0)$$, '23505',
  'only one open term');

select tests.login('committee');
select tests.throws($$select public.start_handover(gen_random_uuid())$$, 'not_allowed', 'a plain committee member cannot start a handover');
select tests.login('treasurer');
select tests.set('h1', public.start_handover('00000000-0000-0000-0000-0000000000d1', 'نهاية الدورة'));
select tests.throws($$select public.start_handover(gen_random_uuid())$$, 'handover_in_progress', 'one handover at a time');
select tests.throws($$select public.submit_handover(tests.id('h1'))$$, 'counted_required', 'cannot submit without counted money');
select tests.set('bal8', app_private.current_balance());
select public.update_handover_draft(tests.id('h1'),
  jsonb_build_array(jsonb_build_object('label', 'نقداً', 'method', 'cash', 'amount', 700),
                    jsonb_build_object('label', 'بنكيلي', 'method', 'bankily', 'amount', tests.get('bal8')::int - 1200)),
  array['00000000-0000-0000-0000-0000000000a3'::uuid]);
select tests.throws($$select public.update_handover_draft(tests.id('h1'), '[{"label":"x","amount":-5}]'::jsonb)$$, 'invalid_input',
  'negative counted amounts are refused');
select public.submit_handover(tests.id('h1'));
select tests.throws($$select public.accept_handover(tests.id('h1'))$$, 'not_admin', 'the treasurer cannot accept');
-- money confirmed between submit and accept is fund activity, not a handover difference (audit H1)
select tests.pay('hp', 1000, jsonb_build_array(jsonb_build_object('kind', 'credit', 'member_id', tests.id('K'), 'amount', 1000)));
select tests.login('deputy');
select public.confirm_payment(tests.id('hp'));
select tests.login('admin');
select tests.ok(public.accept_handover(tests.id('h1'), 'الدورة الثانية') = 2, 'the incoming admin accepts: term 2 opens');
select tests.ok(public.accept_handover(tests.id('h1')) = 2, 'accepting twice is a no-op');
select tests.login('public');
select tests.ok((select term_number from public.fund_summary) = 2, 'fund is now in term 2');
select tests.ok((select balance from public.fund_summary) = tests.get('bal8')::int - 500 + 1000,
  'balance = counted money + the payment confirmed after submit (difference booked at submit)');
select tests.ok((select closing_balance from public.terms_public where number = 1) = tests.get('bal8')::int + 500
                and (select ended_on from public.terms_public where number = 1) is not null
                and (select opening_balance from public.terms_public where number = 2) = tests.get('bal8')::int + 500,
  'term 1 closes at the balance at acceptance; term 2 opens with it');
select tests.ok((select amount from public.activity_feed where kind = 'balance_adjustment') = -500,
  'the handover difference is public as «فرق عند التسليم»');
select tests.login('server');
select tests.ok((select difference from public.handovers where id = tests.id('h1')) = -500, 'difference recorded');
select tests.ok((select array_agg(display_name order by display_name) from public.committee where active) = array['المدير', 'النائب'],
  'only the carried-over deputy and the accepting admin stay active');

select tests.login('admin');
select tests.set('h2', public.start_handover(gen_random_uuid()));
select public.update_handover_draft(tests.id('h2'), '[{"label":"نقداً","amount":10}]'::jsonb);
select public.submit_handover(tests.id('h2'));
select tests.throws($$select public.accept_handover(tests.id('h2'))$$, 'same_person', 'the admin who submitted cannot also accept');
select public.cancel_handover(tests.id('h2'), 'خطأ');
select tests.ok((select status from public.handovers where id = tests.id('h2')) = 'cancelled', 'a handover can be cancelled with a reason');

rollback;
