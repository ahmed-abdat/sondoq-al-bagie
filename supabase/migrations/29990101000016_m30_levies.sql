-- ════════════════════════════════════════════════════════════════════════════════════════
-- M30 · «اللوحة» levies (owner decisions 2026-09-30, docs/COMMITTEE-ONLY-PLAN.md §7.4,
-- supabase/drafts/M29-DESIGN.md).
--
-- A levy is a campaign of kind 'levy': a fixed share set on chosen members (one amount, an
-- optional group-B amount, or a per-member override). Each unpaid share is debt until paid:
-- it shows in arrears and the member statement. A share is paid in full, in one payment (any
-- committee member records it). «مسؤول» creates a levy, adds members, changes a share or exempts one
-- (reason required, audited). A closed levy still takes late share payments; that money goes to the main fund at once
-- (a transfer), still recorded against the levy.
-- Undo: supabase/rollback/m30_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

create type public.campaign_kind as enum ('donation', 'levy');
alter table public.campaigns add column kind public.campaign_kind not null default 'donation';

alter table public.campaign_participants
  add column exempted_at timestamptz,
  add column exempted_by uuid references auth.users (id),
  add column exempt_reason text check (exempted_at is null or btrim(exempt_reason) <> '');
create index campaign_participants_exempted_by_idx on public.campaign_participants (exempted_by);
drop trigger a_guard on public.campaign_participants;
create trigger a_guard before update or delete on public.campaign_participants for each row execute function
  app_private.tg_append_only('', 'expected_amount,exempted_at,exempted_by,exempt_reason');

-- an account that exempted a share has history (it cannot be deleted)
create or replace function app_private.account_has_history(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payments where p_user in (created_by, decided_by, cancelled_by))
      or exists (select 1 from public.expenses where p_user in (created_by, cancelled_by))
      or exists (select 1 from public.campaigns where p_user in (created_by, closed_by))
      or exists (select 1 from public.transfers where created_by = p_user)
      or exists (select 1 from public.reminders where sent_by = p_user)
      or exists (select 1 from public.members where created_by = p_user)
      or exists (select 1 from public.membership_periods where p_user in (created_by, cancelled_by))
      or exists (select 1 from public.fund_accounts where p_user in (created_by, updated_by))
      or exists (select 1 from public.settings where updated_by = p_user)
      or exists (select 1 from public.terms where created_by = p_user)
      or exists (select 1 from public.handovers where p_user in (started_by, submitted_by, accepted_by, cancelled_by))
      or exists (select 1 from public.balance_adjustments where created_by = p_user)
      or exists (select 1 from public.member_links where p_user in (created_by, revoked_by))
      or exists (select 1 from public.campaign_participants where exempted_by = p_user)
      or exists (select 1 from public.audit_log where actor = p_user);
$$;

/* ───────────────────────── shares ───────────────────────── */

-- Every levy share: expected, paid (confirmed), left (0 when exempt), with the paying payment.
create function app_private.levy_shares()
returns table (campaign_id uuid, title text, levy_status public.campaign_status, created_at timestamptz, member_id uuid,
               member_ref text, full_name text, expected integer, paid integer, left_amount integer, exempt boolean,
               exempt_reason text, exempted_at timestamptz, payment_id uuid, paid_on date)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, c.status, c.created_at, m.id, m.list_code || '-' || m.number, m.full_name, cp.expected_amount,
         coalesce(pd.amount, 0),
         case when cp.exempted_at is null then greatest(cp.expected_amount - coalesce(pd.amount, 0), 0) else 0 end,
         cp.exempted_at is not null, cp.exempt_reason, cp.exempted_at, pd.payment_id, pd.paid_on
  from public.campaigns c
  join public.campaign_participants cp on cp.campaign_id = c.id
  join public.members m on m.id = cp.member_id
  left join lateral (
    select sum(a.amount)::integer as amount, (array_agg(p.id order by p.paid_on desc))[1] as payment_id,
           max(p.paid_on) as paid_on
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    where a.kind = 'campaign' and a.campaign_id = c.id and a.member_id = cp.member_id and p.status = 'confirmed') pd on true
  where c.kind = 'levy' and (app_private.is_committee() or app_private.is_server());
$$;

create view public.levy_shares with (security_invoker = true) as
  select * from app_private.levy_shares();
revoke all on public.levy_shares from public, anon, authenticated;
grant select on public.levy_shares to authenticated, service_role;

-- A levy allocation must be one member's whole, unpaid, not exempted share (owner: full share only).
create function app_private.tg_levy_allocation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
  cp public.campaign_participants;
begin
  if new.kind <> 'campaign' then return new; end if;
  select * into c from public.campaigns where id = new.campaign_id;
  if c.kind is distinct from 'levy' then return new; end if;
  if new.member_id is null then perform app_private.fail('levy_member_required'); end if;
  select * into cp from public.campaign_participants where campaign_id = c.id and member_id = new.member_id;
  if cp.campaign_id is null then perform app_private.fail('not_levy_member'); end if;
  if cp.exempted_at is not null then perform app_private.fail('levy_exempt'); end if;
  if new.amount <> cp.expected_amount then perform app_private.fail('levy_full_share'); end if;
  if exists (select 1 from public.payment_allocations a join public.payments p on p.id = a.payment_id
             where a.kind = 'campaign' and a.campaign_id = c.id and a.member_id = new.member_id
               and p.status in ('pending', 'confirmed') and a.payment_id <> new.payment_id) then
    perform app_private.fail('levy_share_paid');
  end if;
  return new;
end $$;
revoke all on function app_private.tg_levy_allocation() from public, anon, authenticated;

-- closed campaigns: levies excepted (current body, pg_get_functiondef at m29, one condition changed)
CREATE OR REPLACE FUNCTION app_private.tg_allocation_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  st public.payment_status;
  price integer;
  per public.membership_periods;
begin
  select status into st from public.payments where id = new.payment_id;
  if st is distinct from 'pending' then
    raise exception 'sondoq: allocations are added only to a new pending payment' using errcode = 'P0001', hint = 'not_pending';
  end if;
  if new.kind = 'months' then
    per := app_private.period_at(new.member_id, new.year, new.month);
    if per.id is null or per.status <> 'active' then
      perform app_private.month_error('month_not_owed', new.member_id, new.year, new.month);
    end if;
    price := app_private.price_at(new.member_id, new.year, new.month);
    if price is null then
      raise exception 'sondoq: no price set for % in %', per.group_id, new.year using errcode = 'P0001', hint = 'no_price';
    end if;
    if new.amount <> price then
      perform app_private.month_error('wrong_month_amount', new.member_id, new.year, new.month, price);
    end if;
  elsif new.kind = 'campaign' then
    -- a levy share stays payable after the levy closes (m30); a closed donation campaign takes nothing
    if not exists (select 1 from public.campaigns c where c.id = new.campaign_id and (c.status = 'open' or c.kind = 'levy')) then
      raise exception 'sondoq: campaign is not open' using errcode = 'P0001', hint = 'campaign_closed';
    end if;
  end if;
  return new;
end $function$
;
create trigger b_levy before insert on public.payment_allocations for each row execute function app_private.tg_levy_allocation();

/* ───────────────────────── committee: levies ───────────────────────── */

-- p_member_ids: all active / a group / chosen (the app picks). Group B members get p_amount_b when set.
create function app_private.create_levy(
  p_id uuid, p_title text, p_amount integer, p_member_ids uuid[], p_purpose text default null,
  p_deadline date default null, p_amount_b integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if exists (select 1 from public.campaigns where id = p_id) then return p_id; end if;   -- retried request
  if btrim(coalesce(p_title, '')) = '' or coalesce(p_amount, 0) <= 0 or p_amount_b <= 0
     or coalesce(cardinality(p_member_ids), 0) = 0 then
    perform app_private.fail('invalid_input');
  end if;
  if exists (select 1 from unnest(p_member_ids) x where not exists (select 1 from public.members m where m.id = x)) then
    perform app_private.fail('not_found');
  end if;
  perform app_private.set_action('create_levy');
  insert into public.campaigns (id, title, purpose, deadline, amount_mode, kind, created_by)
  values (p_id, btrim(p_title), nullif(btrim(p_purpose), ''), p_deadline,
          (case when p_amount_b is null then 'fixed' else 'per_group' end)::public.campaign_mode, 'levy', auth.uid());
  insert into public.campaign_participants (campaign_id, member_id, expected_amount)
  select p_id, x.id,
         case when p_amount_b is not null and (
                select g.code from public.membership_periods mp join public.groups g on g.id = mp.group_id
                where mp.member_id = x.id and mp.cancelled_at is null and mp.from_month <= current_date
                order by mp.from_month desc limit 1) = 'B'
              then p_amount_b else p_amount end
  from (select distinct u as id from unnest(p_member_ids) u) x;
  return p_id;
end $$;

-- An open levy that exists (for the changes below).
create function app_private.levy_for_change(p_id uuid) returns void
language plpgsql stable set search_path = '' as $$
declare
  c public.campaigns;
begin
  select * into c from public.campaigns where id = p_id;
  if c.id is null or c.kind <> 'levy' then perform app_private.fail('not_found'); end if;
  if c.status = 'closed' then perform app_private.fail('campaign_closed'); end if;
end $$;

-- A share can change only while nothing (pending or confirmed) pays it.
create function app_private.levy_share_unpaid(p_id uuid, p_member_id uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if exists (select 1 from public.payment_allocations a join public.payments p on p.id = a.payment_id
             where a.kind = 'campaign' and a.campaign_id = p_id and a.member_id = p_member_id
               and p.status in ('pending', 'confirmed')) then
    perform app_private.fail('levy_share_paid');
  end if;
end $$;
revoke all on function app_private.levy_for_change(uuid), app_private.levy_share_unpaid(uuid, uuid)
  from public, anon, authenticated;

-- More members on an open levy (members already in it keep their share).
create function app_private.add_levy_members(p_id uuid, p_member_ids uuid[], p_amount integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  perform app_private.require_admin();
  perform app_private.levy_for_change(p_id);
  if coalesce(p_amount, 0) <= 0 or coalesce(cardinality(p_member_ids), 0) = 0 then perform app_private.fail('invalid_input'); end if;
  if exists (select 1 from unnest(p_member_ids) x where not exists (select 1 from public.members m where m.id = x)) then
    perform app_private.fail('not_found');
  end if;
  perform app_private.set_action('add_levy_members');
  insert into public.campaign_participants (campaign_id, member_id, expected_amount)
  select p_id, x, p_amount from (select distinct u as x from unnest(p_member_ids) u) y
  on conflict (campaign_id, member_id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- One member's share (per-member override), only while it is unpaid.
create function app_private.set_levy_share(p_id uuid, p_member_id uuid, p_amount integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  perform app_private.levy_for_change(p_id);
  if coalesce(p_amount, 0) <= 0 then perform app_private.fail('invalid_input'); end if;
  if not exists (select 1 from public.campaign_participants where campaign_id = p_id and member_id = p_member_id) then
    perform app_private.fail('not_levy_member');
  end if;
  perform app_private.levy_share_unpaid(p_id, p_member_id);
  perform app_private.set_action('set_levy_share');
  update public.campaign_participants set expected_amount = p_amount
  where campaign_id = p_id and member_id = p_member_id;
end $$;

-- Exempt a member from his share (reason required, audited), or take the exemption back.
create function app_private.exempt_levy_share(p_id uuid, p_member_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  if not exists (select 1 from public.campaign_participants cp join public.campaigns c on c.id = cp.campaign_id
                 where cp.campaign_id = p_id and cp.member_id = p_member_id and c.kind = 'levy') then
    perform app_private.fail('not_levy_member');
  end if;
  perform app_private.levy_share_unpaid(p_id, p_member_id);
  perform app_private.set_action('exempt_levy_share');
  update public.campaign_participants set exempted_at = now(), exempted_by = auth.uid(), exempt_reason = btrim(p_reason)
  where campaign_id = p_id and member_id = p_member_id and exempted_at is null;
end $$;

create function app_private.unexempt_levy_share(p_id uuid, p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if not exists (select 1 from public.campaign_participants cp join public.campaigns c on c.id = cp.campaign_id
                 where cp.campaign_id = p_id and cp.member_id = p_member_id and c.kind = 'levy') then
    perform app_private.fail('not_levy_member');
  end if;
  perform app_private.set_action('unexempt_levy_share');
  update public.campaign_participants set exempted_at = null, exempted_by = null, exempt_reason = null
  where campaign_id = p_id and member_id = p_member_id and exempted_at is not null;
end $$;

/* ───────────────────────── confirm, statement, activity, arrears ───────────────────────── */

create or replace function app_private.confirm_payment(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  paid record;
begin
  if not app_private.can_confirm() then perform app_private.fail('not_confirmer'); end if;
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null then perform app_private.fail('not_found'); end if;
  if p.status = 'confirmed' then
    return jsonb_build_object('status', p.status, 'already', true, 'decided_by', p.decided_by, 'decided_at', p.decided_at,
      'decided_by_name', (select c.display_name from public.committee c where c.user_id = p.decided_by),
      'receipt_code', p.receipt_code);
  end if;
  if p.status <> 'pending' then perform app_private.fail('not_pending'); end if;
  if exists (select 1 from public.campaigns c
             where c.id in (select a.campaign_id from public.payment_allocations a
                            where a.payment_id = p.id and a.kind = 'campaign')
               and c.status = 'closed' and c.kind = 'donation'
             for share of c) then
    perform app_private.fail('campaign_closed');
  end if;

  perform app_private.set_action('confirm_payment');
  update public.payments set status = 'confirmed', decided_at = now(), decided_by = auth.uid() where id = p.id;

  perform set_config('sondoq.confirming', p.id::text, true);
  begin
    insert into public.payment_months (payment_id, member_id, year, month, amount)
    select a.payment_id, a.member_id, a.year, a.month, a.amount
    from public.payment_allocations a where a.payment_id = p.id and a.kind = 'months';
  exception when unique_violation then
    perform set_config('sondoq.confirming', '', true);
    select a.member_id, a.year, a.month into paid
    from public.payment_allocations a
    join public.payment_months pm on pm.member_id = a.member_id and pm.year = a.year and pm.month = a.month
                                 and pm.released_at is null
    where a.payment_id = p.id and a.kind = 'months'
    order by a.year, a.month
    limit 1;
    if paid.member_id is null then perform app_private.fail('month_already_paid'); end if;
    perform app_private.month_error('month_already_paid', paid.member_id, paid.year, paid.month);
  end;
  perform set_config('sondoq.confirming', '', true);

  if p.method <> 'paper' then perform app_private.issue_receipt(p.id); end if;

  -- a share of a closed «لوحة» goes to the main fund, still recorded against the levy (owner 2026-09-30)
  insert into public.transfers (from_campaign_id, amount, created_by)
  select a.campaign_id, sum(a.amount), auth.uid()
  from public.payment_allocations a join public.campaigns c on c.id = a.campaign_id
  where a.payment_id = p.id and a.kind = 'campaign' and c.kind = 'levy' and c.status = 'closed'
  group by a.campaign_id;

  return jsonb_build_object('status', 'confirmed', 'already', false, 'decided_by', auth.uid(), 'decided_at', now(),
    'decided_by_name', (select c.display_name from public.committee c where c.user_id = auth.uid()),
    'receipt_code', (select x.receipt_code from public.payments x where x.id = p.id));
end $$;

create or replace function app_private.member_statement(p_member_id uuid, p_year smallint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  y smallint := coalesce(p_year, extract(year from current_date)::smallint);
  r record;
begin
  perform app_private.require_committee();
  select m.id, m.list_code, m.number, m.full_name, m.phone, ro.group_code, ro.member_status
    into r
  from public.members m left join app_private.member_rollup() ro on ro.member_id = m.id
  where m.id = p_member_id;
  if r.id is null then perform app_private.fail('not_found'); end if;
  return jsonb_build_object(
    'member', jsonb_build_object('member_id', r.id, 'member_ref', r.list_code || '-' || r.number, 'full_name', r.full_name,
                                 'phone', r.phone, 'group_code', r.group_code, 'status', r.member_status),
    'year', y,
    'months', coalesce((
      select jsonb_agg(jsonb_build_object('month', mg.month, 'status', mg.status, 'price', mg.price, 'paid', mg.paid,
                                          'due', mg.due, 'payment_id', pm.payment_id) order by mg.month)
      from app_private.month_grid() mg
      left join public.payment_months pm on pm.member_id = mg.member_id and pm.year = mg.year and pm.month = mg.month
                                        and pm.released_at is null
      where mg.member_id = p_member_id and mg.year = y), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'payment_id', p.id, 'status', p.status, 'paid_on', p.paid_on, 'method', p.method, 'total', p.amount,
               'amount', x.amount, 'months', x.months, 'campaigns', x.campaigns,
               'receipt_no', case when p.receipt_seq is not null then p.receipt_year || '-' || lpad(p.receipt_seq::text, 4, '0') end,
               'receipt_code', p.receipt_code, 'note', p.note,
               'reason', coalesce(p.cancel_reason, p.reject_reason),
               'recorded_at', p.created_at, 'recorded_by_name', rc.display_name,
               'confirmed_at', case when p.status in ('confirmed', 'cancelled') then p.decided_at end,
               'confirmed_by_name', case when p.status in ('confirmed', 'cancelled') then dc.display_name end,
               'rejected_by_name', case when p.status = 'rejected' then dc.display_name end,
               'cancelled_at', p.cancelled_at, 'cancelled_by_name', cc.display_name)
             order by p.paid_on desc, p.created_at desc)
      from (select a.payment_id, sum(a.amount)::integer as amount,
                   coalesce(jsonb_agg(jsonb_build_object('year', a.year, 'month', a.month) order by a.year, a.month)
                            filter (where a.kind = 'months'), '[]'::jsonb) as months,
                   coalesce(jsonb_agg(distinct ca.title) filter (where a.kind = 'campaign'), '[]'::jsonb) as campaigns
            from public.payment_allocations a
            left join public.campaigns ca on ca.id = a.campaign_id
            where a.member_id = p_member_id
            group by a.payment_id) x
      join public.payments p on p.id = x.payment_id
      left join public.committee rc on rc.user_id = p.created_by
      left join public.committee dc on dc.user_id = p.decided_by
      left join public.committee cc on cc.user_id = p.cancelled_by
      where extract(year from p.paid_on) = y
         or exists (select 1 from public.payment_allocations a2
                    where a2.payment_id = p.id and a2.member_id = p_member_id and a2.year = y)), '[]'::jsonb),
    'owed', jsonb_build_object(
      'months', coalesce((select o.months from app_private.member_owed_months() o where o.member_id = p_member_id), '{}'),
      'months_count', coalesce((select o.months_count from app_private.member_owed_months() o where o.member_id = p_member_id), 0),
      'amount_owed', coalesce((select o.amount_owed from app_private.member_owed_months() o where o.member_id = p_member_id), 0),
      'credit', coalesce((select c.credit from app_private.member_credit() c where c.member_id = p_member_id), 0),
      'levy_left', coalesce((select sum(l.left_amount) from app_private.levy_shares() l where l.member_id = p_member_id), 0)),
    'levies', coalesce((
      select jsonb_agg(jsonb_build_object('campaign_id', l.campaign_id, 'title', l.title, 'status', l.levy_status,
                                          'expected', l.expected, 'paid', l.paid, 'left', l.left_amount, 'exempt', l.exempt,
                                          'exempt_reason', l.exempt_reason, 'payment_id', l.payment_id, 'paid_on', l.paid_on)
                       order by l.created_at)
      from app_private.levy_shares() l where l.member_id = p_member_id), '[]'::jsonb));
end $$;

create or replace function app_private.activity_log(p_before bigint default null, p_limit integer default 50)
returns table (id bigint, at timestamptz, actor uuid, actor_name text, action text, table_name text, row_id text,
               subject text, amount integer, reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_committee();
  return query
  with g as (
    select max(a.id) as id, a.at, a.actor, a.action,
           (array_agg(a.table_name || '|' || coalesce(a.row_id, '')
                      order by coalesce(array_position(array['payments', 'expenses', 'campaigns', 'members',
                        'membership_periods', 'committee', 'handovers', 'terms', 'settings', 'group_prices',
                        'fund_accounts', 'balance_adjustments', 'transfers', 'campaign_participants'], a.table_name), 99),
                        a.id))[1] as main
    from public.audit_log a
    where p_before is null or a.id < p_before
    group by a.at, a.actor, a.action
  ),
  page as (
    select g.id, g.at, g.actor, g.action, split_part(g.main, '|', 1) as tbl, nullif(split_part(g.main, '|', 2), '') as rid,
           case when split_part(g.main, '|', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then split_part(g.main, '|', 2)::uuid end as uid
    from g order by g.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select page.id, page.at, page.actor, c.display_name, page.action, page.tbl, page.rid,
         coalesce(pay.payer_name, ex.subject, mem.full_name, per.full_name, cam.title, com.display_name, lev.subject),
         coalesce(pay.amount, ex.amount, lev.amount),
         coalesce(pay.reason, ex.reason, per.reason, lev.reason)
  from page
  left join public.committee c on c.user_id = page.actor
  left join lateral (select p.payer_name, p.amount, coalesce(p.cancel_reason, p.reject_reason) as reason
                     from public.payments p where page.tbl = 'payments' and p.id = page.uid) pay on true
  left join lateral (select coalesce(e.note, e.category::text) as subject, e.amount, e.cancel_reason as reason
                     from public.expenses e where page.tbl = 'expenses' and e.id = page.uid) ex on true
  left join lateral (select m.full_name from public.members m
                     where page.tbl = 'members' and m.id = page.uid) mem on true
  left join lateral (select m.full_name, coalesce(mp.cancel_reason, mp.reason) as reason
                     from public.membership_periods mp join public.members m on m.id = mp.member_id
                     where page.tbl = 'membership_periods' and mp.id = page.uid) per on true
  left join lateral (select x.title from public.campaigns x
                     where page.tbl = 'campaigns' and x.id = page.uid) cam on true
  left join lateral (select x.display_name from public.committee x
                     where page.tbl = 'committee' and x.user_id = page.uid) com on true
  left join lateral (select m.full_name || ' · ' || c2.title as subject, cp.expected_amount as amount, cp.exempt_reason as reason
                     from public.campaign_participants cp join public.members m on m.id = cp.member_id
                     join public.campaigns c2 on c2.id = cp.campaign_id
                     where page.tbl = 'campaign_participants' and cp.member_id = page.uid
                     order by cp.created_at desc limit 1) lev on true
  order by page.id desc;
end $$;

-- «المتأخرات»: months and unpaid levy shares (members with only levy debt are listed too).
create or replace view public.arrears with (security_invoker = true) as
  select m.id as member_id, m.number, m.full_name, m.phone, r.group_code, r.member_status,
         coalesce(o.months, '{}') as months, coalesce(o.months_count, 0) as months_count,
         coalesce(o.amount_owed, 0) as amount_owed, coalesce(cr.credit, 0) as credit,
         (select max(rm.sent_at) from public.reminders rm where rm.member_id = m.id) as last_reminded_at,
         m.list_code, m.list_code || '-' || m.number as member_ref,
         coalesce(l.levy_left, 0) as levy_left, coalesce(l.levies, '[]'::jsonb) as levies
  from public.members m
  join app_private.member_rollup() r on r.member_id = m.id
  left join app_private.member_owed_months() o on o.member_id = m.id
  left join app_private.member_credit() cr on cr.member_id = m.id
  left join (
    select s.member_id, sum(s.left_amount)::integer as levy_left,
           jsonb_agg(jsonb_build_object('campaign_id', s.campaign_id, 'title', s.title, 'left', s.left_amount)
                     order by s.created_at) as levies
    from app_private.levy_shares() s where s.left_amount > 0
    group by s.member_id) l on l.member_id = m.id
  where r.member_status = 'active' and (o.member_id is not null or l.member_id is not null);

/* ───────────────────────── wrappers and grants ───────────────────────── */

create function public.create_levy(
  p_id uuid, p_title text, p_amount integer, p_member_ids uuid[], p_purpose text default null,
  p_deadline date default null, p_amount_b integer default null
) returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.create_levy(p_id => p_id, p_title => p_title, p_amount => p_amount, p_member_ids => p_member_ids,
                                 p_purpose => p_purpose, p_deadline => p_deadline, p_amount_b => p_amount_b)
$$;
create function public.add_levy_members(p_id uuid, p_member_ids uuid[], p_amount integer) returns integer
language sql security invoker set search_path = '' as $$
  select app_private.add_levy_members(p_id => p_id, p_member_ids => p_member_ids, p_amount => p_amount)
$$;
create function public.set_levy_share(p_id uuid, p_member_id uuid, p_amount integer) returns void
language sql security invoker set search_path = '' as $$
  select app_private.set_levy_share(p_id => p_id, p_member_id => p_member_id, p_amount => p_amount)
$$;
create function public.exempt_levy_share(p_id uuid, p_member_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$
  select app_private.exempt_levy_share(p_id => p_id, p_member_id => p_member_id, p_reason => p_reason)
$$;
create function public.unexempt_levy_share(p_id uuid, p_member_id uuid) returns void
language sql security invoker set search_path = '' as $$
  select app_private.unexempt_levy_share(p_id => p_id, p_member_id => p_member_id)
$$;

revoke all on function app_private.levy_shares(),
  app_private.create_levy(uuid, text, integer, uuid[], text, date, integer), public.create_levy(uuid, text, integer, uuid[], text, date, integer),
  app_private.add_levy_members(uuid, uuid[], integer), public.add_levy_members(uuid, uuid[], integer),
  app_private.set_levy_share(uuid, uuid, integer), public.set_levy_share(uuid, uuid, integer),
  app_private.exempt_levy_share(uuid, uuid, text), public.exempt_levy_share(uuid, uuid, text),
  app_private.unexempt_levy_share(uuid, uuid), public.unexempt_levy_share(uuid, uuid)
from public, anon, authenticated;
grant execute on function app_private.levy_shares(),
  app_private.create_levy(uuid, text, integer, uuid[], text, date, integer), public.create_levy(uuid, text, integer, uuid[], text, date, integer),
  app_private.add_levy_members(uuid, uuid[], integer), public.add_levy_members(uuid, uuid[], integer),
  app_private.set_levy_share(uuid, uuid, integer), public.set_levy_share(uuid, uuid, integer),
  app_private.exempt_levy_share(uuid, uuid, text), public.exempt_levy_share(uuid, uuid, text),
  app_private.unexempt_levy_share(uuid, uuid), public.unexempt_levy_share(uuid, uuid)
to authenticated, service_role;
