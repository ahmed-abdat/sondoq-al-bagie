-- Undo m40 (activity scope): activity_log(p_before, p_limit) as at m39 (pg_get_functiondef). Run as
-- postgres; also run first by m2_down.sql.
set client_min_messages = warning;
drop function if exists public.activity_log(bigint, integer, text), app_private.activity_log(bigint, integer, text);
CREATE OR REPLACE FUNCTION app_private.activity_log(p_before bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint, at timestamp with time zone, actor uuid, actor_name text, action text, table_name text, row_id text, subject text, amount integer, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.require_committee();
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
    from g order by g.id desc
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
CREATE OR REPLACE FUNCTION public.activity_log(p_before bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint, at timestamp with time zone, actor uuid, actor_name text, action text, table_name text, row_id text, subject text, amount integer, reason text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from app_private.activity_log(p_before => p_before, p_limit => p_limit)
$function$
;
revoke all on function app_private.activity_log(bigint, integer), public.activity_log(bigint, integer)
from public, anon, authenticated;
grant execute on function app_private.activity_log(bigint, integer), public.activity_log(bigint, integer)
to authenticated, service_role;
