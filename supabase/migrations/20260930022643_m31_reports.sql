-- ════════════════════════════════════════════════════════════════════════════════════════
-- M31 · report reads (owner 2026-09-30, docs/COMMITTEE-ONLY-PLAN.md §9), committee only.
--
-- report_period(from, to): the money of the whole association (main fund + campaigns and levies)
--   over a date range: opening, income by source (fees, levies, donations), spending by category,
--   adjustments, closing (split fund / campaigns), and month by month. Same rules as the fund
--   summary: fees = months and credit allocations of confirmed payments (not credit use), dated by
--   paid_on; expenses by spent_on (not cancelled); adjustments by their day.
-- report_wallets(from, to): per wallet (payment method, cash included) money in and out; an expense
--   names the wallet it was paid from since m31 (older ones: «غير محدد», method null).
-- report_committee_work(from, to): per committee account, what was recorded and cancelled.
-- Expenses: optional fund account or cash they were paid from. Donations: a donor name for a
--   contribution from someone who is not a member (owner 2026-09-30).
-- Undo: supabase/rollback/m31_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

/* ───────────────────────── expenses: which wallet; donations: donor name ───────────────────────── */

alter table public.expenses
  add column fund_account_id uuid references public.fund_accounts (id),
  add column paid_in_cash boolean not null default false,
  add constraint expenses_paid_from_one check (not (paid_in_cash and fund_account_id is not null));
create index expenses_fund_account_idx on public.expenses (fund_account_id);

alter table public.payment_allocations
  add column donor_name text
    check (donor_name is null or (kind = 'campaign' and member_id is null and btrim(donor_name) <> ''));

drop function public.record_expense(uuid, date, public.expense_category, integer, text, uuid, text);
drop function app_private.record_expense(uuid, date, public.expense_category, integer, text, uuid, text);
create function app_private.record_expense(
  p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text default null,
  p_campaign_id uuid default null, p_receipt_path text default null, p_fund_account_id uuid default null,
  p_paid_in_cash boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_committee();
  if exists (select 1 from public.expenses where id = p_id) then return p_id; end if;
  if p_spent_on > current_date + 1 then perform app_private.fail('future_date'); end if;
  if p_campaign_id is not null
     and exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.status = 'closed' for share) then
    perform app_private.fail('campaign_closed');
  end if;
  if coalesce(p_paid_in_cash, false) and p_fund_account_id is not null then perform app_private.fail('invalid_input'); end if;
  if p_fund_account_id is not null and not exists (select 1 from public.fund_accounts f where f.id = p_fund_account_id) then
    perform app_private.fail('not_found');
  end if;
  perform app_private.set_action('record_expense');
  insert into public.expenses (id, spent_on, category, campaign_id, amount, note, receipt_path, created_by, fund_account_id,
                               paid_in_cash)
  values (p_id, p_spent_on, p_category, p_campaign_id, p_amount, p_note, p_receipt_path, auth.uid(), p_fund_account_id,
          coalesce(p_paid_in_cash, false));
  return p_id;
end $$;
create function public.record_expense(
  p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text default null,
  p_campaign_id uuid default null, p_receipt_path text default null, p_fund_account_id uuid default null,
  p_paid_in_cash boolean default false
) returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.record_expense(p_id => p_id, p_spent_on => p_spent_on, p_category => p_category, p_amount => p_amount,
                                    p_note => p_note, p_campaign_id => p_campaign_id, p_receipt_path => p_receipt_path,
                                    p_fund_account_id => p_fund_account_id, p_paid_in_cash => p_paid_in_cash)
$$;
revoke all on function app_private.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean),
  public.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean)
from public, anon, authenticated;
grant execute on function app_private.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean),
  public.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean)
to authenticated, service_role;

-- record_payment stores a donation row's donor name (current body, pg_get_functiondef at m30)
CREATE OR REPLACE FUNCTION app_private.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text DEFAULT NULL::text, p_proof_path text DEFAULT NULL::text, p_proof_hash text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing public.payments;
  paid record;
  overlap boolean;
begin
  perform app_private.require_committee();
  select * into existing from public.payments where id = p_id;
  if existing.id is not null then
    if existing.created_by is distinct from auth.uid() then perform app_private.fail('id_taken'); end if;
    return jsonb_build_object('id', existing.id, 'status', existing.status, 'replay', true);
  end if;
  if p_paid_on > current_date + 1 then perform app_private.fail('future_date'); end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) = 0 then
    perform app_private.fail('allocations_required');
  end if;
  if app_private.norm_txn(p_txn_ref) is not null and exists (
    select 1 from public.payments x
    where x.method = p_method and app_private.norm_txn(x.txn_ref) = app_private.norm_txn(p_txn_ref)
      and x.status in ('pending', 'confirmed')) then
    perform app_private.fail('duplicate_txn_ref');
  end if;
  select a.member_id, a.year, a.month into paid
  from jsonb_to_recordset(p_allocations) a(kind public.allocation_kind, member_id uuid, year smallint, month smallint)
  join public.payment_months pm on pm.member_id = a.member_id and pm.year = a.year and pm.month = a.month and pm.released_at is null
  where a.kind = 'months'
  order by a.year, a.month
  limit 1;
  if paid.member_id is not null then
    perform app_private.month_error('month_already_paid', paid.member_id, paid.year, paid.month);
  end if;
  overlap := exists (
    select 1 from jsonb_to_recordset(p_allocations) a(kind public.allocation_kind, member_id uuid, year smallint, month smallint)
    join public.payment_allocations o on o.kind = 'months' and o.member_id = a.member_id and o.year = a.year and o.month = a.month
    join public.payments op on op.id = o.payment_id and op.status = 'pending'
    where a.kind = 'months');

  perform app_private.set_action('record_payment');
  insert into public.payments (id, payer_name, method, amount, paid_on, txn_ref, proof_path, proof_hash, note, created_by)
  values (p_id, btrim(p_payer_name), p_method, p_amount, p_paid_on, nullif(btrim(p_txn_ref), ''), p_proof_path,
          lower(p_proof_hash), p_note, auth.uid());
  insert into public.payment_allocations (payment_id, kind, member_id, campaign_id, year, month, amount, donor_name)
  select p_id, a.kind, a.member_id, a.campaign_id, a.year, a.month, a.amount, nullif(btrim(a.donor_name), '')
  from jsonb_to_recordset(p_allocations)
       a(kind public.allocation_kind, member_id uuid, campaign_id uuid, year smallint, month smallint, amount integer,
         donor_name text);

  -- Fail now with a clear code rather than at commit.
  if p_amount <> (select sum(a.amount) from public.payment_allocations a where a.payment_id = p_id) then
    perform app_private.fail('allocations_mismatch');
  end if;

  -- every committee record is confirmed at once (owner 2026-09-30: one committee level)
  return jsonb_build_object('id', p_id, 'replay', false, 'pending_overlap', overlap) || public.confirm_payment(p_id);
end $function$
;

-- contributions list the donor's name when there is one (current body at m30, one expression)
CREATE OR REPLACE FUNCTION app_private.public_campaign_contributions()
 RETURNS TABLE(campaign_id uuid, at timestamp with time zone, contributor_name text, amount bigint, payment_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.campaign_id, p.decided_at, coalesce(a.donor_name, m.full_name, p.payer_name), sum(a.amount), p.id
  from public.payment_allocations a
  join public.payments p on p.id = a.payment_id and p.status = 'confirmed'
  left join public.members m on m.id = a.member_id
  where a.kind = 'campaign'
  group by a.campaign_id, p.decided_at, coalesce(a.donor_name, m.full_name, p.payer_name), p.id;
$function$
;

create function app_private.report_period(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  opening_base bigint := (select s.opening_balance from public.settings s);
  before_in bigint;
  before_out bigint;
  before_adj bigint;
  r jsonb;
begin
  perform app_private.require_committee();
  if p_from is null or p_to is null or p_to < p_from then perform app_private.fail('invalid_input'); end if;

  -- all money in: fees + levy shares + donations (confirmed; credit use is not new money)
  select coalesce(sum(a.amount), 0) into before_in
  from public.payment_allocations a join public.payments p on p.id = a.payment_id
  where p.status = 'confirmed' and p.method::text <> 'credit' and p.paid_on < p_from;
  select coalesce(sum(e.amount), 0) into before_out
  from public.expenses e where e.cancelled_at is null and e.spent_on < p_from;
  select coalesce(sum(b.amount), 0) into before_adj
  from public.balance_adjustments b where b.created_at::date < p_from;

  with pin as (
    select p.paid_on, a.amount,
           case when a.kind in ('months', 'credit') then 'fees'
                when c.kind = 'levy' then 'levies' else 'donations' end as source
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    left join public.campaigns c on c.id = a.campaign_id
    where p.status = 'confirmed' and p.method::text <> 'credit' and p.paid_on between p_from and p_to
  ),
  pout as (
    select e.spent_on, e.category, e.amount, e.campaign_id
    from public.expenses e where e.cancelled_at is null and e.spent_on between p_from and p_to
  ),
  padj as (select coalesce(sum(b.amount), 0) as total from public.balance_adjustments b
           where b.created_at::date between p_from and p_to),
  months as (
    select date_trunc('month', gs)::date as m
    from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') gs
  ),
  -- campaign money still held at p_to (collected − spent − moved to the fund)
  camp as (
    select coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                     where a.kind = 'campaign' and p.status = 'confirmed' and p.paid_on <= p_to), 0)
         - coalesce((select sum(e.amount) from public.expenses e
                     where e.campaign_id is not null and e.cancelled_at is null and e.spent_on <= p_to), 0)
         - coalesce((select sum(t.amount) from public.transfers t where t.created_at::date <= p_to), 0) as held
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'opening', opening_base + before_in - before_out + before_adj,
    'income', jsonb_build_object(
      'fees', coalesce((select sum(amount) from pin where source = 'fees'), 0),
      'levies', coalesce((select sum(amount) from pin where source = 'levies'), 0),
      'donations', coalesce((select sum(amount) from pin where source = 'donations'), 0),
      'total', coalesce((select sum(amount) from pin), 0)),
    'spending', jsonb_build_object(
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', x.category, 'amount', x.amount) order by x.amount desc, x.category)
                               from (select category, sum(amount) as amount from pout group by category) x), '[]'::jsonb),
      'from_campaigns', coalesce((select sum(amount) from pout where campaign_id is not null), 0),
      'total', coalesce((select sum(amount) from pout), 0)),
    'adjustments', (select total from padj),
    'closing', opening_base + before_in - before_out + before_adj
               + coalesce((select sum(amount) from pin), 0) - coalesce((select sum(amount) from pout), 0) + (select total from padj),
    'campaigns_held', (select held from camp),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'year', extract(year from mo.m)::int, 'month', extract(month from mo.m)::int,
               'income', coalesce((select sum(amount) from pin where date_trunc('month', pin.paid_on) = mo.m), 0),
               'spending', coalesce((select sum(amount) from pout where date_trunc('month', pout.spent_on) = mo.m), 0))
             order by mo.m)
      from months mo), '[]'::jsonb))
  into r;
  return r;
end $$;

create function app_private.report_wallets(p_from date, p_to date)
returns table (method public.payment_method, in_count integer, in_amount bigint, out_count integer, out_amount bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_committee();
  if p_from is null or p_to is null or p_to < p_from then perform app_private.fail('invalid_input'); end if;
  return query
  with i as (
    select p.method as m, count(*)::integer as c, sum(p.amount)::bigint as a
    from public.payments p
    where p.status = 'confirmed' and p.method::text <> 'credit' and p.paid_on between p_from and p_to
    group by p.method
  ),
  o as (
    select case when e.paid_in_cash then 'cash'::public.payment_method else fa.method end as m,
           count(*)::integer as c, sum(e.amount)::bigint as a
    from public.expenses e left join public.fund_accounts fa on fa.id = e.fund_account_id
    where e.cancelled_at is null and e.spent_on between p_from and p_to
    group by 1
  )
  select x.m, sum(x.ic)::integer, sum(x.ia)::bigint, sum(x.oc)::integer, sum(x.oa)::bigint
  from (select i.m, i.c as ic, i.a as ia, 0 as oc, 0::bigint as oa from i
        union all
        select o.m, 0, 0::bigint, o.c, o.a from o) x
  group by x.m
  order by x.m nulls last;
end $$;

create function app_private.report_committee_work(p_from date, p_to date)
returns table (user_id uuid, display_name text, is_admin boolean, active boolean, payments_count integer,
               payments_amount bigint, expenses_count integer, expenses_amount bigint, cancellations integer,
               levy_exemptions integer, last_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_committee();
  if p_from is null or p_to is null or p_to < p_from then perform app_private.fail('invalid_input'); end if;
  return query
  select c.user_id, c.display_name, c.role = 'admin', c.active,
         (select count(*)::integer from public.payments p
          where p.created_by = c.user_id and p.method::text <> 'credit' and p.created_at::date between p_from and p_to),
         (select coalesce(sum(p.amount), 0)::bigint from public.payments p
          where p.created_by = c.user_id and p.method::text <> 'credit' and p.status = 'confirmed'
            and p.created_at::date between p_from and p_to),
         (select count(*)::integer from public.expenses e where e.created_by = c.user_id and e.created_at::date between p_from and p_to),
         (select coalesce(sum(e.amount), 0)::bigint from public.expenses e
          where e.created_by = c.user_id and e.cancelled_at is null and e.created_at::date between p_from and p_to),
         (select count(*)::integer from public.payments p where p.cancelled_by = c.user_id and p.cancelled_at::date between p_from and p_to)
         + (select count(*)::integer from public.expenses e where e.cancelled_by = c.user_id and e.cancelled_at::date between p_from and p_to),
         (select count(*)::integer from public.campaign_participants cp
          where cp.exempted_by = c.user_id and cp.exempted_at::date between p_from and p_to),
         (select max(a.at) from public.audit_log a where a.actor = c.user_id and a.at::date between p_from and p_to)
  from public.committee c
  order by c.active desc, c.display_name;
end $$;

create function public.report_period(p_from date, p_to date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select app_private.report_period(p_from => p_from, p_to => p_to)
$$;
create function public.report_wallets(p_from date, p_to date)
returns table (method public.payment_method, in_count integer, in_amount bigint, out_count integer, out_amount bigint)
language sql stable security invoker set search_path = '' as $$
  select * from app_private.report_wallets(p_from => p_from, p_to => p_to)
$$;
create function public.report_committee_work(p_from date, p_to date)
returns table (user_id uuid, display_name text, is_admin boolean, active boolean, payments_count integer,
               payments_amount bigint, expenses_count integer, expenses_amount bigint, cancellations integer,
               levy_exemptions integer, last_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from app_private.report_committee_work(p_from => p_from, p_to => p_to)
$$;

revoke all on function app_private.report_period(date, date), public.report_period(date, date),
  app_private.report_wallets(date, date), public.report_wallets(date, date),
  app_private.report_committee_work(date, date), public.report_committee_work(date, date)
from public, anon, authenticated;
grant execute on function app_private.report_period(date, date), public.report_period(date, date),
  app_private.report_wallets(date, date), public.report_wallets(date, date),
  app_private.report_committee_work(date, date), public.report_committee_work(date, date)
to authenticated, service_role;
