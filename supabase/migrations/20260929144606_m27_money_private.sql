-- ════════════════════════════════════════════════════════════════════════════════════════
-- M27 · money privacy, phase 2 (docs/MONEY-PRIVACY.md). Applied after the release
-- that reads the m26 public views and getMoney() is live (lead's go).
--
-- Strangers lose every money view; the views also return rows only to the committee or our
-- server (app_private.can_see_money()), so a signed-in account that is not active committee sees
-- nothing either. Same columns, so the committee pages and getMoney() are unchanged.
-- ════════════════════════════════════════════════════════════════════════════════════════

revoke select on public.fund_summary, public.monthly_collection, public.expense_totals, public.recent_expenses,
  public.campaign_progress, public.campaign_contributions, public.activity_feed, public.terms_public,
  public.member_status
from anon;

create or replace view public.fund_summary with (security_invoker = true) as
  select * from app_private.public_fund_summary() where app_private.can_see_money();
create or replace view public.monthly_collection with (security_invoker = true) as
  select * from app_private.public_monthly_collection() where app_private.can_see_money();
create or replace view public.expense_totals with (security_invoker = true) as
  select * from app_private.public_expense_totals() where app_private.can_see_money();
create or replace view public.recent_expenses with (security_invoker = true) as
  select * from app_private.public_recent_expenses() where app_private.can_see_money();
create or replace view public.campaign_progress with (security_invoker = true) as
  select * from app_private.public_campaign_progress() where app_private.can_see_money();
create or replace view public.campaign_contributions with (security_invoker = true) as
  select * from app_private.public_campaign_contributions() where app_private.can_see_money();
create or replace view public.activity_feed with (security_invoker = true) as
  select * from app_private.public_activity_feed() where app_private.can_see_money();
create or replace view public.terms_public with (security_invoker = true) as
  select * from app_private.public_terms() where app_private.can_see_money();
create or replace view public.member_status with (security_invoker = true) as
  select * from app_private.public_member_status() where app_private.can_see_money();
