-- Undo m41 (wallets): back to the m40 state (fixed payment methods). Bodies are
-- pg_get_functiondef of the m40 state. Payments, expenses and accounts keep their method. Run as
-- postgres; also run first by m2_down.sql.
set client_min_messages = warning;
drop function if exists
  public.add_wallet_type(text, text), app_private.add_wallet_type(text, text),
  public.update_wallet_type(integer, text, text), app_private.update_wallet_type(integer, text, text),
  public.set_wallet_type_active(integer, boolean), app_private.set_wallet_type_active(integer, boolean),
  public.add_wallet_account(integer, text, text, text, integer), app_private.add_wallet_account(integer, text, text, text, integer),
  public.set_fund_account_opening(uuid, integer, date), app_private.set_fund_account_opening(uuid, integer, date),
  public.report_wallets(date, date), app_private.report_wallets(date, date),
  public.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text, integer, uuid), app_private.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text, integer, uuid),
  public.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean, integer), app_private.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean, integer);
CREATE OR REPLACE FUNCTION app_private.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text DEFAULT NULL::text, p_proof_path text DEFAULT NULL::text, p_proof_hash text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  insert into public.payment_allocations (payment_id, kind, member_id, campaign_id, year, month, amount, donor_name)
  select p_id, a.kind, a.member_id, a.campaign_id, a.year, a.month, a.amount, nullif(btrim(a.donor_name), '')
  from jsonb_to_recordset(p_allocations)
       a(kind public.allocation_kind, member_id uuid, campaign_id uuid, year smallint, month smallint, amount integer,
         donor_name text);

  -- Fail now with a clear code rather than at commit.
  if p_amount <> (select sum(a.amount) from public.payment_allocations a where a.payment_id = p_id) then
    perform app_private.fail('allocations_mismatch');
  end if;

  -- every committee record is confirmed at once (owner 2026-09-30: one committee level)
  return jsonb_build_object('id', p_id, 'replay', false, 'pending_overlap', overlap) || public.confirm_payment(p_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text DEFAULT NULL::text, p_proof_path text DEFAULT NULL::text, p_proof_hash text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select app_private.record_payment(p_id => p_id, p_payer_name => p_payer_name, p_method => p_method, p_amount => p_amount, p_paid_on => p_paid_on, p_allocations => p_allocations, p_txn_ref => p_txn_ref, p_proof_path => p_proof_path, p_proof_hash => p_proof_hash, p_note => p_note) $function$
;
revoke all on function app_private.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text) from public, anon;
grant execute on function app_private.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text) to authenticated, service_role;
revoke all on function public.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text) to authenticated, service_role;
CREATE OR REPLACE FUNCTION app_private.record_expense(p_id uuid, p_spent_on date, p_amount integer, p_activity_id integer DEFAULT NULL::integer, p_category public.expense_category DEFAULT NULL::public.expense_category, p_note text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_receipt_path text DEFAULT NULL::text, p_fund_account_id uuid DEFAULT NULL::uuid, p_paid_in_cash boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.require_committee();
  if exists (select 1 from public.expenses where id = p_id) then return p_id; end if;
  if p_spent_on > current_date + 1 then perform app_private.fail('future_date'); end if;
  if p_activity_id is null and p_category is null then perform app_private.fail('invalid_input'); end if;
  if p_campaign_id is not null
     and exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.status = 'closed' for share) then
    perform app_private.fail('campaign_closed');
  end if;
  if coalesce(p_paid_in_cash, false) and p_fund_account_id is not null then perform app_private.fail('invalid_input'); end if;
  if p_fund_account_id is not null and not exists (select 1 from public.fund_accounts f where f.id = p_fund_account_id) then
    perform app_private.fail('not_found');
  end if;
  perform app_private.set_action('record_expense');
  -- activity_id (or, until the app switches, the old category mapped to its activity): b_activity fills both
  insert into public.expenses (id, spent_on, category, activity_id, campaign_id, amount, note, receipt_path, created_by,
                               fund_account_id, paid_in_cash)
  values (p_id, p_spent_on, p_category, p_activity_id, p_campaign_id, p_amount, p_note, p_receipt_path, auth.uid(),
          p_fund_account_id, coalesce(p_paid_in_cash, false));
  return p_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.record_expense(p_id uuid, p_spent_on date, p_amount integer, p_activity_id integer DEFAULT NULL::integer, p_category public.expense_category DEFAULT NULL::public.expense_category, p_note text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_receipt_path text DEFAULT NULL::text, p_fund_account_id uuid DEFAULT NULL::uuid, p_paid_in_cash boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select app_private.record_expense(p_id => p_id, p_spent_on => p_spent_on, p_amount => p_amount,
                                    p_activity_id => p_activity_id, p_category => p_category, p_note => p_note,
                                    p_campaign_id => p_campaign_id, p_receipt_path => p_receipt_path,
                                    p_fund_account_id => p_fund_account_id, p_paid_in_cash => p_paid_in_cash)
$function$
;
revoke all on function app_private.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean), public.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function app_private.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean), public.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean) to authenticated, service_role;
CREATE OR REPLACE FUNCTION app_private.report_wallets(p_from date, p_to date)
 RETURNS TABLE(method public.payment_method, in_count integer, in_amount bigint, out_count integer, out_amount bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.require_committee();
  if p_from is null or p_to is null or p_to < p_from then perform app_private.fail('invalid_input'); end if;
  return query
  with i as (
    select p.method as m, count(*)::integer as c, sum(p.amount)::bigint as a
    from public.payments p
    where p.status = 'confirmed' and p.method::text <> 'credit' and p.paid_on between p_from and p_to
    group by p.method
  ),
  o as (
    select case when e.paid_in_cash then 'cash'::public.payment_method else fa.method end as m,
           count(*)::integer as c, sum(e.amount)::bigint as a
    from public.expenses e left join public.fund_accounts fa on fa.id = e.fund_account_id
    where e.cancelled_at is null and e.spent_on between p_from and p_to
    group by 1
  )
  select x.m, sum(x.ic)::integer, sum(x.ia)::bigint, sum(x.oc)::integer, sum(x.oa)::bigint
  from (select i.m, i.c as ic, i.a as ia, 0 as oc, 0::bigint as oa from i
        union all
        select o.m, 0, 0::bigint, o.c, o.a from o) x
  group by x.m
  order by x.m nulls last;
end $function$
;
CREATE OR REPLACE FUNCTION public.report_wallets(p_from date, p_to date)
 RETURNS TABLE(method public.payment_method, in_count integer, in_amount bigint, out_count integer, out_amount bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from app_private.report_wallets(p_from => p_from, p_to => p_to)
$function$
;
revoke all on function app_private.report_wallets(date, date), public.report_wallets(date, date) from public, anon, authenticated;
grant execute on function app_private.report_wallets(date, date), public.report_wallets(date, date) to authenticated, service_role;
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
      or exists (select 1 from public.expense_activities where p_user in (created_by, updated_by))
      or exists (select 1 from public.settings where updated_by = p_user)
      or exists (select 1 from public.terms where created_by = p_user)
      or exists (select 1 from public.handovers where p_user in (started_by, submitted_by, accepted_by, cancelled_by))
      or exists (select 1 from public.balance_adjustments where created_by = p_user)
      or exists (select 1 from public.member_links where p_user in (created_by, revoked_by))
      or exists (select 1 from public.campaign_participants where exempted_by = p_user)
      or exists (select 1 from public.audit_log where actor = p_user);
$function$
;
drop index if exists public.payments_txn_ref_uniq;
create unique index payments_txn_ref_uniq on public.payments (method, app_private.norm_txn(txn_ref))
  where txn_ref is not null and status in ('pending', 'confirmed');
drop trigger if exists b_wallet on public.payments;
drop trigger if exists b_wallet on public.expenses;
drop trigger if exists b_wallet on public.fund_accounts;
drop function if exists app_private.tg_payment_wallet(), app_private.tg_expense_wallet(), app_private.tg_account_wallet(),
  app_private.resolve_wallet(public.payment_method, smallint, uuid);
alter table public.payments drop column if exists wallet_type_id, drop column if exists fund_account_id;
alter table public.expenses drop column if exists wallet_type_id;
drop index if exists public.fund_accounts_active_uniq;
create unique index fund_accounts_active_uniq on public.fund_accounts (method, account_number) where active;
drop trigger if exists a_guard on public.fund_accounts;
create trigger a_guard before update or delete on public.fund_accounts for each row execute function
  app_private.tg_append_only('', 'holder_name,note,sort_order,active,updated_at,updated_by');
alter table public.fund_accounts drop constraint if exists fund_accounts_opening_both,
  drop column if exists opening_balance, drop column if exists opening_on, drop column if exists wallet_type_id;
alter table public.fund_accounts drop constraint if exists fund_accounts_method_check;
alter table public.fund_accounts add constraint fund_accounts_method_check
  check (method::text not in ('cash', 'paper', 'other'));
drop table if exists public.wallet_types;
