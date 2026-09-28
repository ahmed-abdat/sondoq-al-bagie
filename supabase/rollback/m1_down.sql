-- Undo the M1 migrations (dev/branch only: it DROPS all fund data).
set client_min_messages = warning;
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'payments') then
    alter publication supabase_realtime drop table public.payments;
  end if;
end $$;
drop policy if exists "proofs: committee reads" on storage.objects;
drop policy if exists "proofs: committee uploads" on storage.objects;
delete from storage.buckets where id = 'proofs' and not exists (select 1 from storage.objects o where o.bucket_id = 'proofs');

drop view if exists public.arrears, public.activity_feed, public.campaign_progress, public.recent_expenses,
  public.expense_totals, public.monthly_collection, public.fund_summary, public.member_months, public.member_status;
drop function if exists public.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text),
  public.confirm_payment(uuid), public.reject_payment(uuid, text), public.cancel_payment(uuid, text),
  public.record_expense(uuid, date, public.expense_category, integer, text, uuid, text), public.cancel_expense(uuid, text),
  public.log_reminder(public.reminder_kind, uuid, uuid, uuid),
  public.add_member(integer, text, text, date, text, text, public.membership_status), public.update_member(uuid, text, text, text),
  public.change_member_status(uuid, date, public.membership_status, text, text), public.set_group_price(text, integer, integer),
  public.set_committee_member(uuid, text, public.committee_role, uuid, boolean),
  public.update_settings(integer, date, integer, boolean);
drop schema if exists app_private cascade;   -- helpers, triggers' functions
drop table if exists public.audit_log, public.reminders, public.transfers, public.expenses, public.payment_months,
  public.payment_allocations, public.payments, public.campaign_participants, public.campaigns, public.committee,
  public.membership_periods, public.members, public.group_prices, public.groups, public.settings;
drop type if exists public.reminder_kind, public.expense_category, public.surplus_action, public.campaign_status,
  public.campaign_mode, public.allocation_kind, public.payment_status, public.payment_method, public.membership_status,
  public.committee_role;
