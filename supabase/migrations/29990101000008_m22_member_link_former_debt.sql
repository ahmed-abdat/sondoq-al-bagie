-- ════════════════════════════════════════════════════════════════════════════════════════
-- M22 · confirmers linked to a member (audit E6) and old debt of former members (audit M14).
--
-- E6 (owner decision 2026-09-29): admin/treasurer/deputy should be linked to their member row, or
--    the own-membership rule cannot apply to them. No hard block (current admins keep working):
--    `committee_accounts.needs_member_link` flags a confirmer without a link; the admin may mark an
--    account `not_member` (a confirmer who is genuinely not a member), which clears the flag.
--    The app's first-sign-in setup requires a member for confirmers unless marked.
-- M14 (owner decision): unpaid months from before a member left or became exempt stay visible in
--    the member sheet only (`members_admin.former_debt_*`), not in the public late list or reminders.
-- ════════════════════════════════════════════════════════════════════════════════════════

/* ── E6 ── */

alter table public.committee add column not_member boolean not null default false;

drop trigger a_guard on public.committee;
create trigger a_guard before update on public.committee for each row execute function
  app_private.tg_append_only('', 'display_name,role,member_id,active,not_member');

create function app_private.set_committee_not_member(p_user_id uuid, p_not_member boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if p_not_member is null then perform app_private.fail('invalid_input'); end if;
  if not exists (select 1 from public.committee where user_id = p_user_id) then perform app_private.fail('not_found'); end if;
  perform app_private.set_action('set_committee_not_member');
  update public.committee set not_member = p_not_member where user_id = p_user_id;
end $$;
create function public.set_committee_not_member(p_user_id uuid, p_not_member boolean) returns void
language sql security invoker set search_path = '' as $$
  select app_private.set_committee_not_member(p_user_id => p_user_id, p_not_member => p_not_member)
$$;
revoke all on function app_private.set_committee_not_member(uuid, boolean) from public, anon;
grant execute on function app_private.set_committee_not_member(uuid, boolean) to authenticated, service_role;
revoke all on function public.set_committee_not_member(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_committee_not_member(uuid, boolean) to authenticated, service_role;

-- m11 body + not_member and needs_member_link (confirmer role, no member, not marked).
drop view public.committee_accounts;
drop function app_private.committee_accounts();
create function app_private.committee_accounts()
returns table (user_id uuid, display_name text, role public.committee_role, active boolean, member_id uuid,
               login text, last_sign_in_at timestamptz, created_at timestamptz, can_delete boolean,
               not_member boolean, needs_member_link boolean)
language sql stable security definer set search_path = '' as $$
  select c.user_id, c.display_name, c.role, c.active, c.member_id,
         case when u.email like '%@phone.sondoq.invalid' then '+' || split_part(u.email, '@', 1) else u.email end,
         u.last_sign_in_at, c.created_at,
         c.user_id is distinct from auth.uid() and not app_private.account_has_history(c.user_id),
         c.not_member,
         c.active and c.role in ('admin', 'treasurer', 'deputy') and c.member_id is null and not c.not_member
  from public.committee c
  join auth.users u on u.id = c.user_id
  where app_private.is_admin()          -- only the admin (or the server) sees logins
  order by c.active desc, c.created_at;
$$;
create view public.committee_accounts with (security_invoker = true) as
  select * from app_private.committee_accounts();
revoke all on public.committee_accounts from public, anon, authenticated;
grant select on public.committee_accounts to authenticated, service_role;
revoke all on function app_private.committee_accounts() from public, anon, authenticated;
grant execute on function app_private.committee_accounts() to authenticated, service_role;

/* ── M14 ── */

-- m7 body + former_debt_months / former_debt_amount: due, unpaid months of a member who is no
-- longer active (null for active members, whose debt is months_behind / amount_owed and arrears).
drop view public.members_admin;
create view public.members_admin with (security_invoker = true) as
  select m.id as member_id, m.list_code, m.number, m.list_code || '-' || m.number as member_ref, m.full_name,
         m.phone, m.note, r.group_code, r.member_status, r.months_paid_this_year, r.months_behind, r.amount_owed,
         (select min(p.from_month) from public.membership_periods p where p.member_id = m.id and p.cancelled_at is null)
           as joined_month,
         m.created_at,
         case when r.member_status is distinct from 'active' then o.months end as former_debt_months,
         case when r.member_status is distinct from 'active' then o.amount_owed end as former_debt_amount
  from public.members m
  join app_private.member_rollup() r on r.member_id = m.id
  left join app_private.member_owed_months() o on o.member_id = m.id;
revoke all on public.members_admin from public, anon, authenticated;
grant select on public.members_admin to authenticated, service_role;
