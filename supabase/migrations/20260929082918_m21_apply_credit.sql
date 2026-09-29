-- ════════════════════════════════════════════════════════════════════════════════════════
-- M21 · pay later months from a member's credit («ادفع من الرصيد», edge-case audit M7).
--
-- Overpaid money is booked as a 'credit' allocation for one member (counted in the fund when it
-- came in). Owner decision (2026-09-29): the committee may pay that member's months from it.
-- `apply_credit(id, member, months)` writes a payment with the new method 'credit' (payer = the
-- member) and month allocations, confirmed at once through confirm_payment (own-membership rule,
-- receipt). That money is already in the fund, so 'credit' payments are left out of money in
-- (fund_summary, term «collected») and of the public activity feed; `member_credit` subtracts
-- what was used. Cancelling a credit payment releases the months and gives the credit back.
-- Only apply_credit can create a 'credit' payment (trigger); the member row is locked so two uses
-- cannot spend the same credit. Enum literals are compared as text: the new value cannot be used
-- in the transaction that adds it.
-- ════════════════════════════════════════════════════════════════════════════════════════

alter type public.payment_method add value if not exists 'credit';

-- credit in (confirmed 'credit' allocations) − credit used (confirmed 'credit' payments)
create or replace function app_private.member_credit()
returns table (member_id uuid, credit bigint)
language sql stable security definer set search_path = '' as $$
  select x.member_id, sum(x.amount)::bigint
  from (select a.member_id, a.amount
        from public.payment_allocations a join public.payments p on p.id = a.payment_id
        where p.status = 'confirmed' and a.kind = 'credit'
        union all
        select a.member_id, -a.amount
        from public.payment_allocations a join public.payments p on p.id = a.payment_id
        where p.status = 'confirmed' and p.method::text = 'credit' and a.kind = 'months') x
  group by x.member_id;
$$;

-- m8 body; 'credit' payments are not new money.
create or replace function app_private.public_fund_summary()
returns table (opening_balance integer, money_in bigint, money_out bigint, transfers_in bigint, balance bigint,
               collected_this_year bigint, spent_this_year bigint, members_ok integer, members_behind integer,
               last_activity_at timestamptz, members_active integer, adjustments bigint,
               term_number smallint, term_started_on date)
language sql stable security definer set search_path = '' as $$
  with fin as (
    select coalesce(sum(a.amount), 0) as total,
           coalesce(sum(a.amount) filter (where extract(year from p.paid_on) = extract(year from current_date)), 0) as this_year
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    where p.status = 'confirmed' and a.kind in ('months', 'credit') and p.method::text <> 'credit'
  ),
  fout as (
    select coalesce(sum(e.amount), 0) as total,
           coalesce(sum(e.amount) filter (where extract(year from e.spent_on) = extract(year from current_date)), 0) as this_year
    from public.expenses e where e.cancelled_at is null and e.campaign_id is null
  ),
  tr as (select coalesce(sum(t.amount), 0) as total from public.transfers t),
  adj as (select coalesce(sum(b.amount), 0) as total from public.balance_adjustments b),
  mem as (
    select count(*) filter (where r.member_status = 'active' and r.months_behind = 0)::integer as ok,
           count(*) filter (where r.member_status = 'active' and r.months_behind > 0)::integer as behind,
           count(*) filter (where r.member_status = 'active')::integer as active
    from app_private.member_rollup() r
  ),
  cur as (select t.number, t.started_on from public.terms t where t.ended_on is null)
  select s.opening_balance, fin.total, fout.total, tr.total,
         s.opening_balance + fin.total - fout.total + tr.total + adj.total,
         fin.this_year, fout.this_year, mem.ok, mem.behind,
         greatest((select max(coalesce(p.cancelled_at, p.decided_at)) from public.payments p),
                  (select max(coalesce(e.cancelled_at, e.created_at)) from public.expenses e),
                  (select max(b.created_at) from public.balance_adjustments b)),
         mem.active, adj.total, cur.number, cur.started_on
  from public.settings s cross join fin cross join fout cross join tr cross join adj cross join mem
  left join cur on true;
$$;

-- m14 body; 'credit' payments are not collected money.
create or replace function app_private.public_terms()
returns table (number smallint, title text, started_on date, ended_on date, opening_balance integer,
               closing_balance integer, collected bigint, spent bigint, adjustment bigint)
language sql stable security definer set search_path = '' as $$
  select t.number, t.title, t.started_on, t.ended_on,
         case when t.number = 1 then (select s.opening_balance from public.settings s) else t.opening_balance end,
         (select n.opening_balance from public.terms n where n.number = t.number + 1),
         (select coalesce(sum(a.amount), 0) from public.payment_allocations a join public.payments p on p.id = a.payment_id
          where p.status = 'confirmed' and a.kind in ('months', 'credit') and p.method::text <> 'credit'
            and p.paid_on >= t.started_on and (t.ended_on is null or p.paid_on < t.ended_on)),
         (select coalesce(sum(e.amount), 0) from public.expenses e
          where e.cancelled_at is null and e.campaign_id is null
            and e.spent_on >= t.started_on and (t.ended_on is null or e.spent_on < t.ended_on)),
         (select coalesce(sum(b.amount), 0) from public.balance_adjustments b where b.term = t.number)
  from public.terms t
  order by t.number;
$$;

-- m8 body; months paid from credit are not new money, so they stay out of the public feed.
create or replace function app_private.public_activity_feed()
returns table (at timestamptz, kind text, member_names text, months integer, amount integer,
               category public.expense_category, payment_id uuid, method public.payment_method, receipt_code text)
language sql stable security definer set search_path = '' as $$
  (select p.decided_at, 'payment_confirmed',
          (select string_agg(distinct m.full_name, '، ') from public.payment_allocations a
           join public.members m on m.id = a.member_id where a.payment_id = p.id),
          (select count(*) from public.payment_allocations a where a.payment_id = p.id and a.kind = 'months')::integer,
          p.amount, null::public.expense_category, p.id, p.method, p.receipt_code
   from public.payments p
   where p.status = 'confirmed' and p.decided_at is not null and p.method::text not in ('paper', 'credit')
   order by p.decided_at desc limit 30)
  union all
  (select e.created_at, 'expense', null, null, e.amount, e.category, null, null, null
   from public.expenses e where e.cancelled_at is null order by e.created_at desc limit 20)
  union all
  (select c.created_at, 'campaign_opened', null, null, c.target_amount, null, null, null, null
   from public.campaigns c order by c.created_at desc limit 10)
  union all
  (select b.created_at, 'balance_adjustment', null, null, b.amount, null, null, null, null
   from public.balance_adjustments b order by b.created_at desc limit 10)
  order by 1 desc limit 50;
$$;

-- Only apply_credit writes 'credit' payments (it names the payment in a transaction setting).
create function app_private.tg_credit_payment_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.method::text = 'credit' and current_setting('sondoq.apply_credit', true) is distinct from new.id::text then
    perform app_private.fail('invalid_input', 'credit payments are made with apply_credit');
  end if;
  return new;
end $$;
create trigger b_credit_payment_guard before insert on public.payments for each row
  execute function app_private.tg_credit_payment_guard();

-- p_months: [{"year": 2026, "month": 10}, …] of one member. Confirmers only (confirm_payment applies
-- the own-membership rule). Returns the confirm result plus the payment id; a retry with the same
-- id returns the existing payment.
create function app_private.apply_credit(p_id uuid, p_member_id uuid, p_months jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing public.payments;
  mem public.members;
  total integer := 0;
  available bigint;
  r record;
  price integer;
begin
  if not app_private.can_confirm() then perform app_private.fail('not_confirmer'); end if;
  select * into existing from public.payments where id = p_id;
  if existing.id is not null then
    if existing.created_by is distinct from auth.uid() then perform app_private.fail('id_taken'); end if;
    return jsonb_build_object('id', existing.id, 'status', existing.status, 'replay', true);
  end if;
  if jsonb_typeof(p_months) is distinct from 'array' or jsonb_array_length(p_months) = 0 then
    perform app_private.fail('allocations_required');
  end if;
  select * into mem from public.members where id = p_member_id for update;   -- one credit use at a time
  if mem.id is null then perform app_private.fail('not_found'); end if;

  for r in select distinct x.year, x.month from jsonb_to_recordset(p_months) x(year smallint, month smallint) loop
    if r.year is null or r.month not between 1 and 12 then perform app_private.fail('invalid_input'); end if;
    price := app_private.price_at(p_member_id, r.year, r.month);
    if price is null then
      if app_private.period_at(p_member_id, r.year, r.month) is null then
        perform app_private.month_error('month_not_owed', p_member_id, r.year, r.month);
      end if;
      perform app_private.fail('no_price');
    end if;
    total := total + price;
  end loop;
  select coalesce(c.credit, 0) into available from app_private.member_credit() c where c.member_id = p_member_id;
  if coalesce(available, 0) < total then perform app_private.fail('credit_insufficient'); end if;

  perform app_private.set_action('apply_credit');
  perform set_config('sondoq.apply_credit', p_id::text, true);
  insert into public.payments (id, payer_name, method, amount, paid_on, note, created_by)
  values (p_id, mem.full_name, 'credit', total, current_date, 'من الرصيد', auth.uid());
  perform set_config('sondoq.apply_credit', '', true);
  insert into public.payment_allocations (payment_id, kind, member_id, year, month, amount)
  select p_id, 'months', p_member_id, x.year, x.month, app_private.price_at(p_member_id, x.year, x.month)
  from (select distinct y.year, y.month from jsonb_to_recordset(p_months) y(year smallint, month smallint)) x;

  return jsonb_build_object('id', p_id, 'replay', false) || public.confirm_payment(p_id);
end $$;

create function public.apply_credit(p_id uuid, p_member_id uuid, p_months jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select app_private.apply_credit(p_id => p_id, p_member_id => p_member_id, p_months => p_months)
$$;

revoke all on function app_private.apply_credit(uuid, uuid, jsonb) from public, anon;
grant execute on function app_private.apply_credit(uuid, uuid, jsonb) to authenticated, service_role;
revoke all on function public.apply_credit(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_credit(uuid, uuid, jsonb) to authenticated, service_role;
