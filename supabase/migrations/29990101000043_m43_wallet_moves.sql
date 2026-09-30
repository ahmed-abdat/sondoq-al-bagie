-- ════════════════════════════════════════════════════════════════════════════════════════
-- M43 · wallet balances and moves («المحافظ», owner 2026-09-30): usually one number per wallet; at
-- each handover all money is taken out to cash and handed over, then new money comes into the
-- wallets. So:
-- - Where the money is: a payment sits in its account (or its wallet when it names no account);
--   cash payments, paper-sheet payments, expenses without a wallet, the fund's opening balance
--   (settings) and the handover differences sit in cash. Every wallet and cash have a balance by
--   default: everything in − everything out ± moves, from the start of the records (no reset at a
--   handover: taking the money out to cash is recorded as moves, so a forgotten one stays visible).
--   The manual opening (set_fund_account_opening / set_cash_opening, m41) stays as an override.
-- - wallet_transfers + record_wallet_transfer(id, from account | cash, to account | cash, amount,
--   date, note): any committee member; a stopped account can still be emptied; never income or
--   spending, never the fund balance. cancel_wallet_transfer(id, reason): «المسؤول», like expenses.
-- - replace_wallet_account(wallet type, number, holder) «المسؤول»: stops the wallet's active
--   account(s) and adds the new number in one step; old payments keep the old account.
--   correct_wallet_account(id, number, holder) «المسؤول»: fixes a typo in place, only while nothing
--   (payment, expense, move) uses the account (also refused by a trigger).
-- - report_wallets: + transfer_in / transfer_out; a balance on every account, wallet and cash row
--   (opening_balance / opening_on = the manual override, null by default); rows with money left
--   stay listed; paper and expenses without a wallet keep their own rows (in/out only).
-- - activity_log: moves are money actions. accuracy_audit(): 31 checks (+ wallets add up to all the
--   money; no wallet below 0).
-- Bodies = pg_get_functiondef at m42, changed where marked. Undo: supabase/rollback/m43_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

/* ───────────────────────── wallet_transfers ───────────────────────── */

create table public.wallet_transfers (
  id                  uuid primary key default gen_random_uuid(),
  -- cash = the cash wallet type and no account
  from_wallet_type_id smallint not null references public.wallet_types (id),
  from_account_id     uuid references public.fund_accounts (id),
  to_wallet_type_id   smallint not null references public.wallet_types (id),
  to_account_id       uuid references public.fund_accounts (id),
  amount              integer not null check (amount > 0),
  moved_on            date not null,
  note                text check (note is null or length(note) <= 500),
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id),
  cancelled_at        timestamptz,
  cancelled_by        uuid references auth.users (id),
  cancel_reason       text,
  constraint wallet_transfers_two_places check (from_account_id is distinct from to_account_id),
  constraint wallet_transfers_cancel_reason check (cancelled_at is null or btrim(coalesce(cancel_reason, '')) <> '')
);
create index wallet_transfers_moved_on_idx on public.wallet_transfers (moved_on desc);
create index wallet_transfers_from_type_idx on public.wallet_transfers (from_wallet_type_id);
create index wallet_transfers_to_type_idx on public.wallet_transfers (to_wallet_type_id);
create index wallet_transfers_from_account_idx on public.wallet_transfers (from_account_id);
create index wallet_transfers_to_account_idx on public.wallet_transfers (to_account_id);
create index wallet_transfers_created_by_idx on public.wallet_transfers (created_by);
create index wallet_transfers_cancelled_by_idx on public.wallet_transfers (cancelled_by);
create trigger a_guard before update or delete on public.wallet_transfers for each row execute function
  app_private.tg_append_only('cancelled_at,cancelled_by,cancel_reason', '');
create trigger zz_no_truncate before truncate on public.wallet_transfers for each statement
  execute function app_private.tg_no_truncate();
create trigger zz_audit after insert or update on public.wallet_transfers for each row
  execute function app_private.tg_audit();
alter table public.wallet_transfers enable row level security;
revoke all on public.wallet_transfers from public, anon, authenticated;
grant select on public.wallet_transfers to authenticated;
grant all on public.wallet_transfers to service_role;
create policy committee_read on public.wallet_transfers for select to authenticated
  using ((select app_private.is_committee()));

create function app_private.record_wallet_transfer(p_id uuid, p_from_account_id uuid, p_to_account_id uuid, p_amount integer,
                                                   p_moved_on date, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cash_id smallint := (select w.id from public.wallet_types w where w.kind = 'cash');
  fa public.fund_accounts;
  ta public.fund_accounts;
begin
  perform app_private.require_committee();
  if exists (select 1 from public.wallet_transfers where id = p_id) then return p_id; end if;
  if coalesce(p_amount, 0) <= 0 or p_moved_on is null or length(p_note) > 500 then perform app_private.fail('invalid_input'); end if;
  if p_moved_on > current_date + 1 then perform app_private.fail('future_date'); end if;
  if p_moved_on < (select s.opening_balance_on from public.settings s) then perform app_private.fail('before_opening'); end if;
  if p_from_account_id is not distinct from p_to_account_id then perform app_private.fail('same_wallet'); end if;
  -- from: any account (a stopped one can still be emptied); to: an active account
  if p_from_account_id is not null then
    select * into fa from public.fund_accounts where id = p_from_account_id;
    if fa.id is null then perform app_private.fail('not_found'); end if;
  end if;
  if p_to_account_id is not null then
    select * into ta from public.fund_accounts where id = p_to_account_id;
    if ta.id is null then perform app_private.fail('not_found'); end if;
    if not ta.active then perform app_private.fail('wallet_inactive'); end if;
  end if;
  perform app_private.set_action('record_wallet_transfer');
  insert into public.wallet_transfers (id, from_wallet_type_id, from_account_id, to_wallet_type_id, to_account_id, amount,
                                       moved_on, note, created_by)
  values (p_id, coalesce(fa.wallet_type_id, cash_id), p_from_account_id, coalesce(ta.wallet_type_id, cash_id), p_to_account_id,
          p_amount, p_moved_on, nullif(btrim(p_note), ''), auth.uid());
  return p_id;
end $$;

create function app_private.cancel_wallet_transfer(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  x public.wallet_transfers;
begin
  perform app_private.require_admin();
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  select * into x from public.wallet_transfers where id = p_id for update;
  if x.id is null then perform app_private.fail('not_found'); end if;
  if x.cancelled_at is not null then return; end if;
  perform app_private.set_action('cancel_wallet_transfer');
  update public.wallet_transfers set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason) where id = x.id;
end $$;

/* ───────────────────────── a wallet's number: replace, or fix a typo ───────────────────────── */

-- The number may change only while nothing uses the account (the history must keep the number it had).
drop trigger a_guard on public.fund_accounts;
create trigger a_guard before update or delete on public.fund_accounts for each row execute function
  app_private.tg_append_only('', 'account_number,holder_name,note,sort_order,active,updated_at,updated_by,opening_balance,opening_on');
create function app_private.tg_account_number_unused() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.account_number is distinct from old.account_number and (
       exists (select 1 from public.payments p where p.fund_account_id = old.id)
       or exists (select 1 from public.expenses e where e.fund_account_id = old.id)
       or exists (select 1 from public.wallet_transfers t where old.id in (t.from_account_id, t.to_account_id))) then
    perform app_private.fail('account_in_use');
  end if;
  return new;
end $$;
revoke all on function app_private.tg_account_number_unused() from public, anon, authenticated;
create trigger b_number_unused before update on public.fund_accounts for each row
  execute function app_private.tg_account_number_unused();

create function app_private.replace_wallet_account(p_wallet_type_id integer, p_account_number text, p_holder_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  aid uuid;
  num text := regexp_replace(coalesce(p_account_number, ''), '[\s-]', '', 'g');
begin
  perform app_private.require_admin();
  if num = '' or btrim(coalesce(p_holder_name, '')) = '' then perform app_private.fail('invalid_input'); end if;
  perform 1 from public.wallet_types w where w.id = p_wallet_type_id for update;
  if not found then perform app_private.fail('not_found'); end if;
  if exists (select 1 from public.fund_accounts a where a.wallet_type_id = p_wallet_type_id and a.account_number = num and a.active) then
    perform app_private.fail('account_exists');
  end if;
  perform app_private.set_action('replace_wallet_account');
  update public.fund_accounts set active = false, updated_at = now(), updated_by = auth.uid()
  where wallet_type_id = p_wallet_type_id and active;
  -- b_wallet refuses cash and a stopped wallet type
  insert into public.fund_accounts (method, wallet_type_id, account_number, holder_name, created_by)
  values ('other', p_wallet_type_id, num, btrim(p_holder_name), auth.uid())
  returning id into aid;
  return aid;
end $$;

create function app_private.correct_wallet_account(p_id uuid, p_account_number text, p_holder_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.fund_accounts;
  num text := regexp_replace(coalesce(p_account_number, ''), '[\s-]', '', 'g');
begin
  perform app_private.require_admin();
  if num = '' or btrim(coalesce(p_holder_name, '')) = '' then perform app_private.fail('invalid_input'); end if;
  select * into a from public.fund_accounts where id = p_id for update;
  if a.id is null then perform app_private.fail('not_found'); end if;
  if a.active and exists (select 1 from public.fund_accounts x
                          where x.wallet_type_id = a.wallet_type_id and x.account_number = num and x.active and x.id <> a.id) then
    perform app_private.fail('account_exists');
  end if;
  perform app_private.set_action('correct_wallet_account');
  -- b_number_unused refuses a new number once a payment, expense or move uses the account
  update public.fund_accounts set account_number = num, holder_name = btrim(p_holder_name), updated_at = now(), updated_by = auth.uid()
  where id = p_id;
end $$;

/* ───────────────────────── report_wallets: a balance everywhere, moves ───────────────────────── */

drop function public.report_wallets(date, date);
drop function app_private.report_wallets(date, date);
create function app_private.report_wallets(p_from date, p_to date)
returns table (wallet_type_id smallint, fund_account_id uuid, method public.payment_method, in_count integer, in_amount bigint,
               out_count integer, out_amount bigint, opening_balance bigint, opening_on date, balance bigint,
               transfer_in bigint, transfer_out bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  cash_id smallint := (select w.id from public.wallet_types w where w.kind = 'cash');
  base bigint := (select s.opening_balance from public.settings s);
begin
  perform app_private.require_committee();
  if p_from is null or p_to is null or p_to < p_from then perform app_private.fail('invalid_input'); end if;
  return query
  with raw as (
    select p.wallet_type_id as t, p.fund_account_id as w, p.method as m, p.amount::bigint as amount, p.paid_on as d, 'in' as k
    from public.payments p where p.status = 'confirmed' and p.method::text <> 'credit'
    union all
    select e.wallet_type_id, e.fund_account_id, null, e.amount, e.spent_on, 'out'
    from public.expenses e where e.cancelled_at is null
    union all
    select x.from_wallet_type_id, x.from_account_id, null, x.amount, x.moved_on, 'tout'
    from public.wallet_transfers x where x.cancelled_at is null
    union all
    select x.to_wallet_type_id, x.to_account_id, null, x.amount, x.moved_on, 'tin'
    from public.wallet_transfers x where x.cancelled_at is null
    union all
    -- a handover difference is counted in cash
    select cash_id, null, null, b.amount, b.created_at::date, 'adj' from public.balance_adjustments b
  ),
  -- where the balance sits: the account, else the wallet, else cash (paper sheets, expenses without a wallet)
  moves as (
    select r.*, case when r.k in ('out', 'tout') then -r.amount else r.amount end as signed,
           coalesce(r.t, cash_id) as bt
    from raw r
  ),
  accounts as (
    select f.wallet_type_id as t, f.id as w, f.method as m, f.opening_balance, f.opening_on,
           (select count(*) from moves x where x.w = f.id and x.k = 'in' and x.d between p_from and p_to)::integer as ic,
           coalesce((select sum(amount) from moves x where x.w = f.id and x.k = 'in' and x.d between p_from and p_to), 0)::bigint as ia,
           (select count(*) from moves x where x.w = f.id and x.k = 'out' and x.d between p_from and p_to)::integer as oc,
           coalesce((select sum(amount) from moves x where x.w = f.id and x.k = 'out' and x.d between p_from and p_to), 0)::bigint as oa,
           coalesce((select sum(amount) from moves x where x.w = f.id and x.k = 'tin' and x.d between p_from and p_to), 0)::bigint as ti,
           coalesce((select sum(amount) from moves x where x.w = f.id and x.k = 'tout' and x.d between p_from and p_to), 0)::bigint as tt,
           (coalesce(f.opening_balance, 0)
            + coalesce((select sum(signed) from moves x where x.w = f.id and x.d <= p_to
                          and (f.opening_on is null or x.d >= f.opening_on)), 0))::bigint as bal,
           f.active
    from public.fund_accounts f
  ),
  -- money of a wallet with no account, and cash
  loose as (
    select w.id as t, w.kind, w.legacy_method as m, w.opening_balance, w.opening_on,
           count(*) filter (where x.k = 'in' and x.t = w.id and x.d between p_from and p_to)::integer as ic,
           coalesce(sum(x.amount) filter (where x.k = 'in' and x.t = w.id and x.d between p_from and p_to), 0)::bigint as ia,
           count(*) filter (where x.k = 'out' and x.t = w.id and x.d between p_from and p_to)::integer as oc,
           coalesce(sum(x.amount) filter (where x.k = 'out' and x.t = w.id and x.d between p_from and p_to), 0)::bigint as oa,
           coalesce(sum(x.amount) filter (where x.k = 'tin' and x.d between p_from and p_to), 0)::bigint as ti,
           coalesce(sum(x.amount) filter (where x.k = 'tout' and x.d between p_from and p_to), 0)::bigint as tt,
           (case when w.kind = 'cash' then coalesce(w.opening_balance, base) else 0 end
            + coalesce(sum(x.signed) filter (where x.d <= p_to and (w.opening_on is null or x.d >= w.opening_on)), 0))::bigint as bal
    from public.wallet_types w
    left join moves x on x.w is null and x.bt = w.id
    group by w.id
  ),
  -- paper sheets and expenses without a wallet: their own rows (in/out only; the money is in cash)
  other as (
    select x.m,
           count(*) filter (where x.k = 'in')::integer as ic, coalesce(sum(x.amount) filter (where x.k = 'in'), 0)::bigint as ia,
           count(*) filter (where x.k = 'out')::integer as oc, coalesce(sum(x.amount) filter (where x.k = 'out'), 0)::bigint as oa
    from moves x where x.t is null and x.w is null and x.k in ('in', 'out') and x.d between p_from and p_to
    group by x.m
  )
  select a.t, a.w, a.m, a.ic, a.ia, a.oc, a.oa, a.opening_balance::bigint, a.opening_on, a.bal, a.ti, a.tt
  from accounts a where a.active or a.ic > 0 or a.oc > 0 or a.ti > 0 or a.tt > 0 or a.bal <> 0
  union all
  select l.t, null, l.m, l.ic, l.ia, l.oc, l.oa, l.opening_balance::bigint, l.opening_on, l.bal, l.ti, l.tt
  from loose l where l.kind = 'cash' or l.ic > 0 or l.oc > 0 or l.ti > 0 or l.tt > 0 or l.bal <> 0
  union all
  select null, null, o.m, o.ic, o.ia, o.oc, o.oa, null, null, null, 0::bigint, 0::bigint from other o
  order by 1 nulls last, 2 nulls last, 3 nulls last;
end $$;

/* ───────────────────────── wrappers and grants ───────────────────────── */

create function public.record_wallet_transfer(p_id uuid, p_from_account_id uuid, p_to_account_id uuid, p_amount integer,
                                              p_moved_on date, p_note text default null) returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.record_wallet_transfer(p_id => p_id, p_from_account_id => p_from_account_id, p_to_account_id => p_to_account_id,
                                            p_amount => p_amount, p_moved_on => p_moved_on, p_note => p_note)
$$;
create function public.cancel_wallet_transfer(p_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app_private.cancel_wallet_transfer(p_id => p_id, p_reason => p_reason) $$;
create function public.replace_wallet_account(p_wallet_type_id integer, p_account_number text, p_holder_name text) returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.replace_wallet_account(p_wallet_type_id => p_wallet_type_id, p_account_number => p_account_number,
                                            p_holder_name => p_holder_name)
$$;
create function public.correct_wallet_account(p_id uuid, p_account_number text, p_holder_name text) returns void
language sql security invoker set search_path = '' as $$
  select app_private.correct_wallet_account(p_id => p_id, p_account_number => p_account_number, p_holder_name => p_holder_name)
$$;
create function public.report_wallets(p_from date, p_to date)
returns table (wallet_type_id smallint, fund_account_id uuid, method public.payment_method, in_count integer, in_amount bigint,
               out_count integer, out_amount bigint, opening_balance bigint, opening_on date, balance bigint,
               transfer_in bigint, transfer_out bigint)
language sql stable security invoker set search_path = '' as $$ select * from app_private.report_wallets(p_from => p_from, p_to => p_to) $$;

revoke all on function
  app_private.record_wallet_transfer(uuid, uuid, uuid, integer, date, text), public.record_wallet_transfer(uuid, uuid, uuid, integer, date, text),
  app_private.cancel_wallet_transfer(uuid, text), public.cancel_wallet_transfer(uuid, text),
  app_private.replace_wallet_account(integer, text, text), public.replace_wallet_account(integer, text, text),
  app_private.correct_wallet_account(uuid, text, text), public.correct_wallet_account(uuid, text, text),
  app_private.report_wallets(date, date), public.report_wallets(date, date)
from public, anon, authenticated;
grant execute on function
  app_private.record_wallet_transfer(uuid, uuid, uuid, integer, date, text), public.record_wallet_transfer(uuid, uuid, uuid, integer, date, text),
  app_private.cancel_wallet_transfer(uuid, text), public.cancel_wallet_transfer(uuid, text),
  app_private.replace_wallet_account(integer, text, text), public.replace_wallet_account(integer, text, text),
  app_private.correct_wallet_account(uuid, text, text), public.correct_wallet_account(uuid, text, text),
  app_private.report_wallets(date, date), public.report_wallets(date, date)
to authenticated, service_role;

/* ───────────────────────── activity log, accuracy audit, account history ───────────────────────── */

-- «سجل العمليات»: a move between wallets is a money action (subject «بنكيلي → نقدًا», amount, cancel reason)
CREATE OR REPLACE FUNCTION app_private.activity_log(p_before bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50, p_scope text DEFAULT 'money'::text)
 RETURNS TABLE(id bigint, at timestamp with time zone, actor uuid, actor_name text, action text, table_name text, row_id text, subject text, amount integer, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.require_committee();
  if coalesce(p_scope, '') not in ('money', 'settings', 'all') then perform app_private.fail('invalid_input'); end if;
  return query
  with g as (
    select max(a.id) as id, a.at, a.actor, a.action,
           (array_agg(a.table_name || '|' || coalesce(a.row_id, '')
                      order by coalesce(array_position(array['payments', 'expenses', 'campaigns', 'members',
                        'membership_periods', 'committee', 'handovers', 'terms', 'settings', 'group_prices',
                        'fund_accounts', 'balance_adjustments', 'transfers', 'campaign_participants', 'wallet_transfers'], a.table_name), 99),
                        a.id))[1] as main
    from public.audit_log a
    where p_before is null or a.id < p_before
    group by a.at, a.actor, a.action
  ),
  page as (
    select g.id, g.at, g.actor, g.action, split_part(g.main, '|', 1) as tbl, nullif(split_part(g.main, '|', 2), '') as rid,
           case when split_part(g.main, '|', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then split_part(g.main, '|', 2)::uuid end as uid
    from g
    -- «سجل العمليات» scope (m40): money = payments, expenses, campaigns/levies, members, the fund;
    -- settings = everything else (wallets, settings, accounts, push, fees, activities). Before the
    -- limit, so paging stays right.
    where p_scope = 'all'
       or (split_part(g.main, '|', 1) = any (array['payments', 'payment_allocations', 'payment_months', 'expenses',
             'campaigns', 'campaign_participants', 'members', 'membership_periods', 'transfers', 'balance_adjustments',
             'handovers', 'terms', 'wallet_transfers'])) = (p_scope = 'money')
    order by g.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select page.id, page.at, page.actor, c.display_name, page.action, page.tbl, page.rid,
         coalesce(pay.payer_name, ex.subject, mem.full_name, per.full_name, cam.title, com.display_name, lev.subject, wt.subject),
         coalesce(pay.amount, ex.amount, lev.amount, wt.amount),
         coalesce(pay.reason, ex.reason, per.reason, lev.reason, wt.reason)
  from page
  left join public.committee c on c.user_id = page.actor
  left join lateral (select p.payer_name, p.amount, coalesce(p.cancel_reason, p.reject_reason) as reason
                     from public.payments p where page.tbl = 'payments' and p.id = page.uid) pay on true
  left join lateral (select coalesce(e.note, e.category::text) as subject, e.amount, e.cancel_reason as reason
                     from public.expenses e where page.tbl = 'expenses' and e.id = page.uid) ex on true
  left join lateral (select m.full_name from public.members m
                     where page.tbl = 'members' and m.id = page.uid) mem on true
  left join lateral (select m.full_name, coalesce(mp.cancel_reason, mp.reason) as reason
                     from public.membership_periods mp join public.members m on m.id = mp.member_id
                     where page.tbl = 'membership_periods' and mp.id = page.uid) per on true
  left join lateral (select x.title from public.campaigns x
                     where page.tbl = 'campaigns' and x.id = page.uid) cam on true
  left join lateral (select x.display_name from public.committee x
                     where page.tbl = 'committee' and x.user_id = page.uid) com on true
  left join lateral (select m.full_name || ' · ' || c2.title as subject, cp.expected_amount as amount, cp.exempt_reason as reason
                     from public.campaign_participants cp join public.members m on m.id = cp.member_id
                     join public.campaigns c2 on c2.id = cp.campaign_id
                     where page.tbl = 'campaign_participants' and cp.member_id = page.uid
                     order by cp.created_at desc limit 1) lev on true
  -- a move between wallets (m43): «بنكيلي → نقدًا»
  left join lateral (select fw.name || ' → ' || tw.name as subject, x.amount, x.cancel_reason as reason
                     from public.wallet_transfers x join public.wallet_types fw on fw.id = x.from_wallet_type_id
                     join public.wallet_types tw on tw.id = x.to_wallet_type_id
                     where page.tbl = 'wallet_transfers' and x.id = page.uid) wt on true
  order by page.id desc;
end $function$
;

-- 31 checks: + wallets add up to all the money, no wallet below 0
CREATE OR REPLACE FUNCTION app_private.accuracy_audit()
 RETURNS TABLE(check_name text, ok boolean, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  perform app_private.require_committee();
  return query
    with
    settings as (select s.opening_balance from public.settings s),
    conf as (select p.* from public.payments p where p.status = 'confirmed'),
    alloc as (select a.*, p.status, p.method, p.paid_on from public.payment_allocations a join public.payments p on p.id = a.payment_id),
    -- money in, recomputed: fees (months + credit, not credit use) and campaign money
    fees_in as (select coalesce(sum(a.amount), 0) as v from alloc a
                where a.status = 'confirmed' and a.kind in ('months', 'credit') and a.method::text <> 'credit'),
    camp_in as (select coalesce(sum(a.amount), 0) as v from alloc a where a.status = 'confirmed' and a.kind = 'campaign'),
    exp_main as (select coalesce(sum(e.amount), 0) as v from public.expenses e where e.cancelled_at is null and e.campaign_id is null),
    exp_camp as (select coalesce(sum(e.amount), 0) as v from public.expenses e where e.cancelled_at is null and e.campaign_id is not null),
    transfers as (select coalesce(sum(t.amount), 0) as v from public.transfers t),
    adjust as (select coalesce(sum(b.amount), 0) as v from public.balance_adjustments b),
    fund as (select f.balance, f.money_in from app_private.public_fund_summary() f),
    grid as (select mg.* from app_private.month_grid() mg),
    pm as (select * from public.payment_months where released_at is null),
    active_now as (select mg.member_id from grid mg
                   where mg.year = extract(year from current_date) and mg.month = extract(month from current_date) and mg.status = 'active'),
    checks as (
      -- 1 · the fund balance is opening + fees − main-fund spending + transfers in + adjustments
      select 'fund balance = opening + fees − spending + transfers + adjustments' as check_name,
             (select balance from fund) = (select opening_balance from settings) + (select v from fees_in) - (select v from exp_main)
                                          + (select v from transfers) + (select v from adjust) as ok,
             format('shown %s, recomputed %s', (select balance from fund),
                    (select opening_balance from settings) + (select v from fees_in) - (select v from exp_main)
                    + (select v from transfers) + (select v from adjust)) as detail
      union all
      select 'fund money in = confirmed fees', (select money_in from fund) = (select v from fees_in),
             format('shown %s, recomputed %s', (select money_in from fund), (select v from fees_in))
      union all
      -- 2 · the whole association: fund + campaign money = everything in − everything out + adjustments
      select 'fund + campaigns held = opening + all income − all spending + adjustments',
             (select balance from fund) + coalesce((select sum(c.balance) from app_private.public_campaign_progress() c), 0)
               = (select opening_balance from settings) + (select v from fees_in) + (select v from camp_in)
                 - (select v from exp_main) - (select v from exp_camp) + (select v from adjust),
             format('fund %s + campaigns %s vs %s', (select balance from fund),
                    coalesce((select sum(c.balance) from app_private.public_campaign_progress() c), 0),
                    (select opening_balance from settings) + (select v from fees_in) + (select v from camp_in)
                    - (select v from exp_main) - (select v from exp_camp) + (select v from adjust))
      union all
      -- 3 · every payment equals the sum of its allocations
      select 'each payment = sum of its allocations',
             not exists (select 1 from public.payments p
                         where p.amount <> coalesce((select sum(a.amount) from public.payment_allocations a where a.payment_id = p.id), -1)),
             format('%s payment(s) differ', (select count(*) from public.payments p
                         where p.amount <> coalesce((select sum(a.amount) from public.payment_allocations a where a.payment_id = p.id), -1)))
      union all
      -- 4 · a paid month is paid once, by a confirmed payment with a matching allocation
      select 'each paid month has exactly one live payment',
             not exists (select 1 from pm group by member_id, year, month having count(*) > 1),
             format('%s month(s) paid twice', (select count(*) from (select 1 from pm group by member_id, year, month having count(*) > 1) x))
      union all
      select 'each paid month comes from a confirmed payment with the same allocation',
             not exists (select 1 from pm
                         where not exists (select 1 from alloc a where a.payment_id = pm.payment_id and a.status = 'confirmed'
                                             and a.kind = 'months' and a.member_id = pm.member_id and a.year = pm.year
                                             and a.month = pm.month and a.amount = pm.amount)),
             format('%s paid month(s) without a matching confirmed allocation', (select count(*) from pm
                         where not exists (select 1 from alloc a where a.payment_id = pm.payment_id and a.status = 'confirmed'
                                             and a.kind = 'months' and a.member_id = pm.member_id and a.year = pm.year
                                             and a.month = pm.month and a.amount = pm.amount)))
      union all
      select 'each confirmed month allocation is a paid month',
             not exists (select 1 from alloc a where a.status = 'confirmed' and a.kind = 'months'
                           and not exists (select 1 from pm where pm.payment_id = a.payment_id and pm.member_id = a.member_id
                                             and pm.year = a.year and pm.month = a.month)),
             format('%s confirmed month(s) not marked paid', (select count(*) from alloc a where a.status = 'confirmed' and a.kind = 'months'
                           and not exists (select 1 from pm where pm.payment_id = a.payment_id and pm.member_id = a.member_id
                                             and pm.year = a.year and pm.month = a.month)))
      union all
      -- 5 · cancelled / rejected / pending never count
      select 'cancelled, rejected or pending payments hold no paid month',
             not exists (select 1 from pm join public.payments p on p.id = pm.payment_id where p.status <> 'confirmed'),
             format('%s', (select count(*) from pm join public.payments p on p.id = pm.payment_id where p.status <> 'confirmed'))
      union all
      select 'the activity feed lists confirmed payments only',
             not exists (select 1 from app_private.public_activity_feed() f join public.payments p on p.id = f.payment_id
                         where f.kind = 'payment_confirmed' and p.status <> 'confirmed'),
             format('%s', (select count(*) from app_private.public_activity_feed() f join public.payments p on p.id = f.payment_id
                         where f.kind = 'payment_confirmed' and p.status <> 'confirmed'))
      union all
      -- 6 · the months grid agrees with the paid months
      select 'grid paid ⇔ a live paid month',
             not exists (select 1 from grid mg where mg.paid
                           <> exists (select 1 from pm where pm.member_id = mg.member_id and pm.year = mg.year and pm.month = mg.month)),
             format('%s cell(s) differ', (select count(*) from grid mg where mg.paid
                           <> exists (select 1 from pm where pm.member_id = mg.member_id and pm.year = mg.year and pm.month = mg.month)))
      union all
      select 'member_months view state agrees with the grid',
             not exists (select 1 from public.member_months v join grid mg on mg.member_id = v.member_id and mg.year = v.year and mg.month = v.month
                         where (v.state = 'paid') <> mg.paid or (v.state = 'late') <> mg.due),
             format('%s cell(s) differ', (select count(*) from public.member_months v join grid mg on mg.member_id = v.member_id and mg.year = v.year and mg.month = v.month
                         where (v.state = 'paid') <> mg.paid or (v.state = 'late') <> mg.due))
      union all
      -- 7 · only active months can be late (exempt / away / left / deceased never owe)
      select 'only active months are late',
             not exists (select 1 from grid mg where mg.due and mg.status <> 'active'),
             format('%s', (select count(*) from grid mg where mg.due and mg.status <> 'active'))
      union all
      -- 8 · arrears = member status = grid (count and amount owed)
      select 'arrears months = late months in the grid',
             not exists (select 1 from public.arrears ar
                         where ar.months_count <> (select count(*) from grid mg where mg.member_id = ar.member_id and mg.due)
                            or ar.amount_owed <> (select coalesce(sum(mg.owed), 0) from grid mg where mg.member_id = ar.member_id)),
             format('%s member(s) differ', (select count(*) from public.arrears ar
                         where ar.months_count <> (select count(*) from grid mg where mg.member_id = ar.member_id and mg.due)
                            or ar.amount_owed <> (select coalesce(sum(mg.owed), 0) from grid mg where mg.member_id = ar.member_id)))
      union all
      select 'every active member with a late month is in arrears',
             not exists (select 1 from grid mg join app_private.member_rollup() r on r.member_id = mg.member_id
                         where mg.due and r.member_status = 'active'
                           and not exists (select 1 from public.arrears ar where ar.member_id = mg.member_id)),
             format('%s', (select count(distinct mg.member_id) from grid mg join app_private.member_rollup() r on r.member_id = mg.member_id
                         where mg.due and r.member_status = 'active'
                           and not exists (select 1 from public.arrears ar where ar.member_id = mg.member_id)))
      union all
      select 'member status months behind = late months',
             not exists (select 1 from app_private.member_rollup() r
                         where r.months_behind <> (select count(*) from grid mg where mg.member_id = r.member_id and mg.due)),
             format('%s', (select count(*) from app_private.member_rollup() r
                         where r.months_behind <> (select count(*) from grid mg where mg.member_id = r.member_id and mg.due)))
      union all
      -- 9 · a paid month cost the price of that month (price per year, group at that month)
      select 'each paid month cost the price of that month',
             not exists (select 1 from pm join public.payments p on p.id = pm.payment_id
                         where p.method::text <> 'paper'
                           and pm.amount <> coalesce(app_private.price_at(pm.member_id, pm.year, pm.month), -1)),
             format('%s month(s) differ', (select count(*) from pm join public.payments p on p.id = pm.payment_id
                         where p.method::text <> 'paper'
                           and pm.amount <> coalesce(app_private.price_at(pm.member_id, pm.year, pm.month), -1)))
      union all
      -- 10 · credit is never negative
      select 'no member has negative credit',
             not exists (select 1 from app_private.member_credit() c where c.credit < 0),
             format('%s', (select count(*) from app_private.member_credit() c where c.credit < 0))
      union all
      -- 11 · campaigns: collected = confirmed contributions; balance = collected − spent − moved
      select 'campaign collected = confirmed contributions, balance = collected − spent − moved',
             not exists (select 1 from app_private.public_campaign_progress() c
                         where c.collected <> coalesce((select sum(a.amount) from alloc a where a.status = 'confirmed' and a.kind = 'campaign'
                                                         and a.campaign_id = c.campaign_id), 0)
                            or c.spent <> coalesce((select sum(e.amount) from public.expenses e where e.campaign_id = c.campaign_id
                                                      and e.cancelled_at is null), 0)
                            or c.transferred <> coalesce((select sum(t.amount) from public.transfers t where t.from_campaign_id = c.campaign_id), 0)
                            or c.balance <> c.collected - c.spent - c.transferred),
             format('%s campaign(s) differ', (select count(*) from app_private.public_campaign_progress() c
                         where c.collected <> coalesce((select sum(a.amount) from alloc a where a.status = 'confirmed' and a.kind = 'campaign'
                                                         and a.campaign_id = c.campaign_id), 0)
                            or c.balance <> c.collected - c.spent - c.transferred))
      union all
      select 'no campaign has spent more than it held',
             not exists (select 1 from app_private.public_campaign_progress() c where c.balance < 0),
             format('%s', (select count(*) from app_private.public_campaign_progress() c where c.balance < 0))
      union all
      -- 12 · levies: shares collected = confirmed share payments; a share is paid at most once
      select 'levy shares paid = confirmed share payments',
             coalesce((select sum(l.paid) from app_private.levy_shares() l), 0)
               = coalesce((select sum(a.amount) from alloc a join public.campaigns c on c.id = a.campaign_id
                           where a.status = 'confirmed' and a.kind = 'campaign' and c.kind = 'levy'), 0),
             format('shares %s, payments %s', coalesce((select sum(l.paid) from app_private.levy_shares() l), 0),
                    coalesce((select sum(a.amount) from alloc a join public.campaigns c on c.id = a.campaign_id
                              where a.status = 'confirmed' and a.kind = 'campaign' and c.kind = 'levy'), 0))
      union all
      select 'no levy share is overpaid or paid for an exempt member',
             not exists (select 1 from app_private.levy_shares() l where l.paid > l.expected or (l.exempt and l.paid > 0)),
             format('%s', (select count(*) from app_private.levy_shares() l where l.paid > l.expected or (l.exempt and l.paid > 0)))
      union all
      -- 13 · reports: this year's period report closes on the fund + campaign money; years chain
      select 'this year''s report closes on the fund + campaign money',
             ((app_private.report_period(make_date(extract(year from current_date)::int, 1, 1), current_date + 3650)) ->> 'closing')::bigint
               = (select balance from fund) + coalesce((select sum(c.balance) from app_private.public_campaign_progress() c), 0),
             format('report %s, fund + campaigns %s',
                    (app_private.report_period(make_date(extract(year from current_date)::int, 1, 1), current_date + 3650)) ->> 'closing',
                    (select balance from fund) + coalesce((select sum(c.balance) from app_private.public_campaign_progress() c), 0))
      union all
      select 'report months add up to the year',
             (select sum((m ->> 'income')::bigint) = (y -> 'income' ->> 'total')::bigint
                     and sum((m ->> 'spending')::bigint) = (y -> 'spending' ->> 'total')::bigint
              from (select app_private.report_period(make_date(extract(year from current_date)::int, 1, 1),
                                                     make_date(extract(year from current_date)::int, 12, 31)) y) q,
                   lateral jsonb_array_elements(q.y -> 'months') m
              group by q.y),
             'monthly income and spending vs the year totals'
      union all
      -- 13b · income by the month it pays for: the months add up, and it reconciles with income by date
      select 'income by due month adds up and reconciles with income by date',
             (select sum((m ->> 'due_income')::bigint) = (y -> 'income_due' ->> 'total')::bigint
                     and (y -> 'income_due' ->> 'total')::bigint
                         = (y -> 'income' ->> 'total')::bigint - (y -> 'income_due' ->> 'fees_for_other_months')::bigint
                           + (y -> 'income_due' ->> 'fees_paid_outside')::bigint
              from (select app_private.report_period(make_date(extract(year from current_date)::int, 1, 1),
                                                     make_date(extract(year from current_date)::int, 12, 31)) y) q,
                   lateral jsonb_array_elements(q.y -> 'months') m
              group by q.y),
             (select format('due %s = by date %s − other months %s + paid outside %s', y -> 'income_due' ->> 'total',
                            y -> 'income' ->> 'total', y -> 'income_due' ->> 'fees_for_other_months',
                            y -> 'income_due' ->> 'fees_paid_outside')
              from (select app_private.report_period(make_date(extract(year from current_date)::int, 1, 1),
                                                     make_date(extract(year from current_date)::int, 12, 31)) y) q)
      union all
      -- 14 · statistics: buckets add up; active = members active this month
      select 'fee stats buckets add up to active members',
             (select (o ->> 'paid_up')::int + (o ->> 'owe_1')::int + (o ->> 'owe_2_3')::int + (o ->> 'owe_4plus')::int = (o ->> 'active')::int
                     and (o ->> 'active')::int = (select count(*) from active_now)
              from (select app_private.report_fee_stats(extract(year from current_date)::int) -> 'overall' o) x),
             (select format('active %s (grid %s), paid up %s, owe %s/%s/%s', o ->> 'active', (select count(*) from active_now),
                            o ->> 'paid_up', o ->> 'owe_1', o ->> 'owe_2_3', o ->> 'owe_4plus')
              from (select app_private.report_fee_stats(extract(year from current_date)::int) -> 'overall' o) x)
      union all
      select 'fee stats: late members = active members with a late month this year',
             (select (o ->> 'active')::int - (o ->> 'paid_up')::int
              from (select app_private.report_fee_stats(extract(year from current_date)::int) -> 'overall' o) x)
               = (select count(*) from active_now a
                  where exists (select 1 from grid mg where mg.member_id = a.member_id and mg.year = extract(year from current_date) and mg.due)),
             'stats late vs grid'
      union all
      -- 15 · the member statement agrees with the grid and arrears (every member)
      select 'member statement owed = arrears = grid',
             not exists (select 1 from public.members m
                         where ((app_private.member_statement(m.id, extract(year from current_date)::smallint)) -> 'owed' ->> 'months_count')::int
                               <> (select count(*) from grid mg where mg.member_id = m.id and mg.due)),
             format('%s member(s) differ', (select count(*) from public.members m
                         where ((app_private.member_statement(m.id, extract(year from current_date)::smallint)) -> 'owed' ->> 'months_count')::int
                               <> (select count(*) from grid mg where mg.member_id = m.id and mg.due)))
      union all
      -- 16 · group moves: a member is in one period at a time
      select 'no overlapping membership periods',
             not exists (select 1 from public.membership_periods a join public.membership_periods b
                           on a.member_id = b.member_id and a.id < b.id and a.cancelled_at is null and b.cancelled_at is null
                          and a.from_month <= coalesce(b.to_month, 'infinity'::date) and b.from_month <= coalesce(a.to_month, 'infinity'::date)),
             format('%s pair(s)', (select count(*) from public.membership_periods a join public.membership_periods b
                           on a.member_id = b.member_id and a.id < b.id and a.cancelled_at is null and b.cancelled_at is null
                          and a.from_month <= coalesce(b.to_month, 'infinity'::date) and b.from_month <= coalesce(a.to_month, 'infinity'::date)))
      union all
      -- data completeness: an active month with no fee for its year (nor an earlier year to fall back on) shows 0 owed
      select 'every active month has a fee (its year, or an earlier one)',
             not exists (select 1 from grid mg where mg.status = 'active' and mg.price is null
                           and make_date(mg.year, mg.month, 1) <= current_date
                           and not exists (select 1 from public.group_prices g2 where g2.group_id = mg.group_id and g2.year < mg.year)),
             format('%s active started month(s) without any fee', (select count(*) from grid mg where mg.status = 'active' and mg.price is null
                           and make_date(mg.year, mg.month, 1) <= current_date
                           and not exists (select 1 from public.group_prices g2 where g2.group_id = mg.group_id and g2.year < mg.year)))
      union all
      -- 30 · wallets (m43): every account, wallet and cash balance together = all the association's money
      --      (opening + everything in − everything out + adjustments); a manual opening may differ (shown)
      select 'wallet balances + cash = opening + everything in − everything out + adjustments',
             (select coalesce(sum(w.balance), 0) from app_private.report_wallets(
                (select s.opening_balance_on from public.settings s), current_date + 1) w)
               = (select opening_balance from settings) + (select coalesce(sum(p.amount), 0) from conf p where p.method::text <> 'credit')
                 - (select v from exp_main) - (select v from exp_camp) + (select v from adjust)
             or exists (select 1 from public.fund_accounts f where f.opening_on is not null)
             or exists (select 1 from public.wallet_types w where w.opening_on is not null),
             format('wallets %s, recomputed %s%s',
                    (select coalesce(sum(w.balance), 0) from app_private.report_wallets(
                       (select s.opening_balance_on from public.settings s), current_date + 1) w),
                    (select opening_balance from settings) + (select coalesce(sum(p.amount), 0) from conf p where p.method::text <> 'credit')
                    - (select v from exp_main) - (select v from exp_camp) + (select v from adjust),
                    case when exists (select 1 from public.fund_accounts f where f.opening_on is not null)
                           or exists (select 1 from public.wallet_types w where w.opening_on is not null)
                         then ' (manual opening set: the difference is not checked)' else '' end)
      union all
      -- 31 · no wallet, account or cash below 0 (money taken out that was never recorded coming in)
      select 'no wallet balance below 0',
             not exists (select 1 from app_private.report_wallets((select s.opening_balance_on from public.settings s), current_date + 1) w
                         where w.balance < 0),
             format('%s below 0', (select count(*) from app_private.report_wallets(
                                     (select s.opening_balance_on from public.settings s), current_date + 1) w where w.balance < 0))
    )
    select c.check_name, c.ok, c.detail from checks c;
end $function$
;

-- an account that recorded or cancelled a move has history
CREATE OR REPLACE FUNCTION app_private.account_has_history(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.payments where p_user in (created_by, decided_by, cancelled_by))
      or exists (select 1 from public.expenses where p_user in (created_by, cancelled_by))
      or exists (select 1 from public.campaigns where p_user in (created_by, closed_by))
      or exists (select 1 from public.transfers where created_by = p_user)
      or exists (select 1 from public.reminders where sent_by = p_user)
      or exists (select 1 from public.members where created_by = p_user)
      or exists (select 1 from public.membership_periods where p_user in (created_by, cancelled_by))
      or exists (select 1 from public.fund_accounts where p_user in (created_by, updated_by))
      or exists (select 1 from public.expense_activities where p_user in (created_by, updated_by))
      or exists (select 1 from public.wallet_types where p_user in (created_by, updated_by))
      or exists (select 1 from public.wallet_transfers where p_user in (created_by, cancelled_by))
      or exists (select 1 from public.settings where updated_by = p_user)
      or exists (select 1 from public.terms where created_by = p_user)
      or exists (select 1 from public.handovers where p_user in (started_by, submitted_by, accepted_by, cancelled_by))
      or exists (select 1 from public.balance_adjustments where created_by = p_user)
      or exists (select 1 from public.member_links where p_user in (created_by, revoked_by))
      or exists (select 1 from public.campaign_participants where exempted_by = p_user)
      or exists (select 1 from public.audit_log where actor = p_user);
$function$
;
