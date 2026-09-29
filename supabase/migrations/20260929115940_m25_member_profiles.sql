-- ════════════════════════════════════════════════════════════════════════════════════════
-- M25 · several member profiles on one phone (owner decision 2026-09-29: family phones, up to 5).
--
-- member_sessions(hashes[]): one round trip for the «أنت» profile switcher (valid links only, no
--   last_used_at touch; the active profile's member_session does that).
-- One device can follow several profiles: member_push_subscriptions is unique per (link, endpoint)
--   instead of per endpoint; member_save_push takes every hash of the device's saved profiles.
-- ════════════════════════════════════════════════════════════════════════════════════════

create function app_private.member_sessions(p_token_hashes text[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_server();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'token_hash', l.token_hash, 'link_id', l.id, 'member_id', m.id,
             'member_ref', m.list_code || '-' || m.number, 'full_name', m.full_name))
    from public.member_links l join public.members m on m.id = l.member_id
    where l.revoked_at is null
      and l.token_hash = any (select lower(h) from unnest(coalesce(p_token_hashes, '{}')) h limit 10)), '[]'::jsonb);
end $$;
create function public.member_sessions(p_token_hashes text[]) returns jsonb
language sql security invoker set search_path = '' as $$
  select app_private.member_sessions(p_token_hashes => p_token_hashes)
$$;

-- push: one row per (profile, device)
alter table public.member_push_subscriptions drop constraint member_push_subscriptions_endpoint_key;
alter table public.member_push_subscriptions
  add constraint member_push_subscriptions_link_endpoint_key unique (link_id, endpoint);
create index member_push_subscriptions_endpoint_idx on public.member_push_subscriptions (endpoint);

drop function public.member_save_push(text, text, text, text);
drop function app_private.member_save_push(text, text, text, text);
-- Saves this device for every valid link among p_token_hashes (the device's saved profiles).
-- Returns how many profiles now notify this device.
create function app_private.member_save_push(p_token_hashes text[], p_endpoint text, p_p256dh text, p_auth text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  perform app_private.require_server();
  if btrim(coalesce(p_endpoint, '')) !~ '^https://' or btrim(coalesce(p_p256dh, '')) = '' or btrim(coalesce(p_auth, '')) = '' then
    perform app_private.fail('invalid_input');
  end if;
  insert into public.member_push_subscriptions (link_id, endpoint, p256dh, auth)
  select l.id, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth)
  from public.member_links l
  where l.revoked_at is null
    and l.token_hash = any (select lower(h) from unnest(coalesce(p_token_hashes, '{}')) h limit 10)
  on conflict (link_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, failures = 0;
  get diagnostics n = row_count;
  if n = 0 then perform app_private.fail('member_link_invalid'); end if;
  return n;
end $$;
create function public.member_save_push(p_token_hashes text[], p_endpoint text, p_p256dh text, p_auth text)
returns integer
language sql security invoker set search_path = '' as $$
  select app_private.member_save_push(p_token_hashes => p_token_hashes, p_endpoint => p_endpoint,
                                      p_p256dh => p_p256dh, p_auth => p_auth)
$$;

revoke all on function app_private.member_sessions(text[]), public.member_sessions(text[]),
  app_private.member_save_push(text[], text, text, text), public.member_save_push(text[], text, text, text)
from public, anon, authenticated;
grant execute on function app_private.member_sessions(text[]), public.member_sessions(text[]),
  app_private.member_save_push(text[], text, text, text), public.member_save_push(text[], text, text, text)
to service_role;
