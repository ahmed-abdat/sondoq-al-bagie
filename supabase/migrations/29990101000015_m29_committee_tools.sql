-- ════════════════════════════════════════════════════════════════════════════════════════
-- M29 · committee tools (owner decisions 2026-09-30, docs/COMMITTEE-ONLY-PLAN.md §7, §8;
-- supabase/drafts/M29-DESIGN.md).
--
-- One committee level: every active committee member records, confirms and cancels; a recorded
-- payment is confirmed at once (receipt issued), the own-membership rule is gone, paper records
-- are no longer admin-only, and member, price, settings and fund-account changes need any committee
-- member. «مسؤول» (role admin) keeps only account management and accepting the handover. Roles and
-- data are unchanged.
-- New reads for the committee: activity_log («سجل العمليات») and member_statement («كشف حساب»).
-- Push: each subscription chooses the kinds of events it receives.
-- Undo: supabase/rollback/m29_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

/* ───────────────────────── one committee level ───────────────────────── */

-- used by confirm/cancel/apply_credit and the campaign and money checks
create or replace function app_private.can_confirm() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.is_committee() or app_private.is_server();
$$;

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
end $$;

create or replace function app_private.record_payment(
  p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date,
  p_allocations jsonb, p_txn_ref text default null, p_proof_path text default null, p_proof_hash text default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing public.payments;
  paid record;
  overlap boolean;
begin
  perform app_private.require_committee();
  select * into existing from public.payments where id = p_id;
  if existing.id is not null then
    if existing.created_by is distinct from auth.uid() then perform app_private.fail('id_taken'); end if;
    return jsonb_build_object('id', existing.id, 'status', existing.status, 'replay', true);
  end if;
  if p_paid_on > current_date + 1 then perform app_private.fail('future_date'); end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) = 0 then
    perform app_private.fail('allocations_required');
  end if;
  if app_private.norm_txn(p_txn_ref) is not null and exists (
    select 1 from public.payments x
    where x.method = p_method and app_private.norm_txn(x.txn_ref) = app_private.norm_txn(p_txn_ref)
      and x.status in ('pending', 'confirmed')) then
    perform app_private.fail('duplicate_txn_ref');
  end if;
  select a.member_id, a.year, a.month into paid
  from jsonb_to_recordset(p_allocations) a(kind public.allocation_kind, member_id uuid, year smallint, month smallint)
  join public.payment_months pm on pm.member_id = a.member_id and pm.year = a.year and pm.month = a.month and pm.released_at is null
  where a.kind = 'months'
  order by a.year, a.month
  limit 1;
  if paid.member_id is not null then
    perform app_private.month_error('month_already_paid', paid.member_id, paid.year, paid.month);
  end if;
  overlap := exists (
    select 1 from jsonb_to_recordset(p_allocations) a(kind public.allocation_kind, member_id uuid, year smallint, month smallint)
    join public.payment_allocations o on o.kind = 'months' and o.member_id = a.member_id and o.year = a.year and o.month = a.month
    join public.payments op on op.id = o.payment_id and op.status = 'pending'
    where a.kind = 'months');

  perform app_private.set_action('record_payment');
  insert into public.payments (id, payer_name, method, amount, paid_on, txn_ref, proof_path, proof_hash, note, created_by)
  values (p_id, btrim(p_payer_name), p_method, p_amount, p_paid_on, nullif(btrim(p_txn_ref), ''), p_proof_path,
          lower(p_proof_hash), p_note, auth.uid());
  insert into public.payment_allocations (payment_id, kind, member_id, campaign_id, year, month, amount)
  select p_id, a.kind, a.member_id, a.campaign_id, a.year, a.month, a.amount
  from jsonb_to_recordset(p_allocations)
       a(kind public.allocation_kind, member_id uuid, campaign_id uuid, year smallint, month smallint, amount integer);

  -- Fail now with a clear code rather than at commit.
  if p_amount <> (select sum(a.amount) from public.payment_allocations a where a.payment_id = p_id) then
    perform app_private.fail('allocations_mismatch');
  end if;

  -- every committee record is confirmed at once (owner 2026-09-30: one committee level)
  return jsonb_build_object('id', p_id, 'replay', false, 'pending_overlap', overlap) || public.confirm_payment(p_id);
end $$;

create or replace function app_private.change_member_status(
  p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cur public.membership_periods;
  m date := date_trunc('month', p_from_month)::date;
  gid smallint;
  pid uuid;
begin
  perform app_private.require_committee();
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
end $$;

-- Day-to-day member, price, settings and fund-account work: any committee member (was «مسؤول»).
-- The current bodies (pg_get_functiondef at m28) with only require_admin → require_committee.
-- «مسؤول» keeps: set_committee_member / set_committee_active / set_committee_not_member /
-- delete_committee_member, committee_accounts, accept_handover.
CREATE OR REPLACE FUNCTION app_private.add_member(p_number integer, p_full_name text, p_group_code text, p_from_month date, p_phone text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_status public.membership_status DEFAULT 'active'::public.membership_status, p_list_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  mid uuid;
  gid smallint;
  lst text := upper(coalesce(nullif(btrim(p_list_code), ''), p_group_code));
begin
  perform app_private.require_committee();
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
end $function$
;

CREATE OR REPLACE FUNCTION app_private.update_member(p_member_id uuid, p_full_name text, p_phone text, p_note text, p_number integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m public.members;
begin
  perform app_private.require_committee();
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
end $function$
;

CREATE OR REPLACE FUNCTION app_private.change_member_group(p_member_id uuid, p_from_month date, p_group_code text, p_reason text DEFAULT 'تغيير المجموعة'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cur public.membership_periods;
begin
  perform app_private.require_committee();
  select * into cur from public.membership_periods
  where member_id = p_member_id and cancelled_at is null and to_month is null;
  if cur.id is null then perform app_private.fail('no_open_period'); end if;
  return public.change_member_status(p_member_id, p_from_month, cur.status, p_reason, p_group_code);
end $function$
;

CREATE OR REPLACE FUNCTION app_private.set_join_month(p_member_id uuid, p_from_month date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  first public.membership_periods;
  m date := date_trunc('month', p_from_month)::date;
  pid uuid;
begin
  perform app_private.require_committee();
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  if m is null then perform app_private.fail('invalid_input'); end if;
  select * into first from public.membership_periods
  where member_id = p_member_id and cancelled_at is null
  order by from_month limit 1 for update;
  if first.id is null then perform app_private.fail('no_open_period'); end if;
  if m = first.from_month then return first.id; end if;
  if first.to_month is not null and m > first.to_month then perform app_private.fail('join_month_invalid'); end if;
  if m > first.from_month and app_private.member_has_months(p_member_id, first.from_month, (m - interval '1 month')::date) then
    perform app_private.fail('period_has_payments');
  end if;

  perform app_private.set_action('set_join_month');
  update public.membership_periods
  set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where id = first.id;
  insert into public.membership_periods (member_id, group_id, status, from_month, to_month, reason, created_by)
  values (p_member_id, first.group_id, first.status, m, first.to_month, first.reason, auth.uid())
  returning id into pid;
  return pid;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.cancel_last_period(p_member_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cur public.membership_periods;
  prev public.membership_periods;
  pid uuid;
begin
  perform app_private.require_committee();
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  select * into cur from public.membership_periods
  where member_id = p_member_id and cancelled_at is null and to_month is null for update;
  if cur.id is null then perform app_private.fail('no_open_period'); end if;
  select * into prev from public.membership_periods
  where member_id = p_member_id and cancelled_at is null and to_month = (cur.from_month - interval '1 month')::date
  for update;
  if prev.id is null then perform app_private.fail('no_previous_period'); end if;
  if app_private.member_has_months(p_member_id, cur.from_month, null) then
    perform app_private.fail('period_has_payments');
  end if;

  perform app_private.set_action('cancel_last_period');
  update public.membership_periods
  set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where id in (cur.id, prev.id);
  insert into public.membership_periods (member_id, group_id, status, from_month, reason, created_by)
  values (p_member_id, prev.group_id, prev.status, prev.from_month, prev.reason, auth.uid())
  returning id into pid;
  return pid;
end $function$
;

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

CREATE OR REPLACE FUNCTION app_private.update_settings(p_opening_balance integer DEFAULT NULL::integer, p_opening_balance_on date DEFAULT NULL::date, p_grace_days integer DEFAULT NULL::integer, p_show_amount_owed boolean DEFAULT NULL::boolean, p_whatsapp_contact text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.require_committee();
  perform app_private.set_action('update_settings');
  update public.settings set
    opening_balance    = coalesce(p_opening_balance, opening_balance),
    opening_balance_on = coalesce(p_opening_balance_on, opening_balance_on),
    grace_days         = coalesce(p_grace_days, grace_days),
    show_amount_owed   = coalesce(p_show_amount_owed, show_amount_owed),
    whatsapp_contact   = case when p_whatsapp_contact is null then whatsapp_contact
                              else nullif(regexp_replace(p_whatsapp_contact, '[\s-]', '', 'g'), '') end,
    updated_at = now(), updated_by = auth.uid()
  where id;   -- the singleton row (PostgREST sessions load pg_safeupdate: no UPDATE without WHERE)
  if p_opening_balance is not null or p_opening_balance_on is not null then
    update public.terms t
    set opening_balance = s.opening_balance, started_on = s.opening_balance_on
    from public.settings s
    where t.number = 1 and s.id;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.add_fund_account(p_method public.payment_method, p_account_number text, p_holder_name text, p_note text DEFAULT NULL::text, p_sort_order integer DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  aid uuid;
  num text := regexp_replace(coalesce(p_account_number, ''), '[\s-]', '', 'g');
begin
  perform app_private.require_committee();
  if p_method::text in ('cash', 'paper', 'other') then perform app_private.fail('not_a_wallet'); end if;
  if exists (select 1 from public.fund_accounts a where a.method = p_method and a.account_number = num and a.active) then
    perform app_private.fail('account_exists');
  end if;
  perform app_private.set_action('add_fund_account');
  insert into public.fund_accounts (method, account_number, holder_name, note, sort_order, created_by)
  values (p_method, num, btrim(p_holder_name), nullif(btrim(p_note), ''), p_sort_order, auth.uid())
  returning id into aid;
  return aid;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.update_fund_account(p_id uuid, p_holder_name text, p_note text, p_sort_order integer, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.fund_accounts;
begin
  perform app_private.require_committee();
  select * into a from public.fund_accounts where id = p_id for update;
  if a.id is null then perform app_private.fail('not_found'); end if;
  if p_active and not a.active and exists (
    select 1 from public.fund_accounts x where x.method = a.method and x.account_number = a.account_number and x.active) then
    perform app_private.fail('account_exists');
  end if;
  perform app_private.set_action(case when a.active and not p_active then 'deactivate_fund_account' else 'update_fund_account' end);
  update public.fund_accounts
  set holder_name = btrim(p_holder_name), note = nullif(btrim(p_note), ''), sort_order = p_sort_order, active = p_active,
      updated_at = now(), updated_by = auth.uid()
  where id = p_id;
end $function$
;

/* ───────────────────────── «سجل العمليات» ───────────────────────── */

-- One entry per business action (the audit rows of one transaction by one person for one action),
-- newest first; p_before = the id of the last entry already shown. Names resolved, with the main
-- row's subject, amount and reason.
create function app_private.activity_log(p_before bigint default null, p_limit integer default 50)
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
end $$;

create function public.activity_log(p_before bigint default null, p_limit integer default 50)
returns table (id bigint, at timestamptz, actor uuid, actor_name text, action text, table_name text, row_id text,
               subject text, amount integer, reason text)
language sql stable security invoker set search_path = '' as $$
  select * from app_private.activity_log(p_before => p_before, p_limit => p_limit)
$$;

/* ───────────────────────── «كشف حساب» ───────────────────────── */

-- One member's year: the month grid, every payment that touches him (any status, with who
-- recorded / confirmed / cancelled it and why), what he owes and his credit. Levies come in m30.
create function app_private.member_statement(p_member_id uuid, p_year smallint default null) returns jsonb
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
      'credit', coalesce((select c.credit from app_private.member_credit() c where c.member_id = p_member_id), 0)),
    'levies', '[]'::jsonb);
end $$;

create function public.member_statement(p_member_id uuid, p_year smallint default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select app_private.member_statement(p_member_id => p_member_id, p_year => p_year)
$$;

/* ───────────────────────── push: kinds per device ───────────────────────── */

alter table public.push_subscriptions
  add column kinds text[] not null default array['payment', 'expense', 'contribution', 'levy', 'cancel', 'member']
    check (kinds <@ array['payment', 'expense', 'contribution', 'levy', 'cancel', 'member']);

-- The caller's own device only; an unknown kind or device fails.
create function app_private.set_push_kinds(p_endpoint text, p_kinds text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_committee();
  if p_kinds is null or not (p_kinds <@ array['payment', 'expense', 'contribution', 'levy', 'cancel', 'member']) then
    perform app_private.fail('invalid_input');
  end if;
  update public.push_subscriptions set kinds = (select coalesce(array_agg(distinct k order by k), '{}') from unnest(p_kinds) k)
  where endpoint = btrim(p_endpoint) and user_id = auth.uid();
  if not found then perform app_private.fail('not_found'); end if;
end $$;

create function public.set_push_kinds(p_endpoint text, p_kinds text[]) returns void
language sql security invoker set search_path = '' as $$
  select app_private.set_push_kinds(p_endpoint => p_endpoint, p_kinds => p_kinds)
$$;

revoke all on function app_private.activity_log(bigint, integer), public.activity_log(bigint, integer),
  app_private.member_statement(uuid, smallint), public.member_statement(uuid, smallint),
  app_private.set_push_kinds(text, text[]), public.set_push_kinds(text, text[])
from public, anon, authenticated;
grant execute on function app_private.activity_log(bigint, integer), public.activity_log(bigint, integer),
  app_private.member_statement(uuid, smallint), public.member_statement(uuid, smallint),
  app_private.set_push_kinds(text, text[]), public.set_push_kinds(text, text[])
to authenticated, service_role;
