-- Undo m30 (levies): back to the m29 state. Bodies and the arrears view are pg_get_functiondef /
-- pg_get_viewdef of the m29 state (exact). Levy rows stay as plain campaigns (kind dropped). Run as
-- postgres; also run first by m2_down.sql.
set client_min_messages = warning;

drop view if exists public.arrears;
drop view if exists public.levy_shares;
drop trigger if exists b_levy on public.payment_allocations;
drop function if exists public.create_levy(uuid, text, integer, uuid[], text, date, integer),
  app_private.create_levy(uuid, text, integer, uuid[], text, date, integer),
  public.add_levy_members(uuid, uuid[], integer), app_private.add_levy_members(uuid, uuid[], integer),
  public.set_levy_share(uuid, uuid, integer), app_private.set_levy_share(uuid, uuid, integer),
  public.exempt_levy_share(uuid, uuid, text), app_private.exempt_levy_share(uuid, uuid, text),
  public.unexempt_levy_share(uuid, uuid), app_private.unexempt_levy_share(uuid, uuid),
  app_private.levy_for_change(uuid), app_private.levy_share_unpaid(uuid, uuid),
  app_private.tg_levy_allocation();

CREATE OR REPLACE FUNCTION app_private.confirm_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
               and c.status = 'closed'
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

  return jsonb_build_object('status', 'confirmed', 'already', false, 'decided_by', auth.uid(), 'decided_at', now(),
    'decided_by_name', (select c.display_name from public.committee c where c.user_id = auth.uid()),
    'receipt_code', (select x.receipt_code from public.payments x where x.id = p.id));
end $function$
;

CREATE OR REPLACE FUNCTION app_private.member_statement(p_member_id uuid, p_year smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'credit', coalesce((select c.credit from app_private.member_credit() c where c.member_id = p_member_id), 0)),
    'levies', '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION app_private.activity_log(p_before bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint, at timestamp with time zone, actor uuid, actor_name text, action text, table_name text, row_id text, subject text, amount integer, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         coalesce(pay.payer_name, ex.subject, mem.full_name, per.full_name, cam.title, com.display_name),
         coalesce(pay.amount, ex.amount),
         coalesce(pay.reason, ex.reason, per.reason)
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
  order by page.id desc;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.account_has_history(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      or exists (select 1 from public.audit_log where actor = p_user);
$function$
;

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
    if not exists (select 1 from public.campaigns c where c.id = new.campaign_id and c.status = 'open') then
      raise exception 'sondoq: campaign is not open' using errcode = 'P0001', hint = 'campaign_closed';
    end if;
  end if;
  return new;
end $function$
;

drop function if exists app_private.levy_shares();
drop trigger if exists a_guard on public.campaign_participants;
create trigger a_guard before update or delete on public.campaign_participants for each row execute function
  app_private.tg_append_only('', 'expected_amount');
drop index if exists public.campaign_participants_exempted_by_idx;
alter table public.campaign_participants drop column if exists exempted_at, drop column if exists exempted_by,
  drop column if exists exempt_reason;
alter table public.campaigns drop column if exists kind;
drop type if exists public.campaign_kind;

create view public.arrears with (security_invoker = true) as
 SELECT m.id AS member_id,
    m.number,
    m.full_name,
    m.phone,
    r.group_code,
    r.member_status,
    o.months,
    o.months_count,
    o.amount_owed,
    COALESCE(cr.credit, 0::bigint) AS credit,
    ( SELECT max(rm.sent_at) AS max
           FROM public.reminders rm
          WHERE rm.member_id = m.id) AS last_reminded_at,
    m.list_code,
    (m.list_code || '-'::text) || m.number AS member_ref
   FROM public.members m
     JOIN app_private.member_owed_months() o(member_id, months, months_count, amount_owed) ON o.member_id = m.id
     JOIN app_private.member_rollup() r(member_id, list_code, number, full_name, group_code, member_status, months_paid_this_year, months_behind, amount_owed) ON r.member_id = m.id
     LEFT JOIN app_private.member_credit() cr(member_id, credit) ON cr.member_id = m.id
  WHERE r.member_status = 'active'::public.membership_status;
revoke all on public.arrears from public, anon, authenticated, service_role;
grant SELECT on public.arrears to authenticated;
grant SELECT on public.arrears to service_role;
