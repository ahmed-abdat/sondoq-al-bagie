-- Undo m31 (reports): back to the m30 state. Bodies are pg_get_functiondef of the m30 state; the
-- record_expense wrapper and grants are the m13 text. Run as postgres; also run first by m2_down.sql.
set client_min_messages = warning;
drop function if exists public.report_period(date, date), app_private.report_period(date, date),
  public.report_wallets(date, date), app_private.report_wallets(date, date),
  public.report_committee_work(date, date), app_private.report_committee_work(date, date);
drop function if exists public.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean),
  app_private.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean);

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
end $function$
;

CREATE OR REPLACE FUNCTION app_private.public_campaign_contributions()
 RETURNS TABLE(campaign_id uuid, at timestamp with time zone, contributor_name text, amount bigint, payment_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select a.campaign_id, p.decided_at, coalesce(m.full_name, p.payer_name), sum(a.amount), p.id
  from public.payment_allocations a
  join public.payments p on p.id = a.payment_id and p.status = 'confirmed'
  left join public.members m on m.id = a.member_id
  where a.kind = 'campaign'
  group by a.campaign_id, p.decided_at, coalesce(m.full_name, p.payer_name), p.id;
$function$
;

alter table public.payment_allocations drop column if exists donor_name;
drop index if exists public.expenses_fund_account_idx;
alter table public.expenses drop constraint if exists expenses_paid_from_one, drop column if exists fund_account_id,
  drop column if exists paid_in_cash;

CREATE FUNCTION app_private.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_receipt_path text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.require_committee();
  if exists (select 1 from public.expenses where id = p_id) then return p_id; end if;
  if p_spent_on > current_date + 1 then perform app_private.fail('future_date'); end if;
  if p_campaign_id is not null
     and exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.status = 'closed' for share) then
    perform app_private.fail('campaign_closed');
  end if;
  perform app_private.set_action('record_expense');
  insert into public.expenses (id, spent_on, category, campaign_id, amount, note, receipt_path, created_by)
  values (p_id, p_spent_on, p_category, p_campaign_id, p_amount, p_note, p_receipt_path, auth.uid());
  return p_id;
end $function$
;
create function public.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_receipt_path text DEFAULT NULL::text) returns uuid
language sql security invoker set search_path = '' as $$ select app_private.record_expense(p_id => p_id, p_spent_on => p_spent_on, p_category => p_category, p_amount => p_amount, p_note => p_note, p_campaign_id => p_campaign_id, p_receipt_path => p_receipt_path) $$;
revoke all on function app_private.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text, p_campaign_id uuid, p_receipt_path text) from public, anon;
grant execute on function app_private.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text, p_campaign_id uuid, p_receipt_path text) to authenticated, service_role;
revoke all on function public.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text, p_campaign_id uuid, p_receipt_path text) from public, anon, authenticated;
grant execute on function public.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text, p_campaign_id uuid, p_receipt_path text) to authenticated, service_role;
