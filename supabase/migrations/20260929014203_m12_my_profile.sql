-- M12 · «حسابي»: a committee member edits their own display name and, once, links their own
-- member row. Changing or removing an existing link stays with the admin (set_committee_member):
-- the link is what stops a confirmer from confirming their own membership fees, so a confirmer
-- must not be able to unlink themselves. Role, login and active stay admin-only. Audited.
create function public.update_my_profile(p_display_name text, p_member_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cur public.committee;
begin
  perform app_private.require_committee();
  select * into cur from public.committee where user_id = auth.uid() and active;
  if cur.user_id is null then perform app_private.fail('not_committee'); end if;
  if btrim(coalesce(p_display_name, '')) = '' or length(btrim(p_display_name)) > 60 then
    perform app_private.fail('invalid_input');
  end if;
  if p_member_id is distinct from cur.member_id then
    if cur.member_id is not null then perform app_private.fail('member_link_admin_only'); end if;
    if not exists (select 1 from public.members_admin where member_id = p_member_id and member_status = 'active') then
      perform app_private.fail('member_not_active');
    end if;
    if exists (select 1 from public.committee where member_id = p_member_id) then
      perform app_private.fail('member_taken');
    end if;
  end if;
  perform app_private.set_action('update_my_profile');
  update public.committee set display_name = btrim(p_display_name), member_id = p_member_id
  where user_id = auth.uid();
end $$;

revoke all on function public.update_my_profile(text, uuid) from public, anon, authenticated;
grant execute on function public.update_my_profile(text, uuid) to authenticated, service_role;
