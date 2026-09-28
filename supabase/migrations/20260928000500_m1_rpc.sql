-- ════════════════════════════════════════════════════════════════════════════════════════
-- Sondoq al-Baqie M1 · 5/5 · RPCs (the only write paths)
--
-- SECURITY DEFINER, search_path = '', every name schema-qualified, caller's role re-checked.
-- Errors: P0001 + stable HINT (not_committee, not_pending, month_already_paid, own_membership…).
-- ════════════════════════════════════════════════════════════════════════════════════════

create function app_private.require_committee() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not (app_private.is_committee() or app_private.is_server()) then perform app_private.fail('not_committee'); end if;
end $$;

create function app_private.require_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not app_private.is_admin() then perform app_private.fail('not_admin'); end if;
end $$;

-- Labels the audit rows written by the current statement with the business action.
create function app_private.set_action(p_action text) returns void
language sql set search_path = '' as $$ select set_config('sondoq.action', p_action, true) $$;

/* ───────────────────────── payments ───────────────────────── */

-- Confirm atomically. First confirmation wins; a repeat is a no-op that reports who confirmed.
-- Returns {status, decided_by, decided_by_name, decided_at, already}.
create function public.confirm_payment(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  mine uuid := app_private.my_member_id();
begin
  if not app_private.can_confirm() then perform app_private.fail('not_confirmer'); end if;
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null then perform app_private.fail('not_found'); end if;
  if p.status = 'confirmed' then
    return jsonb_build_object('status', p.status, 'already', true, 'decided_by', p.decided_by, 'decided_at', p.decided_at,
      'decided_by_name', (select c.display_name from public.committee c where c.user_id = p.decided_by));
  end if;
  if p.status <> 'pending' then perform app_private.fail('not_pending'); end if;
  if mine is not null and exists (select 1 from public.payment_allocations a where a.payment_id = p.id and a.member_id = mine) then
    perform app_private.fail('own_membership', 'a payment covering your own membership must be confirmed by someone else');
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
    perform app_private.fail('month_already_paid');
  end;
  perform set_config('sondoq.confirming', '', true);

  return jsonb_build_object('status', 'confirmed', 'already', false, 'decided_by', auth.uid(), 'decided_at', now(),
    'decided_by_name', (select c.display_name from public.committee c where c.user_id = auth.uid()));
end $$;

-- Record a payment. Idempotent on p_id (a retried request returns the same id).
-- p_allocations: [{"kind":"months","member_id":…,"year":2026,"month":3,"amount":1000},
--                 {"kind":"campaign","campaign_id":…,"member_id":null,"amount":2000},
--                 {"kind":"credit","member_id":…,"amount":500}]
-- Recorded by the treasurer/deputy → confirmed at once (unless it covers their own membership).
create function public.record_payment(
  p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date,
  p_allocations jsonb, p_txn_ref text default null, p_proof_path text default null, p_proof_hash text default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing public.payments;
  mine uuid := app_private.my_member_id();
begin
  perform app_private.require_committee();
  select * into existing from public.payments where id = p_id;
  if existing.id is not null then
    if existing.created_by is distinct from auth.uid() then perform app_private.fail('id_taken'); end if;
    return jsonb_build_object('id', existing.id, 'status', existing.status, 'replay', true);
  end if;
  if p_method = 'paper' and not app_private.is_admin() then perform app_private.fail('paper_admin_only'); end if;
  if p_paid_on > current_date + 1 then perform app_private.fail('future_date'); end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) = 0 then
    perform app_private.fail('allocations_required');
  end if;
  if p_txn_ref is not null and exists (
    select 1 from public.payments x where x.method = p_method and x.txn_ref = btrim(p_txn_ref) and x.status in ('pending', 'confirmed')) then
    perform app_private.fail('duplicate_txn_ref');
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_allocations) a(kind public.allocation_kind, member_id uuid, year smallint, month smallint)
    join public.payment_months pm on pm.member_id = a.member_id and pm.year = a.year and pm.month = a.month and pm.released_at is null
    where a.kind = 'months') then
    perform app_private.fail('month_already_paid');
  end if;

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

  if app_private.can_confirm() and not (mine is not null and exists (
       select 1 from public.payment_allocations a where a.payment_id = p_id and a.member_id = mine)) then
    return jsonb_build_object('id', p_id, 'replay', false) || public.confirm_payment(p_id);
  end if;
  return jsonb_build_object('id', p_id, 'status', 'pending', 'replay', false);
end $$;

create function public.reject_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  if not app_private.can_confirm() then perform app_private.fail('not_confirmer'); end if;
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null then perform app_private.fail('not_found'); end if;
  if p.status = 'rejected' then return; end if;
  if p.status <> 'pending' then perform app_private.fail('not_pending'); end if;
  perform app_private.set_action('reject_payment');
  update public.payments set status = 'rejected', decided_at = now(), decided_by = auth.uid(), reject_reason = btrim(p_reason)
  where id = p.id;
end $$;

-- Cancel with a reason. A confirmed payment releases its months (they become unpaid again).
-- Pending: its recorder or a confirmer. Confirmed: treasurer/deputy/admin.
create function public.cancel_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  perform app_private.require_committee();
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null then perform app_private.fail('not_found'); end if;
  if p.status = 'cancelled' then return; end if;
  if p.status = 'rejected' then perform app_private.fail('not_pending'); end if;
  if not (app_private.can_confirm() or app_private.is_admin()
          or (p.status = 'pending' and p.created_by = auth.uid())) then
    perform app_private.fail('not_allowed');
  end if;
  perform app_private.set_action('cancel_payment');
  update public.payments set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where id = p.id;
  update public.payment_months set released_at = now() where payment_id = p.id and released_at is null;
end $$;

/* ───────────────────────── expenses ───────────────────────── */

create function public.record_expense(
  p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer,
  p_note text default null, p_campaign_id uuid default null, p_receipt_path text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_committee();
  if exists (select 1 from public.expenses where id = p_id) then return p_id; end if;
  if p_spent_on > current_date + 1 then perform app_private.fail('future_date'); end if;
  perform app_private.set_action('record_expense');
  insert into public.expenses (id, spent_on, category, campaign_id, amount, note, receipt_path, created_by)
  values (p_id, p_spent_on, p_category, p_campaign_id, p_amount, p_note, p_receipt_path, auth.uid());
  return p_id;
end $$;

create function public.cancel_expense(p_expense_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e public.expenses;
begin
  if not (app_private.can_confirm() or app_private.is_admin()) then perform app_private.fail('not_allowed'); end if;
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  select * into e from public.expenses where id = p_expense_id for update;
  if e.id is null then perform app_private.fail('not_found'); end if;
  if e.cancelled_at is not null then return; end if;
  perform app_private.set_action('cancel_expense');
  update public.expenses set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason) where id = e.id;
end $$;

/* ───────────────────────── reminders ───────────────────────── */

-- Logged when a committee member taps a WhatsApp button (the message itself is a wa.me link).
create function public.log_reminder(
  p_kind public.reminder_kind, p_member_id uuid default null, p_campaign_id uuid default null, p_payment_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  rid uuid;
begin
  perform app_private.require_committee();
  if p_kind in ('individual', 'receipt') and p_member_id is null and p_payment_id is null then
    perform app_private.fail('member_required');
  end if;
  insert into public.reminders (kind, member_id, campaign_id, payment_id, sent_by)
  values (p_kind, p_member_id, p_campaign_id, p_payment_id, auth.uid())
  returning id into rid;
  return rid;
end $$;

/* ───────────────────────── admin: members, periods, committee, settings ───────────────────────── */

-- New member with a first period (active from p_from_month, usually the join month).
create function public.add_member(
  p_number integer, p_full_name text, p_group_code text, p_from_month date,
  p_phone text default null, p_note text default null, p_status public.membership_status default 'active'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  mid uuid;
  gid smallint;
begin
  perform app_private.require_admin();
  select id into gid from public.groups where code = p_group_code;
  if gid is null then perform app_private.fail('unknown_group'); end if;
  perform app_private.set_action('add_member');
  insert into public.members (number, full_name, phone, note, created_by)
  values (p_number, btrim(p_full_name), nullif(btrim(p_phone), ''), p_note, auth.uid())
  returning id into mid;
  insert into public.membership_periods (member_id, group_id, status, from_month, reason, created_by)
  values (mid, gid, p_status, date_trunc('month', p_from_month)::date, 'join', auth.uid());
  return mid;
end $$;

create function public.update_member(p_member_id uuid, p_full_name text, p_phone text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  perform app_private.set_action('update_member');
  update public.members set full_name = btrim(p_full_name), phone = nullif(btrim(p_phone), ''), note = p_note
  where id = p_member_id;
  if not found then perform app_private.fail('not_found'); end if;
end $$;

-- Change status and/or group from a month on: closes the open period the month before and
-- opens a new one. E.g. exempt from 2026-05, away from 2026-07, deceased from 2026-09.
create function public.change_member_status(
  p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
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
  perform app_private.set_action('change_member_status');
  update public.membership_periods set to_month = (m - interval '1 month')::date where id = cur.id;
  insert into public.membership_periods (member_id, group_id, status, from_month, reason, created_by)
  values (p_member_id, gid, p_status, m, btrim(p_reason), auth.uid())
  returning id into pid;
  return pid;
end $$;

create function public.set_group_price(p_group_code text, p_year integer, p_monthly_amount integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  gid smallint;
begin
  perform app_private.require_admin();
  select id into gid from public.groups where code = p_group_code;
  if gid is null then perform app_private.fail('unknown_group'); end if;
  perform app_private.set_action('set_group_price');
  insert into public.group_prices (group_id, year, monthly_amount) values (gid, p_year, p_monthly_amount)
  on conflict (group_id, year) do update set monthly_amount = excluded.monthly_amount;
end $$;

-- The auth account is created by the admin in Supabase Auth first; this sets its role.
create function public.set_committee_member(
  p_user_id uuid, p_display_name text, p_role public.committee_role, p_member_id uuid default null, p_active boolean default true
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if p_user_id = auth.uid() and (p_role <> 'admin' or not p_active) then
    perform app_private.fail('cannot_demote_self');
  end if;
  perform app_private.set_action('set_committee_member');
  insert into public.committee (user_id, display_name, role, member_id, active)
  values (p_user_id, btrim(p_display_name), p_role, p_member_id, p_active)
  on conflict (user_id) do update
    set display_name = excluded.display_name, role = excluded.role, member_id = excluded.member_id, active = excluded.active;
end $$;

create function public.update_settings(
  p_opening_balance integer default null, p_opening_balance_on date default null,
  p_grace_days integer default null, p_show_amount_owed boolean default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  perform app_private.set_action('update_settings');
  update public.settings set
    opening_balance    = coalesce(p_opening_balance, opening_balance),
    opening_balance_on = coalesce(p_opening_balance_on, opening_balance_on),
    grace_days         = coalesce(p_grace_days, grace_days),
    show_amount_owed   = coalesce(p_show_amount_owed, show_amount_owed),
    updated_at = now(), updated_by = auth.uid();
end $$;

/* ───────────────────────── privileges for the RPCs ───────────────────────── */

revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;

grant execute on function
  public.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text),
  public.confirm_payment(uuid), public.reject_payment(uuid, text), public.cancel_payment(uuid, text),
  public.record_expense(uuid, date, public.expense_category, integer, text, uuid, text),
  public.cancel_expense(uuid, text),
  public.log_reminder(public.reminder_kind, uuid, uuid, uuid),
  public.add_member(integer, text, text, date, text, text, public.membership_status),
  public.update_member(uuid, text, text, text),
  public.change_member_status(uuid, date, public.membership_status, text, text),
  public.set_group_price(text, integer, integer),
  public.set_committee_member(uuid, text, public.committee_role, uuid, boolean),
  public.update_settings(integer, date, integer, boolean)
to authenticated;

-- re-grant what 4/5 granted (the blanket revoke above covers app_private too)
grant execute on function
  app_private.public_member_status(), app_private.public_member_months(), app_private.public_fund_summary(),
  app_private.public_monthly_collection(), app_private.public_expense_totals(), app_private.public_recent_expenses(),
  app_private.public_campaign_progress(), app_private.public_activity_feed()
to anon, authenticated;
grant execute on function
  app_private.my_role(), app_private.is_committee(), app_private.is_admin(), app_private.can_confirm(),
  app_private.my_member_id(), app_private.member_owed_months(), app_private.member_rollup(), app_private.member_credit()
to authenticated;

grant execute on all functions in schema public to service_role;
grant execute on all functions in schema app_private to service_role;
