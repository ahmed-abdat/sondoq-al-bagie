-- m44: report_period.income gains `paper` (owner 2026-09-30): the part of the period's income that
-- comes from the paper sheets. They were typed in on 2026-09-28/29 (a few with an older date), so
-- by date they fall in September although the money came in over the year; the app says «منها X من
-- الأوراق» and home «هذا الشهر» leaves it out. Same filter as income (confirmed, not credit use,
-- paid_on in the period). Body = pg_get_functiondef at m43, changed where marked. Undo:
-- supabase/rollback/m44_revert.sql.
CREATE OR REPLACE FUNCTION app_private.report_period(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select p.paid_on, a.amount, a.kind, a.year, a.month, p.method,
           case when a.kind in ('months', 'credit') then 'fees'
                when c.kind = 'levy' then 'levies' else 'donations' end as source
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    left join public.campaigns c on c.id = a.campaign_id
    where p.status = 'confirmed' and p.method::text <> 'credit' and p.paid_on between p_from and p_to
  ),
  -- «المداخيل حسب الشهر المستحق»: month fees of the months in the range, whenever they were paid
  pdue as (
    select a.year, a.month, a.amount, p.paid_on
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    where p.status = 'confirmed' and p.method::text <> 'credit' and a.kind = 'months'
      and make_date(a.year, a.month, 1) between date_trunc('month', p_from)::date and p_to
  ),
  pout as (
    select e.spent_on, e.category, e.activity_id, e.amount, e.campaign_id
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
      'total', coalesce((select sum(amount) from pin), 0),
      -- of which the paper sheets (m44): money received before the app, dated the day it was typed in
      'paper', coalesce((select sum(amount) from pin where method = 'paper'), 0)),
    'spending', jsonb_build_object(
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', x.category, 'amount', x.amount) order by x.amount desc, x.category)
                               from (select category, sum(amount) as amount from pout group by category) x), '[]'::jsonb),
      'by_activity', coalesce((select jsonb_agg(jsonb_build_object('activity_id', x.activity_id, 'name', a.name, 'amount', x.amount)
                                                order by x.amount desc, a.sort_order, a.id)
                               from (select activity_id, sum(amount) as amount from pout group by activity_id) x
                               join public.expense_activities a on a.id = x.activity_id), '[]'::jsonb),
      'from_campaigns', coalesce((select sum(amount) from pout where campaign_id is not null), 0),
      'total', coalesce((select sum(amount) from pout), 0)),
    'adjustments', (select total from padj),
    'closing', opening_base + before_in - before_out + before_adj
               + coalesce((select sum(amount) from pin), 0) - coalesce((select sum(amount) from pout), 0) + (select total from padj),
    'campaigns_held', (select held from camp),
    -- by the month it pays for: month fees in their month, everything else (levies, donations,
    -- credit put aside) by its date. total = income.total − fees_for_other_months + fees_paid_outside
    'income_due', jsonb_build_object(
      'total', coalesce((select sum(amount) from pdue), 0) + coalesce((select sum(amount) from pin where kind <> 'months'), 0),
      'fees_for_other_months', coalesce((select sum(amount) from pin where kind = 'months'
                                           and make_date(pin.year, pin.month, 1) not between date_trunc('month', p_from)::date and p_to), 0),
      'fees_paid_outside', coalesce((select sum(amount) from pdue where pdue.paid_on not between p_from and p_to), 0)),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'year', extract(year from mo.m)::int, 'month', extract(month from mo.m)::int,
               'income', coalesce((select sum(amount) from pin where date_trunc('month', pin.paid_on) = mo.m), 0),
               'due_income', coalesce((select sum(amount) from pdue where make_date(pdue.year, pdue.month, 1) = mo.m), 0)
                             + coalesce((select sum(amount) from pin where pin.kind <> 'months'
                                           and date_trunc('month', pin.paid_on) = mo.m), 0),
               'spending', coalesce((select sum(amount) from pout where date_trunc('month', pout.spent_on) = mo.m), 0))
             order by mo.m)
      from months mo), '[]'::jsonb))
  into r;
  return r;
end $function$
;
