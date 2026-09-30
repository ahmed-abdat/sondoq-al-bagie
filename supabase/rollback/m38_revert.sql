-- Undo m38 (expense activities): back to the m37 state (fixed categories). Bodies are
-- pg_get_functiondef of the m37 state. Expenses keep their `category` (the mirror). Run as postgres;
-- also run first by m2_down.sql.
set client_min_messages = warning;
drop function if exists public.add_expense_activity(text), app_private.add_expense_activity(text),
  public.rename_expense_activity(integer, text), app_private.rename_expense_activity(integer, text),
  public.set_expense_activity_active(integer, boolean), app_private.set_expense_activity_active(integer, boolean),
  public.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean),
  app_private.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean);
CREATE OR REPLACE FUNCTION app_private.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_receipt_path text DEFAULT NULL::text, p_fund_account_id uuid DEFAULT NULL::uuid, p_paid_in_cash boolean DEFAULT false)
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
  if coalesce(p_paid_in_cash, false) and p_fund_account_id is not null then perform app_private.fail('invalid_input'); end if;
  if p_fund_account_id is not null and not exists (select 1 from public.fund_accounts f where f.id = p_fund_account_id) then
    perform app_private.fail('not_found');
  end if;
  perform app_private.set_action('record_expense');
  insert into public.expenses (id, spent_on, category, campaign_id, amount, note, receipt_path, created_by, fund_account_id,
                               paid_in_cash)
  values (p_id, p_spent_on, p_category, p_campaign_id, p_amount, p_note, p_receipt_path, auth.uid(), p_fund_account_id,
          coalesce(p_paid_in_cash, false));
  return p_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_receipt_path text DEFAULT NULL::text, p_fund_account_id uuid DEFAULT NULL::uuid, p_paid_in_cash boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select app_private.record_expense(p_id => p_id, p_spent_on => p_spent_on, p_category => p_category, p_amount => p_amount,
                                    p_note => p_note, p_campaign_id => p_campaign_id, p_receipt_path => p_receipt_path,
                                    p_fund_account_id => p_fund_account_id, p_paid_in_cash => p_paid_in_cash)
$function$
;
revoke all on function app_private.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean),
  public.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean)
from public, anon, authenticated;
grant execute on function app_private.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean),
  public.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean)
to authenticated, service_role;
CREATE OR REPLACE FUNCTION app_private.report_period(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  opening_base bigint := (select s.opening_balance from public.settings s);
  before_in bigint;
  before_out bigint;
  before_adj bigint;
  r jsonb;
begin
  perform app_private.require_committee();
  if p_from is null or p_to is null or p_to < p_from then perform app_private.fail('invalid_input'); end if;

  -- all money in: fees + levy shares + donations (confirmed; credit use is not new money)
  select coalesce(sum(a.amount), 0) into before_in
  from public.payment_allocations a join public.payments p on p.id = a.payment_id
  where p.status = 'confirmed' and p.method::text <> 'credit' and p.paid_on < p_from;
  select coalesce(sum(e.amount), 0) into before_out
  from public.expenses e where e.cancelled_at is null and e.spent_on < p_from;
  select coalesce(sum(b.amount), 0) into before_adj
  from public.balance_adjustments b where b.created_at::date < p_from;

  with pin as (
    select p.paid_on, a.amount,
           case when a.kind in ('months', 'credit') then 'fees'
                when c.kind = 'levy' then 'levies' else 'donations' end as source
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    left join public.campaigns c on c.id = a.campaign_id
    where p.status = 'confirmed' and p.method::text <> 'credit' and p.paid_on between p_from and p_to
  ),
  pout as (
    select e.spent_on, e.category, e.amount, e.campaign_id
    from public.expenses e where e.cancelled_at is null and e.spent_on between p_from and p_to
  ),
  padj as (select coalesce(sum(b.amount), 0) as total from public.balance_adjustments b
           where b.created_at::date between p_from and p_to),
  months as (
    select date_trunc('month', gs)::date as m
    from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') gs
  ),
  -- campaign money still held at p_to (collected − spent − moved to the fund)
  camp as (
    select coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                     where a.kind = 'campaign' and p.status = 'confirmed' and p.paid_on <= p_to), 0)
         - coalesce((select sum(e.amount) from public.expenses e
                     where e.campaign_id is not null and e.cancelled_at is null and e.spent_on <= p_to), 0)
         - coalesce((select sum(t.amount) from public.transfers t where t.created_at::date <= p_to), 0) as held
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'opening', opening_base + before_in - before_out + before_adj,
    'income', jsonb_build_object(
      'fees', coalesce((select sum(amount) from pin where source = 'fees'), 0),
      'levies', coalesce((select sum(amount) from pin where source = 'levies'), 0),
      'donations', coalesce((select sum(amount) from pin where source = 'donations'), 0),
      'total', coalesce((select sum(amount) from pin), 0)),
    'spending', jsonb_build_object(
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', x.category, 'amount', x.amount) order by x.amount desc, x.category)
                               from (select category, sum(amount) as amount from pout group by category) x), '[]'::jsonb),
      'from_campaigns', coalesce((select sum(amount) from pout where campaign_id is not null), 0),
      'total', coalesce((select sum(amount) from pout), 0)),
    'adjustments', (select total from padj),
    'closing', opening_base + before_in - before_out + before_adj
               + coalesce((select sum(amount) from pin), 0) - coalesce((select sum(amount) from pout), 0) + (select total from padj),
    'campaigns_held', (select held from camp),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'year', extract(year from mo.m)::int, 'month', extract(month from mo.m)::int,
               'income', coalesce((select sum(amount) from pin where date_trunc('month', pin.paid_on) = mo.m), 0),
               'spending', coalesce((select sum(amount) from pout where date_trunc('month', pout.spent_on) = mo.m), 0))
             order by mo.m)
      from months mo), '[]'::jsonb))
  into r;
  return r;
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
      or exists (select 1 from public.campaign_participants where exempted_by = p_user)
      or exists (select 1 from public.audit_log where actor = p_user);
$function$
;
drop trigger if exists b_activity on public.expenses;
drop function if exists app_private.tg_expense_activity();
alter table public.expenses drop column if exists activity_id;
drop table if exists public.expense_activities;
