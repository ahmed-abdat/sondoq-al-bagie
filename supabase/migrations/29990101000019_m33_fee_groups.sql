-- ════════════════════════════════════════════════════════════════════════════════════════
-- M33 · fee groups («الفئات», owner 2026-09-30, docs/COMMITTEE-ONLY-PLAN.md §11).
--
-- «مسؤول» only: create a group (next free letter, a name, its monthly fee from a year), change a
-- group's fee (set_group_price, was any committee member), move members to another group from a
-- month (chosen members or a whole group; a new membership period each, so past months keep their
-- fee; refused when a month from then on is already paid or waiting), retire a group from a year
-- once nobody is in it then (history kept). A committee read groups_overview(year).
-- Paper list numbers (list_code / number) never change with the group. Everything is audited.
-- Also: levy analytics per group carry expected and collected (Lane B, plan §10).
-- Undo: supabase/rollback/m33_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

alter table public.groups add column retired_from integer check (retired_from between 2020 and 2100);
create unique index groups_name_key on public.groups (btrim(name));
drop trigger a_guard on public.groups;
create trigger a_guard before update or delete on public.groups for each row execute function
  app_private.tg_append_only('', 'name,retired_from');

-- nobody joins or moves into a group from the year it is retired
create function app_private.tg_period_group_open() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.groups g
             where g.id = new.group_id and g.retired_from <= extract(year from new.from_month)) then
    perform app_private.fail('group_retired');
  end if;
  return new;
end $$;
revoke all on function app_private.tg_period_group_open() from public, anon, authenticated;
create trigger b_group_open before insert on public.membership_periods for each row
  execute function app_private.tg_period_group_open();

/* ───────────────────────── «مسؤول»: groups ───────────────────────── */

-- A new group: the next free letter (C, D, …), a name shown in the app («ج»), its fee from a year.
create function app_private.create_group(p_name text, p_monthly_amount integer, p_from_year integer) returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text;
  gid smallint;
begin
  perform app_private.require_admin();
  if btrim(coalesce(p_name, '')) = '' or coalesce(p_monthly_amount, 0) <= 0 or p_from_year is null then
    perform app_private.fail('invalid_input');
  end if;
  if exists (select 1 from public.groups g where btrim(g.name) = btrim(p_name)) then
    perform app_private.fail('group_name_taken');
  end if;
  select chr(c) into code from generate_series(ascii('A'), ascii('Z')) c
  where not exists (select 1 from public.groups g where g.code = chr(c)) order by c limit 1;
  if code is null then perform app_private.fail('invalid_input'); end if;
  perform app_private.set_action('create_group');
  insert into public.groups (code, name) values (code, btrim(p_name)) returning id into gid;
  insert into public.group_prices (group_id, year, monthly_amount) values (gid, p_from_year, p_monthly_amount);
  return code;
end $$;

-- change a group's fee: «مسؤول» only (owner 2026-09-30); not for a retired year
CREATE OR REPLACE FUNCTION app_private.set_group_price(p_group_code text, p_year integer, p_monthly_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  gid smallint;
begin
  perform app_private.require_admin();
  select id into gid from public.groups where code = p_group_code;
  if gid is null then perform app_private.fail('unknown_group'); end if;
  if exists (select 1 from public.groups g where g.id = gid and g.retired_from <= p_year) then
    perform app_private.fail('group_retired');
  end if;
  perform app_private.set_action('set_group_price');
  insert into public.group_prices (group_id, year, monthly_amount) values (gid, p_year, p_monthly_amount)
  on conflict (group_id, year) do update set monthly_amount = excluded.monthly_amount;
end $function$
;

-- Move members to p_to_group from p_from_month: chosen members (p_member_ids) or everybody whose
-- open period is in p_from_group. Each gets a new period (same status) from that month; the old
-- one ends the month before, so past months keep their fee. Members already in the target group
-- are skipped (a repeat moves nobody). A member is blocked when a month from then on is already
-- paid or waiting (months_already_paid_after), or his current period starts on/after that month
-- (before_current_period). p_dry_run: nothing is written, the result says exactly what would
-- happen (the preview). A real run with anyone blocked is refused as a whole.
-- Returns {moved, skipped_already_in_target, blocked: [{member_id, member_ref, name, reason}],
--          from_fee, to_fee}.
create function app_private.move_members_to_group(
  p_to_group text, p_from_month date, p_member_ids uuid[] default null, p_from_group text default null,
  p_reason text default null, p_dry_run boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m date := date_trunc('month', p_from_month)::date;
  to_gid smallint;
  n integer := 0;
  r record;
  skipped integer;
  blocked jsonb;
  from_fee integer;
  to_fee integer;
begin
  perform app_private.require_admin();
  if p_from_month is null or (p_member_ids is null) = (p_from_group is null) then
    perform app_private.fail('invalid_input');
  end if;
  select id into to_gid from public.groups where code = p_to_group;
  if to_gid is null then perform app_private.fail('unknown_group'); end if;
  if p_from_group is not null and not exists (select 1 from public.groups where code = p_from_group) then
    perform app_private.fail('unknown_group');
  end if;
  select gp.monthly_amount into to_fee from public.group_prices gp where gp.group_id = to_gid and gp.year = extract(year from m);
  if to_fee is null then perform app_private.fail('no_price'); end if;

  -- the open periods concerned, already in the target group or not
  if to_regclass('pg_temp.move_candidates') is null then
    create temp table move_candidates (period_id uuid, member_id uuid, group_id smallint,
                                       status public.membership_status, from_month date) on commit drop;
  end if;
  truncate move_candidates;
  insert into move_candidates
  select p.id, p.member_id, p.group_id, p.status, p.from_month
  from public.membership_periods p join public.groups g on g.id = p.group_id
  where p.cancelled_at is null and p.to_month is null
    and ((p_member_ids is not null and p.member_id = any (p_member_ids))
         or (p_from_group is not null and g.code = p_from_group));

  skipped := (select count(*) from move_candidates c where c.group_id = to_gid);
  select coalesce(jsonb_agg(jsonb_build_object('member_id', x.member_id, 'member_ref', x.ref, 'name', x.full_name,
                                               'reason', x.reason) order by x.ref), '[]'::jsonb)
    into blocked
  from (select c.member_id, mem.list_code || '-' || mem.number as ref, mem.full_name,
               case when c.from_month >= m then 'before_current_period' else 'months_already_paid_after' end as reason
        from move_candidates c join public.members mem on mem.id = c.member_id
        where c.group_id <> to_gid
          and (c.from_month >= m
               or exists (select 1 from public.payment_months pm
                          where pm.member_id = c.member_id and pm.released_at is null and make_date(pm.year, pm.month, 1) >= m)
               or exists (select 1 from public.payment_allocations a join public.payments p on p.id = a.payment_id
                          where a.member_id = c.member_id and a.kind = 'months' and p.status = 'pending'
                            and make_date(a.year, a.month, 1) >= m))) x;
  select case when count(distinct c.group_id) = 1 then max(gp.monthly_amount) end into from_fee
  from move_candidates c left join public.group_prices gp on gp.group_id = c.group_id and gp.year = extract(year from m)
  where c.group_id <> to_gid;

  if p_dry_run then
    return jsonb_build_object('moved', (select count(*) from move_candidates c where c.group_id <> to_gid)
                                       - jsonb_array_length(blocked),
                              'skipped_already_in_target', skipped, 'blocked', blocked,
                              'from_fee', from_fee, 'to_fee', to_fee);
  end if;
  if jsonb_array_length(blocked) > 0 then
    perform app_private.fail(blocked -> 0 ->> 'reason', format('%s member(s) blocked', jsonb_array_length(blocked)));
  end if;

  perform app_private.set_action('move_members_to_group');
  for r in select c.* from move_candidates c where c.group_id <> to_gid loop
    update public.membership_periods set to_month = (m - interval '1 month')::date where id = r.period_id;
    insert into public.membership_periods (member_id, group_id, status, from_month, reason, created_by)
    values (r.member_id, to_gid, r.status, m, coalesce(nullif(btrim(p_reason), ''), 'تغيير الفئة'), auth.uid());
    n := n + 1;
  end loop;
  return jsonb_build_object('moved', n, 'skipped_already_in_target', skipped, 'blocked', '[]'::jsonb,
                            'from_fee', from_fee, 'to_fee', to_fee);
end $$;

-- Retire a group from a year: nobody may be in it from then on (history before stays).
create function app_private.retire_group(p_group text, p_from_year integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  gid smallint;
begin
  perform app_private.require_admin();
  select id into gid from public.groups where code = p_group;
  if gid is null then perform app_private.fail('unknown_group'); end if;
  if p_from_year is null then perform app_private.fail('invalid_input'); end if;
  if exists (select 1 from public.membership_periods p
             where p.group_id = gid and p.cancelled_at is null
               and coalesce(p.to_month, 'infinity'::date) >= make_date(p_from_year, 1, 1)) then
    perform app_private.fail('group_has_members');
  end if;
  perform app_private.set_action('retire_group');
  update public.groups set retired_from = p_from_year where id = gid;
end $$;

-- A group change (change_member_group → change_member_status) never covers a month already paid
-- or waiting: the paid month would change price (found by the accuracy audit). Current body,
-- pg_get_functiondef at m32, the two checks extended to group changes.
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
  -- a paid month keeps the price it was paid at: no status or group change over it (accuracy audit)
  if exists (select 1 from public.payment_months pm where pm.member_id = p_member_id and pm.released_at is null
             and make_date(pm.year, pm.month, 1) >= m and (p_status <> 'active' or gid <> cur.group_id)) then
    perform app_private.fail('months_already_paid_after');
  end if;
  if (p_status <> 'active' or gid <> cur.group_id) and exists (
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

/* ───────────────────────── committee read ───────────────────────── */

-- Every group: fee this year and next, members in it (at this month for the current year, January
-- otherwise; left and deceased not counted), retired year.
create function app_private.groups_overview(p_year integer)
returns table (code text, name text, fee integer, next_year_fee integer, members integer, retired_from integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  ref date := case when p_year = extract(year from current_date) then date_trunc('month', current_date)::date
                   else make_date(p_year, 1, 1) end;
begin
  perform app_private.require_committee();
  return query
  select g.code, g.name,
         (select gp.monthly_amount from public.group_prices gp where gp.group_id = g.id and gp.year = p_year),
         (select gp.monthly_amount from public.group_prices gp where gp.group_id = g.id and gp.year = p_year + 1),
         (select count(*)::integer from public.membership_periods p
          where p.group_id = g.id and p.cancelled_at is null and p.status not in ('left', 'deceased')
            and ref between p.from_month and coalesce(p.to_month, 'infinity'::date)),
         g.retired_from
  from public.groups g
  order by g.code;
end $$;

/* ───────────────────────── levy analytics per group: expected and collected ───────────────────────── */

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
                                  'exempt', p.exempt, 'expected', p.expected, 'collected', p.collected,
                                  'paid_pct', coalesce(round(100.0 * p.paid / nullif(p.shares - p.exempt, 0), 1), 0))
                                  order by p.code)
                                 from per p where p.campaign_id = c.id and p.code is not null), '[]'::jsonb))
           order by c.created_at desc)
    from public.campaigns c
    left join per t on t.campaign_id = c.id and t.code is null
    where c.kind = 'levy' and (p_id is null or c.id = p_id)), '[]'::jsonb);
end $function$
;

/* ───────────────────────── wrappers and grants ───────────────────────── */

create function public.create_group(p_name text, p_monthly_amount integer, p_from_year integer) returns text
language sql security invoker set search_path = '' as $$
  select app_private.create_group(p_name => p_name, p_monthly_amount => p_monthly_amount, p_from_year => p_from_year)
$$;
create function public.move_members_to_group(
  p_to_group text, p_from_month date, p_member_ids uuid[] default null, p_from_group text default null,
  p_reason text default null, p_dry_run boolean default false
) returns jsonb
language sql security invoker set search_path = '' as $$
  select app_private.move_members_to_group(p_to_group => p_to_group, p_from_month => p_from_month,
                                           p_member_ids => p_member_ids, p_from_group => p_from_group, p_reason => p_reason,
                                           p_dry_run => p_dry_run)
$$;
create function public.retire_group(p_group text, p_from_year integer) returns void
language sql security invoker set search_path = '' as $$
  select app_private.retire_group(p_group => p_group, p_from_year => p_from_year)
$$;
create function public.groups_overview(p_year integer)
returns table (code text, name text, fee integer, next_year_fee integer, members integer, retired_from integer)
language sql stable security invoker set search_path = '' as $$
  select * from app_private.groups_overview(p_year => p_year)
$$;

revoke all on function app_private.create_group(text, integer, integer), public.create_group(text, integer, integer),
  app_private.move_members_to_group(text, date, uuid[], text, text, boolean), public.move_members_to_group(text, date, uuid[], text, text, boolean),
  app_private.retire_group(text, integer), public.retire_group(text, integer),
  app_private.groups_overview(integer), public.groups_overview(integer)
from public, anon, authenticated;
grant execute on function app_private.create_group(text, integer, integer), public.create_group(text, integer, integer),
  app_private.move_members_to_group(text, date, uuid[], text, text, boolean), public.move_members_to_group(text, date, uuid[], text, text, boolean),
  app_private.retire_group(text, integer), public.retire_group(text, integer),
  app_private.groups_overview(integer), public.groups_overview(integer)
to authenticated, service_role;
