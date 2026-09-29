-- ════════════════════════════════════════════════════════════════════════════════════════
-- M26 · money privacy, phase 1 (docs/MONEY-PRIVACY.md, owner decision 2026-09-29).
--
-- Amount-free public views for strangers, next to today's money views (nothing is revoked here,
-- so the live app keeps working). The app's public pages move to these; money comes only to the
-- committee (its session) and to members (our server, after checking their link). Phase 2 (m27,
-- after that release is live) revokes anon on the money views and guards them with
-- app_private.can_see_money().
-- Public views read the same app_private functions and project only non-money columns.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- The committee (signed in, active) or our server (service role: members' money after the link check).
create function app_private.can_see_money() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.is_committee() or app_private.is_server();
$$;
revoke all on function app_private.can_see_money() from public, anon;
grant execute on function app_private.can_see_money() to authenticated, service_role;

create view public.fund_stats with (security_invoker = true) as
  select members_ok, members_behind, members_active, last_activity_at, term_number, term_started_on
  from app_private.public_fund_summary();

-- no receipt_code: /r/<code> is public and shows that receipt's amount
create view public.activity_public with (security_invoker = true) as
  select at, kind, member_names, months, category, payment_id, method
  from app_private.public_activity_feed();

create view public.campaigns_public with (security_invoker = true) as
  select campaign_id, title, purpose, deadline, status, amount_mode, participants, participants_paid
  from app_private.public_campaign_progress();

create view public.expenses_public with (security_invoker = true) as
  select id, spent_on, category, note, campaign_id
  from app_private.public_recent_expenses();

create view public.terms_info with (security_invoker = true) as
  select number, title, started_on, ended_on
  from app_private.public_terms();

create view public.campaign_contributors_public with (security_invoker = true) as
  select campaign_id, at, contributor_name, payment_id
  from app_private.public_campaign_contributions();

create view public.member_status_public with (security_invoker = true) as
  select member_id, list_code, number, member_ref, full_name, group_code, member_status, months_paid_this_year,
         months_behind, status_label
  from app_private.public_member_status();

revoke all on public.fund_stats, public.activity_public, public.campaigns_public, public.expenses_public,
  public.terms_info, public.campaign_contributors_public, public.member_status_public from public;
grant select on public.fund_stats, public.activity_public, public.campaigns_public, public.expenses_public,
  public.terms_info, public.campaign_contributors_public, public.member_status_public
  to anon, authenticated, service_role;
