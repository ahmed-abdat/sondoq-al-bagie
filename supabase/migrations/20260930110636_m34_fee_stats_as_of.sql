-- ════════════════════════════════════════════════════════════════════════════════════════
-- M34 · fair «الإحصاءات» trend: report_fee_stats(p_year, p_as_of date default null).
-- p_as_of = a snapshot of the year as it stood on that day: a month counts as paid only when its
-- payment was confirmed on/before that day (payment_months.created_at) and not cancelled/undone
-- on/before it (released_at); late = active, unpaid then and past the grace days then; counted
-- up to the month of p_as_of (December when p_as_of is in a later year). The app reads last year
-- at today − 1 year («السنة الماضية في مثل هذا الوقت»). Membership periods are today's (group moves
-- and status changes are not replayed).
-- before_records: p_as_of is before the first recorded payment (the paper sheets were entered on
-- 2026-09-28 for the whole year), so the snapshot would wrongly show nobody paid: the app shows no
-- comparison then. Without p_as_of nothing changes (same result as before).
-- Signature change: both functions dropped and recreated; 1-argument calls still work.
-- Body = pg_get_functiondef at m33 with the snapshot branch added.
-- Undo: supabase/rollback/m34_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

drop function public.report_fee_stats(integer);
drop function app_private.report_fee_stats(integer);

CREATE OR REPLACE FUNCTION app_private.report_fee_stats(p_year integer, p_as_of date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cur_year integer := extract(year from current_date)::integer;
  ref integer;
  grace integer := (select s.grace_days from public.settings s);
  records_from date := (select min(pm.created_at)::date from public.payment_months pm);
  r jsonb;
begin
  perform app_private.require_committee();
  if p_year is null or extract(year from p_as_of) < p_year then perform app_private.fail('invalid_input'); end if;
  ref := case when p_as_of is not null then
                case when extract(year from p_as_of) = p_year then extract(month from p_as_of)::integer else 12 end
              when p_year = cur_year then extract(month from current_date)::integer
              when p_year < cur_year then 12 else 0 end;

  with g0 as (
    select mg.member_id, mg.month, mg.status, mg.paid, mg.due, gr.code,
           exists (select 1 from public.payment_months pm
                   where pm.member_id = mg.member_id and pm.year = p_year and pm.month = mg.month
                     and pm.created_at::date <= p_as_of
                     and (pm.released_at is null or pm.released_at::date > p_as_of)) as paid_then
    from app_private.month_grid() mg join public.groups gr on gr.id = mg.group_id
    where mg.year = p_year
  ),
  g as (
    select g0.member_id, g0.month, g0.status, g0.code,
           case when p_as_of is null then g0.paid else g0.paid_then end as paid,
           case when p_as_of is null then g0.due
                else not g0.paid_then and g0.status = 'active' and p_as_of >= make_date(p_year, g0.month, 1) + grace end as due
    from g0
  ),
  active_now as (select g.member_id, g.code from g where g.month = ref and g.status = 'active'),
  late as (select g.member_id, count(*) filter (where g.due)::integer as n from g where g.month <= ref group by g.member_id),
  m as (select a.member_id, a.code, coalesce(l.n, 0) as n from active_now a left join late l on l.member_id = a.member_id),
  blocks as (
    select x.code,
           jsonb_build_object(
             'active', count(*),
             'paid_up', count(*) filter (where x.n = 0),
             'paid_up_pct', coalesce(round(100.0 * count(*) filter (where x.n = 0) / nullif(count(*), 0), 1), 0),
             'owe_1', count(*) filter (where x.n = 1),
             'owe_2_3', count(*) filter (where x.n between 2 and 3),
             'owe_4plus', count(*) filter (where x.n >= 4)) as b
    from (select m.code, m.n from m union all select null, m.n from m) x
    group by x.code
  )
  select jsonb_build_object(
    'year', p_year,
    'ref_month', ref,
    'as_of', p_as_of,
    'before_records', p_as_of is not null and (records_from is null or p_as_of < records_from),
    'overall', coalesce((select b.b from blocks b where b.code is null),
                        jsonb_build_object('active', 0, 'paid_up', 0, 'paid_up_pct', 0, 'owe_1', 0, 'owe_2_3', 0, 'owe_4plus', 0)),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('group_code', b.code) || b.b order by b.code)
                        from blocks b where b.code is not null), '[]'::jsonb),
    'months', (select jsonb_agg(jsonb_build_object(
                 'month', k,
                 'active', (select count(*) from g where g.month = k and g.status = 'active'),
                 'paid', (select count(*) from g where g.month = k and g.status = 'active' and g.paid),
                 'unpaid', (select count(*) from g where g.month = k and g.status = 'active' and not g.paid
                              and make_date(p_year, k, 1) <= coalesce(p_as_of, current_date)))
               order by k)
               from generate_series(1, 12) k))
  into r;
  return r;
end $function$
;

create function public.report_fee_stats(p_year integer, p_as_of date default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select app_private.report_fee_stats(p_year => p_year, p_as_of => p_as_of)
$$;

revoke all on function app_private.report_fee_stats(integer, date), public.report_fee_stats(integer, date)
from public, anon, authenticated;
grant execute on function app_private.report_fee_stats(integer, date), public.report_fee_stats(integer, date)
to authenticated, service_role;
