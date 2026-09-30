-- ════════════════════════════════════════════════════════════════════════════════════════
-- M40 · «سجل العمليات» shows business actions by default (owner 2026-09-30): activity_log gains
-- p_scope 'money' (default: payments, expenses, campaigns/levies, members, the fund) | 'settings'
-- (wallets, settings, committee accounts, push, fees, activities, …) | 'all'. Filtered in SQL before
-- the page limit, so paging stays right. Calls without p_scope now get 'money'.
-- Bodies = pg_get_functiondef at m39 with the scope added. Undo: supabase/rollback/m40_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

drop function public.activity_log(bigint, integer);
drop function app_private.activity_log(bigint, integer);
CREATE OR REPLACE FUNCTION app_private.activity_log(p_before bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50, p_scope text DEFAULT 'money'::text)
 RETURNS TABLE(id bigint, at timestamp with time zone, actor uuid, actor_name text, action text, table_name text, row_id text, subject text, amount integer, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.require_committee();
  if coalesce(p_scope, '') not in ('money', 'settings', 'all') then perform app_private.fail('invalid_input'); end if;
  return query
  with g as (
    select max(a.id) as id, a.at, a.actor, a.action,
           (array_agg(a.table_name || '|' || coalesce(a.row_id, '')
                      order by coalesce(array_position(array['payments', 'expenses', 'campaigns', 'members',
                        'membership_periods', 'committee', 'handovers', 'terms', 'settings', 'group_prices',
                        'fund_accounts', 'balance_adjustments', 'transfers', 'campaign_participants'], a.table_name), 99),
                        a.id))[1] as main
    from public.audit_log a
    where p_before is null or a.id < p_before
    group by a.at, a.actor, a.action
  ),
  page as (
    select g.id, g.at, g.actor, g.action, split_part(g.main, '|', 1) as tbl, nullif(split_part(g.main, '|', 2), '') as rid,
           case when split_part(g.main, '|', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then split_part(g.main, '|', 2)::uuid end as uid
    from g
    -- «سجل العمليات» scope (m40): money = payments, expenses, campaigns/levies, members, the fund;
    -- settings = everything else (wallets, settings, accounts, push, fees, activities). Before the
    -- limit, so paging stays right.
    where p_scope = 'all'
       or (split_part(g.main, '|', 1) = any (array['payments', 'payment_allocations', 'payment_months', 'expenses',
             'campaigns', 'campaign_participants', 'members', 'membership_periods', 'transfers', 'balance_adjustments',
             'handovers', 'terms'])) = (p_scope = 'money')
    order by g.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select page.id, page.at, page.actor, c.display_name, page.action, page.tbl, page.rid,
         coalesce(pay.payer_name, ex.subject, mem.full_name, per.full_name, cam.title, com.display_name, lev.subject),
         coalesce(pay.amount, ex.amount, lev.amount),
         coalesce(pay.reason, ex.reason, per.reason, lev.reason)
  from page
  left join public.committee c on c.user_id = page.actor
  left join lateral (select p.payer_name, p.amount, coalesce(p.cancel_reason, p.reject_reason) as reason
                     from public.payments p where page.tbl = 'payments' and p.id = page.uid) pay on true
  left join lateral (select coalesce(e.note, e.category::text) as subject, e.amount, e.cancel_reason as reason
                     from public.expenses e where page.tbl = 'expenses' and e.id = page.uid) ex on true
  left join lateral (select m.full_name from public.members m
                     where page.tbl = 'members' and m.id = page.uid) mem on true
  left join lateral (select m.full_name, coalesce(mp.cancel_reason, mp.reason) as reason
                     from public.membership_periods mp join public.members m on m.id = mp.member_id
                     where page.tbl = 'membership_periods' and mp.id = page.uid) per on true
  left join lateral (select x.title from public.campaigns x
                     where page.tbl = 'campaigns' and x.id = page.uid) cam on true
  left join lateral (select x.display_name from public.committee x
                     where page.tbl = 'committee' and x.user_id = page.uid) com on true
  left join lateral (select m.full_name || ' · ' || c2.title as subject, cp.expected_amount as amount, cp.exempt_reason as reason
                     from public.campaign_participants cp join public.members m on m.id = cp.member_id
                     join public.campaigns c2 on c2.id = cp.campaign_id
                     where page.tbl = 'campaign_participants' and cp.member_id = page.uid
                     order by cp.created_at desc limit 1) lev on true
  order by page.id desc;
end $function$
;
CREATE OR REPLACE FUNCTION public.activity_log(p_before bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50, p_scope text DEFAULT 'money'::text)
 RETURNS TABLE(id bigint, at timestamp with time zone, actor uuid, actor_name text, action text, table_name text, row_id text, subject text, amount integer, reason text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from app_private.activity_log(p_before => p_before, p_limit => p_limit, p_scope => p_scope)
$function$
;
revoke all on function app_private.activity_log(bigint, integer, text), public.activity_log(bigint, integer, text)
from public, anon, authenticated;
grant execute on function app_private.activity_log(bigint, integer, text), public.activity_log(bigint, integer, text)
to authenticated, service_role;
