-- ════════════════════════════════════════════════════════════════════════════════════════
-- M15 · a closed campaign takes no more money in or out (edge-case audit C1/C2).
--
-- C1: contributions are checked only when the pending payment is recorded, so one confirmed after
--     close_campaign added money that was neither in the fund nor transferable. Now close_campaign
--     refuses while a pending payment contributes to it (`campaign_has_pending`), and confirm_payment
--     refuses a contribution to a closed campaign (`campaign_closed`; reject it instead).
-- C2: record_expense accepted an expense on a closed campaign (negative campaign balance). Refused
--     now for every closed campaign.
-- Owner decision (2026-09-29): closing ALWAYS moves what is left to the main fund; 'keep' is no
-- longer offered. p_surplus_action stays in the signature (old clients) but is stored as 'to_fund'.
-- Both read the campaign row with FOR SHARE, so they wait for a concurrent close_campaign
-- (which holds FOR UPDATE) and then see it closed.
-- ════════════════════════════════════════════════════════════════════════════════════════

create or replace function app_private.close_campaign(p_id uuid, p_surplus_action public.surplus_action) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
  left_over integer;
begin
  perform app_private.require_campaign_manager();
  select * into c from public.campaigns where id = p_id for update;
  if c.id is null then perform app_private.fail('not_found'); end if;
  if c.status = 'closed' then return 0; end if;
  if p_surplus_action is null then perform app_private.fail('invalid_input'); end if;
  if exists (select 1 from public.payment_allocations a join public.payments p on p.id = a.payment_id
             where a.kind = 'campaign' and a.campaign_id = p_id and p.status = 'pending') then
    perform app_private.fail('campaign_has_pending');
  end if;
  perform app_private.set_action('close_campaign');
  update public.campaigns set status = 'closed', closed_at = now(), closed_by = auth.uid(), surplus_action = 'to_fund'
  where id = p_id;
  select greatest(balance, 0)::integer into left_over from app_private.public_campaign_progress() where campaign_id = p_id;
  if left_over > 0 then
    insert into public.transfers (from_campaign_id, amount, created_by) values (p_id, left_over, auth.uid());
    return left_over;
  end if;
  return 0;
end $$;

create or replace function app_private.confirm_payment(p_payment_id uuid) returns jsonb
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
    perform app_private.fail('month_already_paid');
  end;
  perform set_config('sondoq.confirming', '', true);

  if p.method <> 'paper' then perform app_private.issue_receipt(p.id); end if;

  return jsonb_build_object('status', 'confirmed', 'already', false, 'decided_by', auth.uid(), 'decided_at', now(),
    'decided_by_name', (select c.display_name from public.committee c where c.user_id = auth.uid()),
    'receipt_code', (select x.receipt_code from public.payments x where x.id = p.id));
end $$;

create or replace function app_private.record_expense(
  p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer,
  p_note text default null, p_campaign_id uuid default null, p_receipt_path text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
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
end $$;
