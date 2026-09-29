-- M11 · Deleting a committee account that never did anything (the owner created one by mistake).
-- An account with any history (payments, expenses, campaigns, members, settings, reminders,
-- handovers, audit log …) is only deactivated, so the record stays complete. The admin's list
-- shows which accounts can be deleted. The RPC removes the committee row (and push subscriptions);
-- the app then deletes the login with the secret key. A future column pointing at auth.users
-- makes that last step fail on its foreign key, so nothing with history can slip through.

-- True when the user appears in any column that points at auth.users, or wrote the audit log.
create function app_private.account_has_history(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payments where p_user in (created_by, decided_by, cancelled_by))
      or exists (select 1 from public.expenses where p_user in (created_by, cancelled_by))
      or exists (select 1 from public.campaigns where p_user in (created_by, closed_by))
      or exists (select 1 from public.transfers where created_by = p_user)
      or exists (select 1 from public.reminders where sent_by = p_user)
      or exists (select 1 from public.members where created_by = p_user)
      or exists (select 1 from public.membership_periods where p_user in (created_by, cancelled_by))
      or exists (select 1 from public.fund_accounts where p_user in (created_by, updated_by))
      or exists (select 1 from public.settings where updated_by = p_user)
      or exists (select 1 from public.terms where created_by = p_user)
      or exists (select 1 from public.handovers where p_user in (started_by, submitted_by, accepted_by, cancelled_by))
      or exists (select 1 from public.balance_adjustments where created_by = p_user)
      or exists (select 1 from public.audit_log where actor = p_user);
$$;

-- Committee rows stay append-only, except the one delete_committee_member() is removing.
drop trigger a_guard on public.committee;
create trigger a_guard before update on public.committee for each row execute function
  app_private.tg_append_only('', 'display_name,role,member_id,active');
create function app_private.tg_committee_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_setting('sondoq.delete_account', true) is distinct from old.user_id::text then
    raise exception 'sondoq: committee accounts are deactivated, not deleted'
      using errcode = 'P0001', hint = 'append_only';
  end if;
  return old;
end $$;
create trigger a_guard_delete before delete on public.committee for each row
  execute function app_private.tg_committee_delete();

-- Admin only, never himself, only an account without history. Audited.
create function public.delete_committee_member(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if p_user_id = auth.uid() then perform app_private.fail('cannot_delete_self'); end if;
  if not exists (select 1 from public.committee where user_id = p_user_id) then perform app_private.fail('not_found'); end if;
  if app_private.account_has_history(p_user_id) then perform app_private.fail('has_history'); end if;
  perform set_config('sondoq.delete_account', p_user_id::text, true);
  delete from public.push_subscriptions where user_id = p_user_id;
  delete from public.committee where user_id = p_user_id;
  perform set_config('sondoq.delete_account', '', true);
  insert into public.audit_log (actor, actor_role, action, table_name, row_id, changed)
  values (auth.uid(), coalesce(app_private.my_role()::text, current_user), 'delete_committee_member', 'committee',
          p_user_id::text, null);
end $$;

-- The admin's list gains can_delete (not himself, no history).
drop view public.committee_accounts;
drop function app_private.committee_accounts();
create function app_private.committee_accounts()
returns table (user_id uuid, display_name text, role public.committee_role, active boolean, member_id uuid,
               login text, last_sign_in_at timestamptz, created_at timestamptz, can_delete boolean)
language sql stable security definer set search_path = '' as $$
  select c.user_id, c.display_name, c.role, c.active, c.member_id,
         case when u.email like '%@phone.sondoq.invalid' then '+' || split_part(u.email, '@', 1) else u.email end,
         u.last_sign_in_at, c.created_at,
         c.user_id is distinct from auth.uid() and not app_private.account_has_history(c.user_id)
  from public.committee c
  join auth.users u on u.id = c.user_id
  where app_private.is_admin()          -- only the admin (or the server) sees logins
  order by c.active desc, c.created_at;
$$;
create view public.committee_accounts with (security_invoker = true) as
  select * from app_private.committee_accounts();

revoke all on public.committee_accounts from public, anon, authenticated;
grant select on public.committee_accounts to authenticated, service_role;
revoke all on function app_private.committee_accounts(), app_private.account_has_history(uuid),
  app_private.tg_committee_delete(), public.delete_committee_member(uuid) from public, anon, authenticated;
grant execute on function app_private.committee_accounts(), public.delete_committee_member(uuid)
  to authenticated, service_role;
grant execute on function app_private.account_has_history(uuid) to service_role;
