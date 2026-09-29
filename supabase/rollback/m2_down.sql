-- Undo every migration after M1 (m2 … m26, newest first; the name is historical). Dev/branch only. Enum values added to payment_method stay (Postgres
-- cannot drop them); nothing else uses them once M2 is gone.
set client_min_messages = warning;
-- public views without money (m26)
drop view if exists public.fund_stats, public.activity_public, public.campaigns_public, public.expenses_public,
  public.terms_info, public.campaign_contributors_public, public.member_status_public;
drop function if exists app_private.can_see_money();
-- member profiles (m25): dropped with the m24 tables below
drop function if exists public.member_sessions(text[]), app_private.member_sessions(text[]),
  public.member_save_push(text[], text, text, text), app_private.member_save_push(text[], text, text, text);
-- member links (m24); payment_queue and account_has_history are restored by the undos below
drop function if exists public.create_member_link(uuid, text), public.revoke_member_link(uuid),
  public.member_session(text), public.member_history(text), public.member_recent_beneficiaries(text),
  public.member_submit_payment(text, uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text),
  public.member_save_push(text, text, text, text), public.member_delete_push(text, text);
drop view if exists public.member_links_admin;
drop view if exists public.payment_queue;
drop function if exists app_private.create_member_link(uuid, text), app_private.revoke_member_link(uuid),
  app_private.member_session(text), app_private.member_history(text), app_private.member_recent_beneficiaries(text),
  app_private.member_submit_payment(text, uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text),
  app_private.member_save_push(text, text, text, text), app_private.member_delete_push(text, text),
  app_private.member_links_admin(), app_private.link_member(uuid), app_private.member_link_for(text),
  app_private.require_server();
drop table if exists public.member_push_subscriptions;
alter table public.payments drop column if exists submitted_via_link;
drop table if exists public.member_links;
-- P2 guards (m23): the txn index goes back to raw refs; function bodies are restored below
drop index if exists public.payments_txn_ref_uniq;
create unique index payments_txn_ref_uniq on public.payments (method, txn_ref)
  where txn_ref is not null and status in ('pending', 'confirmed');
drop function if exists app_private.norm_txn(text);
-- member link flag, former debt (m22): views are recreated by the m11/m7 undos below
drop function if exists public.set_committee_not_member(uuid, boolean), app_private.set_committee_not_member(uuid, boolean);
drop view if exists public.committee_accounts;
alter table public.committee drop column if exists not_member;
-- pay from credit (m21); the 'credit' enum value stays (like the m2 methods); views are restored below
drop function if exists public.apply_credit(uuid, uuid, jsonb), app_private.apply_credit(uuid, uuid, jsonb);
drop trigger if exists b_credit_payment_guard on public.payments;
drop function if exists app_private.tg_credit_payment_guard();
-- small guards (m20); change_member_status is restored by the m7/m1 undos
drop index if exists public.audit_log_actor_idx;
drop trigger if exists z_keep_an_admin on public.committee;
drop function if exists app_private.tg_keep_an_admin();
drop trigger if exists b_not_before_opening on public.payments;
drop trigger if exists b_not_before_opening on public.expenses;
drop function if exists app_private.tg_not_before_opening();
-- undo a period / join month (m19)
drop function if exists public.cancel_last_period(uuid, text), public.set_join_month(uuid, date, text),
  app_private.cancel_last_period(uuid, text), app_private.set_join_month(uuid, date, text),
  app_private.member_has_months(uuid, date, date);
-- month prices (m18): member_months/month_grid are dropped by the m1 undo; its body stays harmless until then
-- month error detail (m17): other bodies are dropped or restored by the undos below
drop function if exists app_private.month_error(text, uuid, integer, integer, integer);
-- backup snapshot and job runs (m16)
drop function if exists public.backup_snapshot(text[]);
drop table if exists public.job_runs;
-- m14 (handover difference at submit) and m15 (closed campaign guards) only replaced function bodies
-- (accept_handover, public_terms, close_campaign, confirm_payment, record_expense); the m1/m6/m8 undos
-- below drop or restore those functions, so they need no step of their own.
-- security advisor wrappers (m13): the definer RPCs back into public
drop function if exists public.accept_handover(p_id uuid, p_new_term_title text);
alter function app_private.accept_handover(p_id uuid, p_new_term_title text) set schema public;
drop function if exists public.add_fund_account(p_method public.payment_method, p_account_number text, p_holder_name text, p_note text, p_sort_order integer);
alter function app_private.add_fund_account(p_method public.payment_method, p_account_number text, p_holder_name text, p_note text, p_sort_order integer) set schema public;
drop function if exists public.add_member(p_number integer, p_full_name text, p_group_code text, p_from_month date, p_phone text, p_note text, p_status public.membership_status, p_list_code text);
alter function app_private.add_member(p_number integer, p_full_name text, p_group_code text, p_from_month date, p_phone text, p_note text, p_status public.membership_status, p_list_code text) set schema public;
drop function if exists public.cancel_expense(p_expense_id uuid, p_reason text);
alter function app_private.cancel_expense(p_expense_id uuid, p_reason text) set schema public;
drop function if exists public.cancel_handover(p_id uuid, p_reason text);
alter function app_private.cancel_handover(p_id uuid, p_reason text) set schema public;
drop function if exists public.cancel_payment(p_payment_id uuid, p_reason text);
alter function app_private.cancel_payment(p_payment_id uuid, p_reason text) set schema public;
drop function if exists public.change_member_group(p_member_id uuid, p_from_month date, p_group_code text, p_reason text);
alter function app_private.change_member_group(p_member_id uuid, p_from_month date, p_group_code text, p_reason text) set schema public;
drop function if exists public.change_member_status(p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text);
alter function app_private.change_member_status(p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text) set schema public;
drop function if exists public.close_campaign(p_id uuid, p_surplus_action public.surplus_action);
alter function app_private.close_campaign(p_id uuid, p_surplus_action public.surplus_action) set schema public;
drop function if exists public.confirm_payment(p_payment_id uuid);
alter function app_private.confirm_payment(p_payment_id uuid) set schema public;
drop function if exists public.create_campaign(p_id uuid, p_title text, p_amount_mode public.campaign_mode, p_purpose text, p_target_amount integer, p_deadline date, p_participants jsonb);
alter function app_private.create_campaign(p_id uuid, p_title text, p_amount_mode public.campaign_mode, p_purpose text, p_target_amount integer, p_deadline date, p_participants jsonb) set schema public;
drop function if exists public.delete_committee_member(p_user_id uuid);
alter function app_private.delete_committee_member(p_user_id uuid) set schema public;
drop function if exists public.delete_push_subscription(p_endpoint text);
alter function app_private.delete_push_subscription(p_endpoint text) set schema public;
drop function if exists public.log_reminder(p_kind public.reminder_kind, p_member_id uuid, p_campaign_id uuid, p_payment_id uuid);
alter function app_private.log_reminder(p_kind public.reminder_kind, p_member_id uuid, p_campaign_id uuid, p_payment_id uuid) set schema public;
drop function if exists public.next_member_number(p_list_code text);
alter function app_private.next_member_number(p_list_code text) set schema public;
drop function if exists public.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text, p_campaign_id uuid, p_receipt_path text);
alter function app_private.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text, p_campaign_id uuid, p_receipt_path text) set schema public;
drop function if exists public.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text, p_proof_path text, p_proof_hash text, p_note text);
alter function app_private.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text, p_proof_path text, p_proof_hash text, p_note text) set schema public;
drop function if exists public.reject_payment(p_payment_id uuid, p_reason text);
alter function app_private.reject_payment(p_payment_id uuid, p_reason text) set schema public;
drop function if exists public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text);
alter function app_private.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) set schema public;
drop function if exists public.set_committee_active(p_user_id uuid, p_active boolean);
alter function app_private.set_committee_active(p_user_id uuid, p_active boolean) set schema public;
drop function if exists public.set_committee_member(p_user_id uuid, p_display_name text, p_role public.committee_role, p_member_id uuid, p_active boolean);
alter function app_private.set_committee_member(p_user_id uuid, p_display_name text, p_role public.committee_role, p_member_id uuid, p_active boolean) set schema public;
drop function if exists public.set_group_price(p_group_code text, p_year integer, p_monthly_amount integer);
alter function app_private.set_group_price(p_group_code text, p_year integer, p_monthly_amount integer) set schema public;
drop function if exists public.start_handover(p_id uuid, p_note text);
alter function app_private.start_handover(p_id uuid, p_note text) set schema public;
drop function if exists public.submit_handover(p_id uuid);
alter function app_private.submit_handover(p_id uuid) set schema public;
drop function if exists public.undo_payment(p_payment_id uuid);
alter function app_private.undo_payment(p_payment_id uuid) set schema public;
drop function if exists public.update_campaign(p_id uuid, p_title text, p_purpose text, p_target_amount integer, p_deadline date);
alter function app_private.update_campaign(p_id uuid, p_title text, p_purpose text, p_target_amount integer, p_deadline date) set schema public;
drop function if exists public.update_fund_account(p_id uuid, p_holder_name text, p_note text, p_sort_order integer, p_active boolean);
alter function app_private.update_fund_account(p_id uuid, p_holder_name text, p_note text, p_sort_order integer, p_active boolean) set schema public;
drop function if exists public.update_handover_draft(p_id uuid, p_counted_lines jsonb, p_carry_over uuid[], p_note text);
alter function app_private.update_handover_draft(p_id uuid, p_counted_lines jsonb, p_carry_over uuid[], p_note text) set schema public;
drop function if exists public.update_member(p_member_id uuid, p_full_name text, p_phone text, p_note text, p_number integer);
alter function app_private.update_member(p_member_id uuid, p_full_name text, p_phone text, p_note text, p_number integer) set schema public;
drop function if exists public.update_my_profile(p_display_name text, p_member_id uuid);
alter function app_private.update_my_profile(p_display_name text, p_member_id uuid) set schema public;
drop function if exists public.update_settings(p_opening_balance integer, p_opening_balance_on date, p_grace_days integer, p_show_amount_owed boolean, p_whatsapp_contact text);
alter function app_private.update_settings(p_opening_balance integer, p_opening_balance_on date, p_grace_days integer, p_show_amount_owed boolean, p_whatsapp_contact text) set schema public;
drop function if exists public.verify_receipt(p_code text);
alter function app_private.verify_receipt(p_code text) set schema public;
-- my profile (m12)
drop function if exists public.update_my_profile(text, uuid);
-- delete accounts (m11): committee rows back to never deleted
drop function if exists public.delete_committee_member(uuid);
drop trigger if exists a_guard_delete on public.committee;
drop function if exists app_private.tg_committee_delete();
drop trigger if exists a_guard on public.committee;
create trigger a_guard before update or delete on public.committee for each row execute function
  app_private.tg_append_only('', 'display_name,role,member_id,active');
drop view if exists public.committee_accounts;
drop function if exists app_private.committee_accounts(), app_private.account_has_history(uuid);
-- push subscriptions (m10)
drop function if exists public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text);
drop table if exists public.push_subscriptions;
-- committee accounts (m9)
drop view if exists public.committee_accounts;
drop function if exists app_private.committee_accounts(), public.set_committee_active(uuid, boolean);
-- admin confirms (m8)
create or replace function app_private.can_confirm() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app_private.my_role() in ('treasurer', 'deputy'), false) or app_private.is_server();
$$;
-- terms and handover (m8)
drop view if exists public.handovers_admin, public.terms_public, public.fund_summary;
drop function if exists public.start_handover(uuid, text), public.update_handover_draft(uuid, jsonb, uuid[], text),
  public.submit_handover(uuid), public.accept_handover(uuid, text), public.cancel_handover(uuid, text),
  app_private.current_balance(), app_private.require_money_keeper(), app_private.lines_total(jsonb),
  app_private.public_terms(), app_private.public_fund_summary();
create or replace function app_private.public_activity_feed()
returns table (at timestamptz, kind text, member_names text, months integer, amount integer,
               category public.expense_category, payment_id uuid, method public.payment_method, receipt_code text)
language sql stable security definer set search_path = '' as $$
  (select p.decided_at, 'payment_confirmed',
          (select string_agg(distinct m.full_name, '، ') from public.payment_allocations a
           join public.members m on m.id = a.member_id where a.payment_id = p.id),
          (select count(*) from public.payment_allocations a where a.payment_id = p.id and a.kind = 'months')::integer,
          p.amount, null::public.expense_category, p.id, p.method, p.receipt_code
   from public.payments p
   where p.status = 'confirmed' and p.decided_at is not null and p.method <> 'paper'
   order by p.decided_at desc limit 30)
  union all
  (select e.created_at, 'expense', null, null, e.amount, e.category, null, null, null
   from public.expenses e where e.cancelled_at is null order by e.created_at desc limit 20)
  union all
  (select c.created_at, 'campaign_opened', null, null, c.target_amount, null, null, null, null
   from public.campaigns c order by c.created_at desc limit 10)
  order by 1 desc limit 50;
$$;
drop table if exists public.balance_adjustments, public.handovers, public.terms;
drop type if exists public.handover_status;
create function app_private.public_fund_summary()
returns table (opening_balance integer, money_in bigint, money_out bigint, transfers_in bigint, balance bigint,
               collected_this_year bigint, spent_this_year bigint, members_ok integer, members_behind integer,
               last_activity_at timestamptz, members_active integer)
language sql stable security definer set search_path = '' as $$
  with fin as (
    select coalesce(sum(a.amount), 0) as total,
           coalesce(sum(a.amount) filter (where extract(year from p.paid_on) = extract(year from current_date)), 0) as this_year
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    where p.status = 'confirmed' and a.kind in ('months', 'credit')
  ),
  fout as (
    select coalesce(sum(e.amount), 0) as total,
           coalesce(sum(e.amount) filter (where extract(year from e.spent_on) = extract(year from current_date)), 0) as this_year
    from public.expenses e where e.cancelled_at is null and e.campaign_id is null
  ),
  tr as (select coalesce(sum(t.amount), 0) as total from public.transfers t),
  mem as (
    select count(*) filter (where r.member_status = 'active' and r.months_behind = 0)::integer as ok,
           count(*) filter (where r.member_status = 'active' and r.months_behind > 0)::integer as behind,
           count(*) filter (where r.member_status = 'active')::integer as active
    from app_private.member_rollup() r
  )
  select s.opening_balance, fin.total, fout.total, tr.total,
         s.opening_balance + fin.total - fout.total + tr.total,
         fin.this_year, fout.this_year, mem.ok, mem.behind,
         greatest((select max(coalesce(p.cancelled_at, p.decided_at)) from public.payments p),
                  (select max(coalesce(e.cancelled_at, e.created_at)) from public.expenses e)),
         mem.active
  from public.settings s, fin, fout, tr, mem;
$$;
create view public.fund_summary with (security_invoker = true) as select * from app_private.public_fund_summary();
grant select on public.fund_summary to anon, authenticated, service_role;
grant execute on function app_private.public_fund_summary() to anon, authenticated, service_role;
create or replace function public.update_settings(
  p_opening_balance integer default null, p_opening_balance_on date default null,
  p_grace_days integer default null, p_show_amount_owed boolean default null,
  p_whatsapp_contact text default null
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
    whatsapp_contact   = case when p_whatsapp_contact is null then whatsapp_contact
                              else nullif(regexp_replace(p_whatsapp_contact, '[\s-]', '', 'g'), '') end,
    updated_at = now(), updated_by = auth.uid()
  where id;   -- the singleton row (PostgREST sessions load pg_safeupdate: no UPDATE without WHERE)
end $$;
-- member lists (m7): back to one global numbering
drop view if exists public.payment_queue, public.members_admin, public.arrears, public.member_status, public.fund_summary;
drop function if exists app_private.public_member_status(), app_private.public_fund_summary(), app_private.member_rollup(),
  public.add_member(integer, text, text, date, text, text, public.membership_status, text),
  public.update_member(uuid, text, text, text, integer), public.change_member_group(uuid, date, text, text),
  public.next_member_number(text);
drop trigger if exists a_guard on public.members;
alter table public.members drop constraint if exists members_list_number_key;
alter table public.members drop column if exists list_code;
do $$   -- global numbering only fits when the two lists never reuse a number
begin
  if exists (select 1 from public.members group by number having count(*) > 1) then
    raise notice 'members_number_key not restored: lists A and B share numbers';
  else
    alter table public.members add constraint members_number_key unique (number);
  end if;
end $$;
create trigger a_guard before update or delete on public.members for each row execute function
  app_private.tg_append_only('', 'full_name,phone,note');
create function app_private.member_rollup()
returns table (member_id uuid, number integer, full_name text, group_code text, member_status public.membership_status,
               months_paid_this_year integer, months_behind integer, amount_owed integer)
language sql stable security definer set search_path = '' as $$
  with g as (
    select mg.member_id,
           count(*) filter (where mg.paid and mg.year = extract(year from current_date))::integer as paid_y,
           count(*) filter (where mg.due)::integer as behind,
           coalesce(sum(mg.owed), 0)::integer as owed
    from app_private.month_grid() mg group by mg.member_id
  ),
  cur as (   -- the period covering this month, else the most recent one
    select distinct on (p.member_id) p.member_id, p.group_id, p.status
    from public.membership_periods p
    where p.cancelled_at is null and p.from_month <= current_date
    order by p.member_id, p.from_month desc
  )
  select m.id, m.number, m.full_name, gr.code, cur.status,
         coalesce(g.paid_y, 0), coalesce(g.behind, 0), coalesce(g.owed, 0)
  from public.members m
  left join cur on cur.member_id = m.id
  left join public.groups gr on gr.id = cur.group_id
  left join g on g.member_id = m.id;
$$;
create function app_private.public_member_status()
returns table (member_id uuid, number integer, full_name text, group_code text, member_status public.membership_status,
               months_paid_this_year integer, months_behind integer, status_label text, amount_owed integer)
language sql stable security definer set search_path = '' as $$
  select r.member_id, r.number, r.full_name, r.group_code, r.member_status,
         r.months_paid_this_year, r.months_behind,
         case when r.months_behind > 0 then 'متأخر' else 'منتظم' end,
         case when (select s.show_amount_owed from public.settings s) then r.amount_owed end
  from app_private.member_rollup() r;
$$;
create function app_private.public_fund_summary()
returns table (opening_balance integer, money_in bigint, money_out bigint, transfers_in bigint, balance bigint,
               collected_this_year bigint, spent_this_year bigint, members_ok integer, members_behind integer,
               last_activity_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with fin as (
    select coalesce(sum(a.amount), 0) as total,
           coalesce(sum(a.amount) filter (where extract(year from p.paid_on) = extract(year from current_date)), 0) as this_year
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    where p.status = 'confirmed' and a.kind in ('months', 'credit')
  ),
  fout as (
    select coalesce(sum(e.amount), 0) as total,
           coalesce(sum(e.amount) filter (where extract(year from e.spent_on) = extract(year from current_date)), 0) as this_year
    from public.expenses e where e.cancelled_at is null and e.campaign_id is null
  ),
  tr as (select coalesce(sum(t.amount), 0) as total from public.transfers t),
  mem as (
    select count(*) filter (where r.months_behind = 0 and r.member_status = 'active')::integer as ok,
           count(*) filter (where r.months_behind > 0)::integer as behind
    from app_private.member_rollup() r
  )
  select s.opening_balance, fin.total, fout.total, tr.total,
         s.opening_balance + fin.total - fout.total + tr.total,
         fin.this_year, fout.this_year, mem.ok, mem.behind,
         greatest((select max(coalesce(p.cancelled_at, p.decided_at)) from public.payments p),
                  (select max(coalesce(e.cancelled_at, e.created_at)) from public.expenses e))
  from public.settings s, fin, fout, tr, mem;
$$;
create view public.member_status with (security_invoker = true) as
  select * from app_private.public_member_status();
create view public.fund_summary with (security_invoker = true) as
  select * from app_private.public_fund_summary();
create view public.arrears with (security_invoker = true) as
  select m.id as member_id, m.number, m.full_name, m.phone, r.group_code, r.member_status,
         o.months, o.months_count, o.amount_owed, coalesce(cr.credit, 0) as credit,
         (select max(rm.sent_at) from public.reminders rm where rm.member_id = m.id) as last_reminded_at
  from public.members m
  join app_private.member_owed_months() o on o.member_id = m.id
  join app_private.member_rollup() r on r.member_id = m.id
  left join app_private.member_credit() cr on cr.member_id = m.id;
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
grant select on public.member_status, public.fund_summary to anon, authenticated;
grant select on public.arrears to authenticated;
grant execute on function app_private.public_member_status(), app_private.public_fund_summary() to anon, authenticated;
grant execute on function app_private.member_rollup() to authenticated;
revoke all on function public.add_member(integer, text, text, date, text, text, public.membership_status),
  public.update_member(uuid, text, text, text) from public, anon;
grant execute on function public.add_member(integer, text, text, date, text, text, public.membership_status),
  public.update_member(uuid, text, text, text) to authenticated, service_role;
-- group prices (m6)
drop view if exists public.group_prices_public;
drop function if exists app_private.public_group_prices();
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
