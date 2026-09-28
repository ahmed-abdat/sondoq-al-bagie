-- ════════════════════════════════════════════════════════════════════════════════════════
-- M7 · two member lists. The fund keeps two paper lists with their own numbering: list A
-- (1000 MRO, numbers 1–21) and list B (500 MRO, numbers 1–70). A member is identified by
-- (list_code, number) and shown as "A-12" / "B-12". The list is the member's sheet (fixed);
-- the group (price) can still change over time through membership periods.
-- Also: left / deceased members drop out of counts and late lists (history kept); the admin
-- can renumber a member, change group, and get the next free number of a list.
-- ════════════════════════════════════════════════════════════════════════════════════════

alter table public.members add column list_code text not null default 'B' check (list_code ~ '^[A-Z]$');
alter table public.members alter column list_code drop default;
alter table public.members drop constraint members_number_key;
alter table public.members add constraint members_list_number_key unique (list_code, number);

drop trigger a_guard on public.members;
create trigger a_guard before update or delete on public.members for each row execute function
  app_private.tg_append_only('', 'full_name,phone,note,number');

/* ───────────────────────── rollup + public views with the list ───────────────────────── */

drop view public.member_status, public.arrears, public.fund_summary;
drop function app_private.public_member_status(), app_private.member_rollup(), app_private.public_fund_summary();

create function app_private.member_rollup()
returns table (member_id uuid, list_code text, number integer, full_name text, group_code text,
               member_status public.membership_status, months_paid_this_year integer, months_behind integer,
               amount_owed integer)
language sql stable security definer set search_path = '' as $$
  with g as (
    select mg.member_id,
           count(*) filter (where mg.paid and mg.year = extract(year from current_date))::integer as paid_y,
           count(*) filter (where mg.due)::integer as behind,
           coalesce(sum(mg.owed), 0)::integer as owed
    from app_private.month_grid() mg group by mg.member_id
  ),
  cur as (   -- the period covering this month, else the most recent one
    select distinct on (p.member_id) p.member_id, p.group_id, p.status
    from public.membership_periods p
    where p.cancelled_at is null and p.from_month <= current_date
    order by p.member_id, p.from_month desc
  )
  select m.id, m.list_code, m.number, m.full_name, gr.code, cur.status,
         coalesce(g.paid_y, 0), coalesce(g.behind, 0), coalesce(g.owed, 0)
  from public.members m
  left join cur on cur.member_id = m.id
  left join public.groups gr on gr.id = cur.group_id
  left join g on g.member_id = m.id;
$$;

-- Every member (history too) with the current status; «متأخر» only for active members.
create function app_private.public_member_status()
returns table (member_id uuid, list_code text, number integer, member_ref text, full_name text, group_code text,
               member_status public.membership_status, months_paid_this_year integer, months_behind integer,
               status_label text, amount_owed integer)
language sql stable security definer set search_path = '' as $$
  select r.member_id, r.list_code, r.number, r.list_code || '-' || r.number, r.full_name, r.group_code, r.member_status,
         r.months_paid_this_year, r.months_behind,
         case when r.member_status = 'active' and r.months_behind > 0 then 'متأخر'
              when r.member_status = 'active' then 'منتظم'
              when r.member_status = 'exempt' then 'معفى'
              when r.member_status = 'left' then 'غادر'
              when r.member_status = 'deceased' then 'متوفى'
              else 'متوقف' end,
         case when (select s.show_amount_owed from public.settings s) then r.amount_owed end
  from app_private.member_rollup() r;
$$;

-- Counts are over ACTIVE members only («X من N»).
create function app_private.public_fund_summary()
returns table (opening_balance integer, money_in bigint, money_out bigint, transfers_in bigint, balance bigint,
               collected_this_year bigint, spent_this_year bigint, members_ok integer, members_behind integer,
               last_activity_at timestamptz, members_active integer)
language sql stable security definer set search_path = '' as $$
  with fin as (
    select coalesce(sum(a.amount), 0) as total,
           coalesce(sum(a.amount) filter (where extract(year from p.paid_on) = extract(year from current_date)), 0) as this_year
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    where p.status = 'confirmed' and a.kind in ('months', 'credit')
  ),
  fout as (
    select coalesce(sum(e.amount), 0) as total,
           coalesce(sum(e.amount) filter (where extract(year from e.spent_on) = extract(year from current_date)), 0) as this_year
    from public.expenses e where e.cancelled_at is null and e.campaign_id is null
  ),
  tr as (select coalesce(sum(t.amount), 0) as total from public.transfers t),
  mem as (
    select count(*) filter (where r.member_status = 'active' and r.months_behind = 0)::integer as ok,
           count(*) filter (where r.member_status = 'active' and r.months_behind > 0)::integer as behind,
           count(*) filter (where r.member_status = 'active')::integer as active
    from app_private.member_rollup() r
  )
  select s.opening_balance, fin.total, fout.total, tr.total,
         s.opening_balance + fin.total - fout.total + tr.total,
         fin.this_year, fout.this_year, mem.ok, mem.behind,
         greatest((select max(coalesce(p.cancelled_at, p.decided_at)) from public.payments p),
                  (select max(coalesce(e.cancelled_at, e.created_at)) from public.expenses e)),
         mem.active
  from public.settings s, fin, fout, tr, mem;
$$;

create view public.member_status with (security_invoker = true) as
  select * from app_private.public_member_status();
create view public.fund_summary with (security_invoker = true) as
  select * from app_private.public_fund_summary();

-- Committee: late ACTIVE members (left/deceased/exempt are never reminded), with the phone.
create view public.arrears with (security_invoker = true) as
  select m.id as member_id, m.number, m.full_name, m.phone, r.group_code, r.member_status,
         o.months, o.months_count, o.amount_owed, coalesce(cr.credit, 0) as credit,
         (select max(rm.sent_at) from public.reminders rm where rm.member_id = m.id) as last_reminded_at,
         m.list_code, m.list_code || '-' || m.number as member_ref
  from public.members m
  join app_private.member_owed_months() o on o.member_id = m.id
  join app_private.member_rollup() r on r.member_id = m.id
  left join app_private.member_credit() cr on cr.member_id = m.id
  where r.member_status = 'active';

-- Committee: every member with current status, group and phone (RLS on members: committee only).
create view public.members_admin with (security_invoker = true) as
  select m.id as member_id, m.list_code, m.number, m.list_code || '-' || m.number as member_ref, m.full_name,
         m.phone, m.note, r.group_code, r.member_status, r.months_paid_this_year, r.months_behind, r.amount_owed,
         (select min(p.from_month) from public.membership_periods p where p.member_id = m.id and p.cancelled_at is null)
           as joined_month,
         m.created_at
  from public.members m
  join app_private.member_rollup() r on r.member_id = m.id;

revoke all on public.member_status, public.fund_summary, public.arrears, public.members_admin
  from public, anon, authenticated;
grant select on public.member_status, public.fund_summary to anon, authenticated, service_role;
grant select on public.arrears, public.members_admin to authenticated, service_role;
revoke all on function app_private.member_rollup(), app_private.public_member_status(), app_private.public_fund_summary()
  from public, anon, authenticated;
grant execute on function app_private.public_member_status(), app_private.public_fund_summary()
  to anon, authenticated, service_role;
grant execute on function app_private.member_rollup() to authenticated, service_role;

/* ───────────────────────── receipts and queue carry the list ───────────────────────── */

create or replace function public.verify_receipt(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'status', case when p.status = 'confirmed' then 'valid' else 'cancelled' end,
      'code', p.receipt_code,
      'receipt_no', p.receipt_year || '-' || lpad(p.receipt_seq::text, 4, '0'),
      'payer_name', p.payer_name,
      'amount', p.amount,
      'method', p.method,
      'paid_on', p.paid_on,
      'confirmed_at', p.decided_at,
      'confirmed_by_name', c.display_name,
      'confirmed_by_role', c.role,
      'txn_ref_last4', case when p.txn_ref is not null then right(p.txn_ref, 4) end,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('list_code', x.list_code, 'number', x.number, 'full_name', x.full_name, 'months', x.months)
                  order by x.list_code, x.number)
        from (select m.list_code, m.number, m.full_name,
                     coalesce(jsonb_agg(jsonb_build_object('year', a.year, 'month', a.month) order by a.year, a.month)
                              filter (where a.kind = 'months'), '[]'::jsonb) as months
              from public.payment_allocations a join public.members m on m.id = a.member_id
              where a.payment_id = p.id
              group by m.list_code, m.number, m.full_name) x), '[]'::jsonb),
      'campaign_titles', coalesce((
        select jsonb_agg(distinct c.title) from public.payment_allocations a join public.campaigns c on c.id = a.campaign_id
        where a.payment_id = p.id), '[]'::jsonb))
    from public.payments p left join public.committee c on c.user_id = p.decided_by
    where p.receipt_code = upper(btrim(p_code)) and p.status in ('confirmed', 'cancelled')),
    jsonb_build_object('status', 'not_found'));
$$;

create or replace view public.payment_queue with (security_invoker = true) as
  select p.id, p.status, p.payer_name, p.method, p.amount, p.paid_on, p.txn_ref, p.proof_path, p.note,
         p.created_at, p.created_by, rc.display_name as created_by_name,
         p.decided_at, p.decided_by, dc.display_name as decided_by_name,
         p.reject_reason, p.cancelled_at, p.cancel_reason,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'kind', a.kind, 'member_id', a.member_id, 'list_code', m.list_code, 'number', m.number, 'full_name', m.full_name,
                    'campaign_id', a.campaign_id, 'year', a.year, 'month', a.month, 'amount', a.amount)
                  order by m.list_code, m.number, a.year, a.month)
           from public.payment_allocations a left join public.members m on m.id = a.member_id
           where a.payment_id = p.id), '[]'::jsonb) as allocations,
         p.receipt_code,
         case when p.receipt_seq is not null then p.receipt_year || '-' || lpad(p.receipt_seq::text, 4, '0') end as receipt_no
  from public.payments p
  left join public.committee rc on rc.user_id = p.created_by
  left join public.committee dc on dc.user_id = p.decided_by;

/* ───────────────────────── member management RPCs ───────────────────────── */

drop function public.add_member(integer, text, text, date, text, text, public.membership_status);
-- p_list_code defaults to the group code (list A members pay group A, list B group B).
create function public.add_member(
  p_number integer, p_full_name text, p_group_code text, p_from_month date,
  p_phone text default null, p_note text default null, p_status public.membership_status default 'active',
  p_list_code text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  mid uuid;
  gid smallint;
  lst text := upper(coalesce(nullif(btrim(p_list_code), ''), p_group_code));
begin
  perform app_private.require_admin();
  select id into gid from public.groups where code = p_group_code;
  if gid is null then perform app_private.fail('unknown_group'); end if;
  if lst !~ '^[A-Z]$' then perform app_private.fail('unknown_list'); end if;
  if exists (select 1 from public.members where list_code = lst and number = p_number) then
    perform app_private.fail('number_taken');
  end if;
  perform app_private.set_action('add_member');
  insert into public.members (list_code, number, full_name, phone, note, created_by)
  values (lst, p_number, btrim(p_full_name), nullif(btrim(p_phone), ''), p_note, auth.uid())
  returning id into mid;
  insert into public.membership_periods (member_id, group_id, status, from_month, reason, created_by)
  values (mid, gid, p_status, date_trunc('month', p_from_month)::date, 'join', auth.uid());
  return mid;
end $$;

drop function public.update_member(uuid, text, text, text);
-- p_number: new number in the same list (null keeps it).
create function public.update_member(
  p_member_id uuid, p_full_name text, p_phone text, p_note text, p_number integer default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.members;
begin
  perform app_private.require_admin();
  select * into m from public.members where id = p_member_id for update;
  if m.id is null then perform app_private.fail('not_found'); end if;
  if p_number is not null and p_number <> m.number
     and exists (select 1 from public.members x where x.list_code = m.list_code and x.number = p_number) then
    perform app_private.fail('number_taken');
  end if;
  perform app_private.set_action('update_member');
  update public.members set full_name = btrim(p_full_name), phone = nullif(btrim(p_phone), ''), note = p_note,
                            number = coalesce(p_number, number)
  where id = p_member_id;
end $$;

-- Change only the group (price) from a month on, keeping the current status.
create function public.change_member_group(
  p_member_id uuid, p_from_month date, p_group_code text, p_reason text default 'تغيير المجموعة'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cur public.membership_periods;
begin
  perform app_private.require_admin();
  select * into cur from public.membership_periods
  where member_id = p_member_id and cancelled_at is null and to_month is null;
  if cur.id is null then perform app_private.fail('no_open_period'); end if;
  return public.change_member_status(p_member_id, p_from_month, cur.status, p_reason, p_group_code);
end $$;

-- Suggested number for a new member of a list (committee only; others get null).
create function public.next_member_number(p_list_code text) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(max(m.number), 0) + 1 from public.members m
  where m.list_code = upper(btrim(p_list_code)) and (app_private.is_committee() or app_private.is_server())
  having app_private.is_committee() or app_private.is_server();
$$;

revoke all on function
  public.add_member(integer, text, text, date, text, text, public.membership_status, text),
  public.update_member(uuid, text, text, text, integer),
  public.change_member_group(uuid, date, text, text),
  public.next_member_number(text)
from public, anon, authenticated;
grant execute on function
  public.add_member(integer, text, text, date, text, text, public.membership_status, text),
  public.update_member(uuid, text, text, text, integer),
  public.change_member_group(uuid, date, text, text),
  public.next_member_number(text)
to authenticated, service_role;
