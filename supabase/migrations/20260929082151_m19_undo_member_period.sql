-- ════════════════════════════════════════════════════════════════════════════════════════
-- M19 · undo a wrong status/group change, correct a join month (edge-case audit E1).
--
-- A mistaken «غادر» from October left October not owed for good, and a join month set too late made
-- earlier months `month_not_owed` for good: periods are append-only and to_month is set once.
-- Both fixes stay append-only (nothing is edited back): wrong periods are cancelled with the reason,
-- and the correct period is inserted again.
--
-- cancel_last_period(member, reason): cancels the open period and the one before it, and inserts
--   that previous period again as the open one (same group, status, from_month). Refused when paid
--   or pending months fall inside the cancelled period (`period_has_payments`), or when the open
--   period is the member's first one (`no_previous_period`: use set_join_month).
-- set_join_month(member, from_month, reason): moves the start of the member's first period. Refused
--   when paid or pending months fall before the new start (`period_has_payments`) or when it would
--   start after that period's end (`join_month_invalid`).
-- Admin only, reason required, audited.
-- ════════════════════════════════════════════════════════════════════════════════════════

-- Paid (confirmed, not released) or pending months of a member inside [p_from, p_to] (inclusive; null = open).
create function app_private.member_has_months(p_member uuid, p_from date, p_to date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payment_months pm
                 where pm.member_id = p_member and pm.released_at is null
                   and make_date(pm.year, pm.month, 1) between p_from and coalesce(p_to, 'infinity'::date))
      or exists (select 1 from public.payment_allocations a join public.payments p on p.id = a.payment_id
                 where a.member_id = p_member and a.kind = 'months' and p.status = 'pending'
                   and make_date(a.year, a.month, 1) between p_from and coalesce(p_to, 'infinity'::date));
$$;
revoke all on function app_private.member_has_months(uuid, date, date) from public, anon, authenticated;

create function app_private.cancel_last_period(p_member_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cur public.membership_periods;
  prev public.membership_periods;
  pid uuid;
begin
  perform app_private.require_admin();
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  select * into cur from public.membership_periods
  where member_id = p_member_id and cancelled_at is null and to_month is null for update;
  if cur.id is null then perform app_private.fail('no_open_period'); end if;
  select * into prev from public.membership_periods
  where member_id = p_member_id and cancelled_at is null and to_month = (cur.from_month - interval '1 month')::date
  for update;
  if prev.id is null then perform app_private.fail('no_previous_period'); end if;
  if app_private.member_has_months(p_member_id, cur.from_month, null) then
    perform app_private.fail('period_has_payments');
  end if;

  perform app_private.set_action('cancel_last_period');
  update public.membership_periods
  set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where id in (cur.id, prev.id);
  insert into public.membership_periods (member_id, group_id, status, from_month, reason, created_by)
  values (p_member_id, prev.group_id, prev.status, prev.from_month, prev.reason, auth.uid())
  returning id into pid;
  return pid;
end $$;

create function app_private.set_join_month(p_member_id uuid, p_from_month date, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  first public.membership_periods;
  m date := date_trunc('month', p_from_month)::date;
  pid uuid;
begin
  perform app_private.require_admin();
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  if m is null then perform app_private.fail('invalid_input'); end if;
  select * into first from public.membership_periods
  where member_id = p_member_id and cancelled_at is null
  order by from_month limit 1 for update;
  if first.id is null then perform app_private.fail('no_open_period'); end if;
  if m = first.from_month then return first.id; end if;
  if first.to_month is not null and m > first.to_month then perform app_private.fail('join_month_invalid'); end if;
  if m > first.from_month and app_private.member_has_months(p_member_id, first.from_month, (m - interval '1 month')::date) then
    perform app_private.fail('period_has_payments');
  end if;

  perform app_private.set_action('set_join_month');
  update public.membership_periods
  set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where id = first.id;
  insert into public.membership_periods (member_id, group_id, status, from_month, to_month, reason, created_by)
  values (p_member_id, first.group_id, first.status, m, first.to_month, first.reason, auth.uid())
  returning id into pid;
  return pid;
end $$;

create function public.cancel_last_period(p_member_id uuid, p_reason text) returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.cancel_last_period(p_member_id => p_member_id, p_reason => p_reason)
$$;
create function public.set_join_month(p_member_id uuid, p_from_month date, p_reason text) returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.set_join_month(p_member_id => p_member_id, p_from_month => p_from_month, p_reason => p_reason)
$$;

revoke all on function app_private.cancel_last_period(uuid, text), app_private.set_join_month(uuid, date, text)
  from public, anon;
grant execute on function app_private.cancel_last_period(uuid, text), app_private.set_join_month(uuid, date, text)
  to authenticated, service_role;
revoke all on function public.cancel_last_period(uuid, text), public.set_join_month(uuid, date, text)
  from public, anon, authenticated;
grant execute on function public.cancel_last_period(uuid, text), public.set_join_month(uuid, date, text)
  to authenticated, service_role;
