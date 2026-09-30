-- ════════════════════════════════════════════════════════════════════════════════════════
-- M32 · «الإحصاءات» analytics (owner 2026-09-30, docs/COMMITTEE-ONLY-PLAN.md §10), committee only.
-- Counts and percentages, never names.
--
-- report_fee_stats(year): members active at the reference month (this month for the current year,
--   December for a past one): how many are paid up (no late month that year, grace days
--   respected), how many owe 1 / 2–3 / 4+ months, overall and per group; and per month how many
--   active members paid or not (a month counts as unpaid only once it has started).
-- report_levy_stats(id?): per levy, shares paid / not yet / exempt, collected vs expected, per group.
-- report_donation_stats(id?): per donation, member givers, outside donors, share of active
--   members who gave, collected vs target.
-- Undo: supabase/rollback/m32_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

create function app_private.report_fee_stats(p_year integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cur_year integer := extract(year from current_date)::integer;
  ref integer;
  r jsonb;
begin
  perform app_private.require_committee();
  if p_year is null then perform app_private.fail('invalid_input'); end if;
  ref := case when p_year = cur_year then extract(month from current_date)::integer
              when p_year < cur_year then 12 else 0 end;

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
end $$;

-- The member's group now (levies and donations).
create function app_private.current_group(p_member_id uuid) returns text
language sql stable set search_path = '' as $$
  select g.code from public.membership_periods mp join public.groups g on g.id = mp.group_id
  where mp.member_id = p_member_id and mp.cancelled_at is null and mp.from_month <= current_date
  order by mp.from_month desc limit 1;
$$;
revoke all on function app_private.current_group(uuid) from public, anon, authenticated;

create function app_private.report_levy_stats(p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_committee();
  return coalesce((
    with s as (
      select l.*, app_private.current_group(l.member_id) as code,
             (not l.exempt and l.left_amount = 0) as done
      from app_private.levy_shares() l
      where p_id is null or l.campaign_id = p_id
    ),
    per as (
      select s.campaign_id, s.code,
             count(*) as shares,
             count(*) filter (where s.done) as paid,
             count(*) filter (where s.exempt) as exempt,
             count(*) filter (where not s.done and not s.exempt) as unpaid,
             coalesce(sum(s.expected) filter (where not s.exempt), 0) as expected,
             coalesce(sum(s.paid), 0) as collected
      from s group by grouping sets ((s.campaign_id), (s.campaign_id, s.code))
    )
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'title', c.title, 'status', c.status,
             'opened_on', c.created_at::date,
             'days_open', coalesce(c.closed_at::date, current_date) - c.created_at::date,
             'shares', coalesce(t.shares, 0), 'paid', coalesce(t.paid, 0), 'unpaid', coalesce(t.unpaid, 0),
             'exempt', coalesce(t.exempt, 0),
             'paid_pct', coalesce(round(100.0 * t.paid / nullif(t.shares - t.exempt, 0), 1), 0),
             'expected', coalesce(t.expected, 0), 'collected', coalesce(t.collected, 0),
             'groups', coalesce((select jsonb_agg(jsonb_build_object(
                                  'group_code', p.code, 'shares', p.shares, 'paid', p.paid, 'unpaid', p.unpaid,
                                  'exempt', p.exempt,
                                  'paid_pct', coalesce(round(100.0 * p.paid / nullif(p.shares - p.exempt, 0), 1), 0))
                                  order by p.code)
                                 from per p where p.campaign_id = c.id and p.code is not null), '[]'::jsonb))
           order by c.created_at desc)
    from public.campaigns c
    left join per t on t.campaign_id = c.id and t.code is null
    where c.kind = 'levy' and (p_id is null or c.id = p_id)), '[]'::jsonb);
end $$;

create function app_private.report_donation_stats(p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  active_members integer := (select count(*) from app_private.month_grid() mg
                             where mg.year = extract(year from current_date) and mg.month = extract(month from current_date)
                               and mg.status = 'active');
begin
  perform app_private.require_committee();
  return coalesce((
    with a as (
      select x.campaign_id, x.member_id, x.payment_id, x.amount
      from public.payment_allocations x join public.payments p on p.id = x.payment_id and p.status = 'confirmed'
      where x.kind = 'campaign'
    ),
    per as (
      select a.campaign_id,
             count(distinct a.member_id)::integer as member_givers,
             count(distinct a.payment_id) filter (where a.member_id is null)::integer as outside_givers,
             sum(a.amount)::bigint as collected
      from a group by a.campaign_id
    )
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'title', c.title, 'status', c.status, 'opened_on', c.created_at::date,
             'member_givers', coalesce(t.member_givers, 0), 'outside_givers', coalesce(t.outside_givers, 0),
             'givers', coalesce(t.member_givers, 0) + coalesce(t.outside_givers, 0),
             'active_members', active_members,
             'member_pct', coalesce(round(100.0 * t.member_givers / nullif(active_members, 0), 1), 0),
             'collected', coalesce(t.collected, 0), 'target', c.target_amount,
             'target_pct', round(100.0 * coalesce(t.collected, 0) / nullif(c.target_amount, 0), 1))
           order by c.created_at desc)
    from public.campaigns c left join per t on t.campaign_id = c.id
    where c.kind = 'donation' and (p_id is null or c.id = p_id)), '[]'::jsonb);
end $$;

create function public.report_fee_stats(p_year integer) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select app_private.report_fee_stats(p_year => p_year)
$$;
create function public.report_levy_stats(p_id uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select app_private.report_levy_stats(p_id => p_id)
$$;
create function public.report_donation_stats(p_id uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select app_private.report_donation_stats(p_id => p_id)
$$;

revoke all on function app_private.report_fee_stats(integer), public.report_fee_stats(integer),
  app_private.report_levy_stats(uuid), public.report_levy_stats(uuid),
  app_private.report_donation_stats(uuid), public.report_donation_stats(uuid)
from public, anon, authenticated;
grant execute on function app_private.report_fee_stats(integer), public.report_fee_stats(integer),
  app_private.report_levy_stats(uuid), public.report_levy_stats(uuid),
  app_private.report_donation_stats(uuid), public.report_donation_stats(uuid)
to authenticated, service_role;
