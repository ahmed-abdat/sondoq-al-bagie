-- Undo m29 (committee_tools): back to the m28 state. The function bodies below are
-- pg_get_functiondef of the m28 state (exact). Run as postgres; also run first by m2_down.sql.
set client_min_messages = warning;

drop function if exists public.activity_log(bigint, integer), app_private.activity_log(bigint, integer),
  public.member_statement(uuid, smallint), app_private.member_statement(uuid, smallint),
  public.set_push_kinds(text, text[]), app_private.set_push_kinds(text, text[]),
  public.co_paid_members(uuid, integer), app_private.co_paid_members(uuid, integer);
alter table public.push_subscriptions drop column if exists kinds;

CREATE OR REPLACE FUNCTION app_private.can_confirm()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(app_private.my_role() in ('admin', 'treasurer', 'deputy'), false) or app_private.is_server();
$function$
;

CREATE OR REPLACE FUNCTION app_private.confirm_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public.payments;
  mine uuid := app_private.my_member_id();
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
  if mine is not null and exists (select 1 from public.payment_allocations a where a.payment_id = p.id and a.member_id = mine) then
    perform app_private.fail('own_membership', 'a payment covering your own membership must be confirmed by someone else');
  end if;
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

CREATE OR REPLACE FUNCTION app_private.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text DEFAULT NULL::text, p_proof_path text DEFAULT NULL::text, p_proof_hash text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing public.payments;
  mine uuid := app_private.my_member_id();
  paid record;
  overlap boolean;
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

  if app_private.can_confirm() and not (mine is not null and exists (
       select 1 from public.payment_allocations a where a.payment_id = p_id and a.member_id = mine)) then
    return jsonb_build_object('id', p_id, 'replay', false, 'pending_overlap', overlap) || public.confirm_payment(p_id);
  end if;
  return jsonb_build_object('id', p_id, 'status', 'pending', 'replay', false, 'pending_overlap', overlap);
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
  perform app_private.require_admin();
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
  perform app_private.require_admin();
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
  perform app_private.require_admin();
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
  perform app_private.require_admin();
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

CREATE OR REPLACE FUNCTION app_private.require_money_keeper()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not (app_private.is_admin() or app_private.can_confirm()) then perform app_private.fail('not_allowed'); end if;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.require_campaign_manager()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not (app_private.is_admin() or app_private.can_confirm()) then perform app_private.fail('not_allowed'); end if;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.cancel_expense(p_expense_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION app_private.cancel_payment(p_payment_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if p.status = 'confirmed' and exists (
       select 1 from public.payment_allocations a join public.campaigns c on c.id = a.campaign_id
       where a.payment_id = p.id and a.kind = 'campaign' and c.status = 'closed') then
    perform app_private.fail('campaign_closed');
  end if;
  perform app_private.set_action('cancel_payment');
  update public.payments set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where id = p.id;
  update public.payment_months set released_at = now() where payment_id = p.id and released_at is null;
end $function$
;

CREATE OR REPLACE FUNCTION app_private.accept_handover(p_id uuid, p_new_term_title text DEFAULT NULL::text)
 RETURNS smallint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  h public.handovers;
  cur public.terms;
  me uuid := auth.uid();
  diff integer;
  next_no smallint;
begin
  perform app_private.require_admin();
  select * into h from public.handovers where id = p_id for update;
  if h.id is null then perform app_private.fail('not_found'); end if;
  if h.status = 'confirmed' then return h.to_term; end if;
  if h.status <> 'submitted' then perform app_private.fail('handover_not_submitted'); end if;
  if not app_private.is_server() and me in (h.started_by, h.submitted_by) then
    perform app_private.fail('same_person', 'the handover must be accepted by another admin (the incoming one)');
  end if;
  select * into cur from public.terms where number = h.from_term for update;
  if cur.ended_on is not null then perform app_private.fail('no_open_term'); end if;

  perform app_private.set_action('accept_handover');
  -- computed_balance was stored by submit_handover; recompute only for a row submitted without it
  diff := h.counted_balance - coalesce(h.computed_balance, app_private.current_balance());
  if diff <> 0 then
    insert into public.balance_adjustments (term, handover_id, amount, reason, created_by)
    values (cur.number, h.id, diff, 'فرق عند التسليم', me);
  end if;
  next_no := cur.number + 1;
  update public.terms set ended_on = current_date where number = cur.number;
  insert into public.terms (number, title, started_on, opening_balance, created_by)
  values (next_no, coalesce(nullif(btrim(p_new_term_title), ''), 'الدورة ' || next_no), current_date,
          app_private.current_balance(), me);
  update public.handovers
  set status = 'confirmed', accepted_at = now(), accepted_by = me, to_term = next_no,
      computed_balance = coalesce(h.computed_balance, h.counted_balance - diff), difference = diff
  where id = p_id;
  update public.committee set active = false
  where active and not (user_id = any (array_remove(h.carry_over || me, null)));
  return next_no;
end $function$
;
