-- ════════════════════════════════════════════════════════════════════════════════════════
-- M31 · report reads (owner 2026-09-30, docs/COMMITTEE-ONLY-PLAN.md §9), committee only.
--
-- report_period(from, to): the money of the whole association (main fund + campaigns and levies)
--   over a date range: opening, income by source (fees, levies, donations), spending by category,
--   adjustments, closing (split fund / campaigns), and month by month. Same rules as the fund
--   summary: fees = months and credit allocations of confirmed payments (not credit use), dated by
--   paid_on; expenses by spent_on (not cancelled); adjustments by their day.
-- report_wallets(from, to): money in per payment method (confirmed, not credit use).
-- report_committee_work(from, to): per committee account, what was recorded and cancelled.
-- Undo: supabase/rollback/m31_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

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
returns table (method public.payment_method, count integer, amount bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_committee();
  if p_from is null or p_to is null or p_to < p_from then perform app_private.fail('invalid_input'); end if;
  return query
  select p.method, count(*)::integer, sum(p.amount)::bigint
  from public.payments p
  where p.status = 'confirmed' and p.method::text <> 'credit' and p.paid_on between p_from and p_to
  group by p.method
  order by 3 desc, 1;
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
returns table (method public.payment_method, count integer, amount bigint)
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
