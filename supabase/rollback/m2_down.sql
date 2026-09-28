-- Undo the M2 migrations (dev/branch only). Enum values added to payment_method stay (Postgres
-- cannot drop them); nothing else uses them once M2 is gone.
set client_min_messages = warning;
-- campaigns (m6)
drop function if exists public.create_campaign(uuid, text, public.campaign_mode, text, integer, date, jsonb),
  public.update_campaign(uuid, text, text, integer, date), public.close_campaign(uuid, public.surplus_action),
  app_private.require_campaign_manager();
-- backups (m5)
delete from storage.buckets where id = 'backups' and not exists (select 1 from storage.objects o where o.bucket_id = 'backups');
-- receipts
drop view if exists public.payment_queue;
drop function if exists public.verify_receipt(text), app_private.issue_receipt(uuid), app_private.new_receipt_code();
create or replace function public.confirm_payment(p_payment_id uuid) returns jsonb
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
drop trigger if exists a_guard on public.payments;
alter table public.payments drop constraint if exists payments_receipt_shape,
  drop column if exists receipt_year, drop column if exists receipt_seq, drop column if exists receipt_code;
create trigger a_guard before update or delete on public.payments for each row execute function
  app_private.tg_append_only('decided_at,decided_by,reject_reason,cancelled_at,cancelled_by,cancel_reason', 'status');
drop table if exists public.receipt_counters;
drop view if exists public.campaign_contributions, public.activity_feed;
drop function if exists app_private.public_campaign_contributions(), app_private.public_activity_feed();
create function app_private.public_activity_feed()
returns table (at timestamptz, kind text, member_names text, months integer, amount integer, category public.expense_category)
language sql stable security definer set search_path = '' as $$ select null::timestamptz, null, null, null::integer, null::integer, null::public.expense_category where false $$;
create view public.activity_feed with (security_invoker = true) as select * from app_private.public_activity_feed();
grant select on public.activity_feed to anon, authenticated;
grant execute on function app_private.public_activity_feed() to anon, authenticated;
-- accounts
drop view if exists public.payment_queue, public.fund_info, public.fund_accounts_public;
drop function if exists public.undo_payment(uuid),
  public.add_fund_account(public.payment_method, text, text, text, integer),
  public.update_fund_account(uuid, text, text, integer, boolean),
  public.update_settings(integer, date, integer, boolean, text),
  app_private.public_fund_accounts(), app_private.public_fund_info();
drop table if exists public.fund_accounts;
drop trigger if exists a_guard on public.settings;
alter table public.settings drop column if exists whatsapp_contact;
create trigger a_guard before update or delete on public.settings for each row execute function
  app_private.tg_append_only('', 'opening_balance,opening_balance_on,grace_days,show_amount_owed,updated_at,updated_by');

create or replace function app_private.public_activity_feed()
returns table (at timestamptz, kind text, member_names text, months integer, amount integer, category public.expense_category)
language sql stable security definer set search_path = '' as $$
  (select p.decided_at, 'payment_confirmed',
          (select string_agg(distinct m.full_name, '، ') from public.payment_allocations a
           join public.members m on m.id = a.member_id where a.payment_id = p.id),
          (select count(*) from public.payment_allocations a where a.payment_id = p.id and a.kind = 'months')::integer,
          null::integer, null::public.expense_category
   from public.payments p
   where p.status in ('confirmed', 'cancelled') and p.decided_at is not null and p.method <> 'paper'
   order by p.decided_at desc limit 30)
  union all
  (select e.created_at, 'expense', null, null, e.amount, e.category
   from public.expenses e where e.cancelled_at is null order by e.created_at desc limit 20)
  union all
  (select c.created_at, 'campaign_opened', null, null, c.target_amount, null
   from public.campaigns c order by c.created_at desc limit 10)
  order by 1 desc limit 50;
$$;

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
revoke all on function public.update_settings(integer, date, integer, boolean) from public, anon, authenticated;
grant execute on function public.update_settings(integer, date, integer, boolean) to authenticated, service_role;
