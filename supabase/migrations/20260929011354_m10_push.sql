-- M10 · Web Push for the committee (phase 1: «دفعة بانتظار التأكيد» to admin/treasurer/deputy).
-- One row per browser push subscription. A committee member saves and removes only their own
-- rows through the two RPCs below; the server (secret key) reads the rows to send and cleans up
-- dead ones. Not fund data: no audit, and rows are deleted for real when a browser unsubscribes.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  user_agent text check (length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures integer not null default 0 check (failures >= 0)
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy own_read on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()) and (select app_private.is_committee()));

-- Save this browser's subscription for the signed-in committee member. The same endpoint signed in
-- by someone else moves to them (a shared phone notifies whoever signed in last).
create function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_committee();
  if auth.uid() is null then perform app_private.fail('not_committee'); end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth), left(nullif(btrim(p_user_agent), ''), 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, failures = 0;
end $$;

-- Remove one of the caller's own subscriptions (turning notifications off, or before signing out).
-- Any signed-in user may call it (a deactivated member can still clean up); unknown = no-op.
create function public.delete_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then perform app_private.fail('not_committee'); end if;
  delete from public.push_subscriptions where endpoint = btrim(p_endpoint) and user_id = auth.uid();
end $$;

revoke all on public.push_subscriptions from public, anon, authenticated;
grant select on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
revoke all on function public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text)
  from public, anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text)
  to authenticated, service_role;
