-- Undo m33 (fee groups): back to the m32 state. set_group_price and report_levy_stats are
-- pg_get_functiondef of the m32 state. Run as postgres; also run first by m2_down.sql.
set client_min_messages = warning;
drop function if exists public.create_group(text, integer, integer), app_private.create_group(text, integer, integer),
  public.move_members_to_group(text, date, uuid[], text, text, boolean), app_private.move_members_to_group(text, date, uuid[], text, text, boolean),
  public.retire_group(text, integer), app_private.retire_group(text, integer),
  public.groups_overview(integer), app_private.groups_overview(integer);
drop trigger if exists b_group_open on public.membership_periods;
drop function if exists app_private.tg_period_group_open();
CREATE OR REPLACE FUNCTION app_private.set_group_price(p_group_code text, p_year integer, p_monthly_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  gid smallint;
begin
  perform app_private.require_committee();
  select id into gid from public.groups where code = p_group_code;
  if gid is null then perform app_private.fail('unknown_group'); end if;
  perform app_private.set_action('set_group_price');
  insert into public.group_prices (group_id, year, monthly_amount) values (gid, p_year, p_monthly_amount)
  on conflict (group_id, year) do update set monthly_amount = excluded.monthly_amount;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.report_levy_stats(p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION app_private.change_member_status(p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cur public.membership_periods;
  m date := date_trunc('month', p_from_month)::date;
  gid smallint;
  pid uuid;
begin
  perform app_private.require_admin();
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  select * into cur from public.membership_periods
  where member_id = p_member_id and cancelled_at is null and to_month is null for update;
  if cur.id is null then perform app_private.fail('no_open_period'); end if;
  if m <= cur.from_month then perform app_private.fail('before_current_period'); end if;
  if p_group_code is null then gid := cur.group_id;
  else
    select id into gid from public.groups where code = p_group_code;
    if gid is null then perform app_private.fail('unknown_group'); end if;
  end if;
  if exists (select 1 from public.payment_months pm where pm.member_id = p_member_id and pm.released_at is null
             and make_date(pm.year, pm.month, 1) >= m and p_status <> 'active') then
    perform app_private.fail('months_already_paid_after');
  end if;
  if p_status <> 'active' and exists (
       select 1 from public.payment_allocations a join public.payments p on p.id = a.payment_id
       where a.member_id = p_member_id and a.kind = 'months' and p.status = 'pending'
         and make_date(a.year, a.month, 1) >= m) then
    perform app_private.fail('months_pending_after');
  end if;
  perform app_private.set_action('change_member_status');
  update public.membership_periods set to_month = (m - interval '1 month')::date where id = cur.id;
  insert into public.membership_periods (member_id, group_id, status, from_month, reason, created_by)
  values (p_member_id, gid, p_status, m, btrim(p_reason), auth.uid())
  returning id into pid;
  return pid;
end $function$
;

drop trigger if exists a_guard on public.groups;
create trigger a_guard before update or delete on public.groups for each row execute function
  app_private.tg_append_only('', 'name');
drop index if exists public.groups_name_key;
alter table public.groups drop column if exists retired_from;
