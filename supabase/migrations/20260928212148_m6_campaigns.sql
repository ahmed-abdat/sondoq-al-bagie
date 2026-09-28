-- ════════════════════════════════════════════════════════════════════════════════════════
-- M6 · donation campaigns («تبرع خاص»): open, edit, close. Never deleted. Contributions are
-- ordinary payments with a 'campaign' allocation (record_payment), so one transfer can pay
-- months and a campaign together. Admin, treasurer or deputy manage campaigns.
-- ════════════════════════════════════════════════════════════════════════════════════════

create function app_private.require_campaign_manager() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not (app_private.is_admin() or app_private.can_confirm()) then perform app_private.fail('not_allowed'); end if;
end $$;

-- p_participants (optional): [{"member_id": …, "expected_amount": 5000}, …] for fixed / per_group /
-- custom campaigns (the app computes the amounts); expected_amount null = any amount.
create function public.create_campaign(
  p_id uuid, p_title text, p_amount_mode public.campaign_mode default 'open',
  p_purpose text default null, p_target_amount integer default null, p_deadline date default null,
  p_participants jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_campaign_manager();
  if exists (select 1 from public.campaigns where id = p_id) then return p_id; end if;   -- retried request
  if btrim(coalesce(p_title, '')) = '' then perform app_private.fail('invalid_input'); end if;
  perform app_private.set_action('create_campaign');
  insert into public.campaigns (id, title, purpose, target_amount, deadline, amount_mode, created_by)
  values (p_id, btrim(p_title), nullif(btrim(p_purpose), ''), p_target_amount, p_deadline, p_amount_mode, auth.uid());
  if p_participants is not null and jsonb_typeof(p_participants) = 'array' then
    insert into public.campaign_participants (campaign_id, member_id, expected_amount)
    select p_id, x.member_id, x.expected_amount
    from jsonb_to_recordset(p_participants) x(member_id uuid, expected_amount integer)
    on conflict do nothing;
  end if;
  return p_id;
end $$;

create function public.update_campaign(
  p_id uuid, p_title text, p_purpose text, p_target_amount integer, p_deadline date
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
begin
  perform app_private.require_campaign_manager();
  select * into c from public.campaigns where id = p_id for update;
  if c.id is null then perform app_private.fail('not_found'); end if;
  if c.status = 'closed' then perform app_private.fail('campaign_closed'); end if;
  if btrim(coalesce(p_title, '')) = '' then perform app_private.fail('invalid_input'); end if;
  perform app_private.set_action('update_campaign');
  update public.campaigns
  set title = btrim(p_title), purpose = nullif(btrim(p_purpose), ''), target_amount = p_target_amount, deadline = p_deadline
  where id = p_id;
end $$;

-- Close: no more contributions. 'to_fund' moves what is left (collected − spent) to the main
-- fund as a transfer; 'keep' leaves it in the campaign. Returns the amount moved.
create function public.close_campaign(p_id uuid, p_surplus_action public.surplus_action) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
  left_over integer;
begin
  perform app_private.require_campaign_manager();
  select * into c from public.campaigns where id = p_id for update;
  if c.id is null then perform app_private.fail('not_found'); end if;
  if c.status = 'closed' then return 0; end if;
  if p_surplus_action is null then perform app_private.fail('invalid_input'); end if;
  perform app_private.set_action('close_campaign');
  update public.campaigns set status = 'closed', closed_at = now(), closed_by = auth.uid(), surplus_action = p_surplus_action
  where id = p_id;
  select greatest(balance, 0)::integer into left_over from app_private.public_campaign_progress() where campaign_id = p_id;
  if p_surplus_action = 'to_fund' and left_over > 0 then
    insert into public.transfers (from_campaign_id, amount, created_by) values (p_id, left_over, auth.uid());
    return left_over;
  end if;
  return 0;
end $$;

revoke all on function app_private.require_campaign_manager(),
  public.create_campaign(uuid, text, public.campaign_mode, text, integer, date, jsonb),
  public.update_campaign(uuid, text, text, integer, date),
  public.close_campaign(uuid, public.surplus_action)
from public, anon, authenticated;
grant execute on function
  public.create_campaign(uuid, text, public.campaign_mode, text, integer, date, jsonb),
  public.update_campaign(uuid, text, text, integer, date),
  public.close_campaign(uuid, public.surplus_action)
to authenticated, service_role;
grant execute on function app_private.require_campaign_manager() to service_role;
