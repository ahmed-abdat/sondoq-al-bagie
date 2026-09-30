-- ════════════════════════════════════════════════════════════════════════════════════════
-- M34 · fair «الإحصاءات» trend: report_fee_stats(p_year, p_ref_month default null).
-- p_ref_month counts a year up to that month (1–12) instead of the default (this month for the
-- current year, December for a past one), so last year can be read "at the same point" as this
-- year (the app passes this year's ref_month). The months list stays the whole year. Signature
-- change: both functions dropped and recreated; the old one-argument calls still work (default).
-- Body = pg_get_functiondef at m33, only the ref line changed.
-- Undo: supabase/rollback/m34_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

drop function public.report_fee_stats(integer);
drop function app_private.report_fee_stats(integer);

CREATE OR REPLACE FUNCTION app_private.report_fee_stats(p_year integer, p_ref_month integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cur_year integer := extract(year from current_date)::integer;
  ref integer;
  r jsonb;
begin
  perform app_private.require_committee();
  if p_year is null or p_ref_month not between 1 and 12 then perform app_private.fail('invalid_input'); end if;
  ref := coalesce(p_ref_month,
                  case when p_year = cur_year then extract(month from current_date)::integer
                       when p_year < cur_year then 12 else 0 end);

  with g as (
    select mg.member_id, mg.month, mg.status, mg.paid, mg.due, gr.code
    from app_private.month_grid() mg join public.groups gr on gr.id = mg.group_id
    where mg.year = p_year
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
    'overall', coalesce((select b.b from blocks b where b.code is null),
                        jsonb_build_object('active', 0, 'paid_up', 0, 'paid_up_pct', 0, 'owe_1', 0, 'owe_2_3', 0, 'owe_4plus', 0)),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('group_code', b.code) || b.b order by b.code)
                        from blocks b where b.code is not null), '[]'::jsonb),
    'months', (select jsonb_agg(jsonb_build_object(
                 'month', k,
                 'active', (select count(*) from g where g.month = k and g.status = 'active'),
                 'paid', (select count(*) from g where g.month = k and g.status = 'active' and g.paid),
                 'unpaid', (select count(*) from g where g.month = k and g.status = 'active' and not g.paid
                              and make_date(p_year, k, 1) <= current_date))
               order by k)
               from generate_series(1, 12) k))
  into r;
  return r;
end $function$
;

create function public.report_fee_stats(p_year integer, p_ref_month integer default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select app_private.report_fee_stats(p_year => p_year, p_ref_month => p_ref_month)
$$;

revoke all on function app_private.report_fee_stats(integer, integer), public.report_fee_stats(integer, integer)
from public, anon, authenticated;
grant execute on function app_private.report_fee_stats(integer, integer), public.report_fee_stats(integer, integer)
to authenticated, service_role;
