-- Keep-alive for the free-tier cron (projects pause after 7 idle days). One cheap real query,
-- readable with the publishable key: GET /rest/v1/keepalive?select=ok
create function app_private.keepalive() returns table (ok boolean, groups bigint)
language sql stable security definer set search_path = '' as $$
  select true, count(*) from public.groups;
$$;
revoke all on function app_private.keepalive() from public;
grant execute on function app_private.keepalive() to anon, authenticated, service_role;

create view public.keepalive with (security_invoker = true) as
  select * from app_private.keepalive();
revoke all on public.keepalive from anon, authenticated;
grant select on public.keepalive to anon, authenticated;
