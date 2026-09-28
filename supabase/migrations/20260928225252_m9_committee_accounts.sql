-- M9 · committee accounts without emails. The admin creates each login (an email, or a phone
-- number mapped to <222XXXXXXXX>@phone.sondoq.invalid), the app shows a generated password once,
-- and the admin sends it himself. This adds the admin's list of accounts (with the login and
-- last sign-in from auth.users) and a switch to deactivate / reactivate an account.

create function app_private.committee_accounts()
returns table (user_id uuid, display_name text, role public.committee_role, active boolean, member_id uuid,
               login text, last_sign_in_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.user_id, c.display_name, c.role, c.active, c.member_id,
         case when u.email like '%@phone.sondoq.invalid' then '+' || split_part(u.email, '@', 1) else u.email end,
         u.last_sign_in_at, c.created_at
  from public.committee c
  join auth.users u on u.id = c.user_id
  where app_private.is_admin()          -- only the admin (or the server) sees logins
  order by c.active desc, c.created_at;
$$;

create view public.committee_accounts with (security_invoker = true) as
  select * from app_private.committee_accounts();

-- Deactivate or reactivate a committee account (never deleted). The admin cannot lock himself out.
create function public.set_committee_active(p_user_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if p_user_id = auth.uid() and not p_active then perform app_private.fail('cannot_demote_self'); end if;
  if not exists (select 1 from public.committee where user_id = p_user_id) then perform app_private.fail('not_found'); end if;
  perform app_private.set_action(case when p_active then 'reactivate_committee_member' else 'deactivate_committee_member' end);
  update public.committee set active = p_active where user_id = p_user_id;
end $$;

revoke all on public.committee_accounts from public, anon, authenticated;
grant select on public.committee_accounts to authenticated, service_role;
revoke all on function app_private.committee_accounts(), public.set_committee_active(uuid, boolean)
  from public, anon, authenticated;
grant execute on function app_private.committee_accounts(), public.set_committee_active(uuid, boolean)
  to authenticated, service_role;
