-- ════════════════════════════════════════════════════════════════════════════════════════
-- M28 · committee-only app (owner decision 2026-09-30, docs/COMMITTEE-ONLY-PLAN.md).
--
-- No public pages, no member links (/m), no public receipt check (/r): the whole app is behind
-- the committee login. Strangers (anon) read nothing but the keepalive view (daily cron).
-- Member links are retired: their RPCs go; the member_links table stays (payment history points at
-- it, account_has_history reads it) and its one active link is marked revoked (owner OK
-- 2026-09-30, audited). member_push_subscriptions is dropped (it must be empty). The receipt check
-- verify_receipt goes too (the committee finds receipts in «الدفعات»). No real data is deleted.
-- Undo: supabase/rollback/m28_revert.sql (restores the m27 state exactly).
-- ════════════════════════════════════════════════════════════════════════════════════════

-- 1. strangers: nothing but keepalive
revoke select on public.fund_stats, public.activity_public, public.campaigns_public, public.expenses_public,
  public.terms_info, public.campaign_contributors_public, public.member_status_public, public.fund_info,
  public.fund_accounts_public, public.group_prices_public, public.member_months
from anon;
-- the helpers behind the public views (the committee keeps them through authenticated)
do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'app_private' and p.proname like 'public\_%' loop
    execute format('revoke execute on function %s from anon', f);
  end loop;
end $$;
drop function public.verify_receipt(text), app_private.verify_receipt(text);

-- 2. the committee queue no longer names a link's member (column kept, always null, so the app's
--    type is unchanged; dropped with member_links later)
create or replace view public.payment_queue with (security_invoker = true) as
  select p.id, p.status, p.payer_name, p.method, p.amount, p.paid_on, p.txn_ref, p.proof_path, p.note,
         p.created_at, p.created_by, rc.display_name as created_by_name,
         p.decided_at, p.decided_by, dc.display_name as decided_by_name,
         p.reject_reason, p.cancelled_at, p.cancel_reason,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'kind', a.kind, 'member_id', a.member_id, 'list_code', m.list_code, 'number', m.number, 'full_name', m.full_name,
                    'campaign_id', a.campaign_id, 'year', a.year, 'month', a.month, 'amount', a.amount)
                  order by m.list_code, m.number, a.year, a.month)
           from public.payment_allocations a left join public.members m on m.id = a.member_id
           where a.payment_id = p.id), '[]'::jsonb) as allocations,
         p.receipt_code,
         case when p.receipt_seq is not null then p.receipt_year || '-' || lpad(p.receipt_seq::text, 4, '0') end as receipt_no,
         null::jsonb as submitted_by_member
  from public.payments p
  left join public.committee rc on rc.user_id = p.created_by
  left join public.committee dc on dc.user_id = p.decided_by;

-- 3. member-link RPCs and helpers
drop view public.member_links_admin;
drop function public.create_member_link(uuid, text), public.revoke_member_link(uuid),
  public.member_session(text), public.member_sessions(text[]), public.member_history(text),
  public.member_recent_beneficiaries(text),
  public.member_submit_payment(text, uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text),
  public.member_save_push(text[], text, text, text), public.member_delete_push(text, text);
drop function app_private.create_member_link(uuid, text), app_private.revoke_member_link(uuid),
  app_private.member_links_admin(), app_private.member_session(text), app_private.member_sessions(text[]),
  app_private.member_history(text), app_private.member_recent_beneficiaries(text),
  app_private.member_submit_payment(text, uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text),
  app_private.member_save_push(text[], text, text, text), app_private.member_delete_push(text, text),
  app_private.link_member(uuid), app_private.member_link_for(text), app_private.require_server();

-- 4. member devices for push: none may exist
do $$
begin
  if exists (select 1 from public.member_push_subscriptions) then
    raise exception 'm28: member_push_subscriptions is not empty';
  end if;
end $$;
drop table public.member_push_subscriptions;

-- 5. the one active link is revoked (row kept for history; audited like revoke_member_link)
select app_private.set_action('retire_member_links');
with r as (
  update public.member_links set revoked_at = now() where revoked_at is null returning id
)
insert into public.audit_log (actor, actor_role, action, table_name, row_id, changed)
select null, 'm28', 'retire_member_links', 'member_links', r.id::text, null from r;
