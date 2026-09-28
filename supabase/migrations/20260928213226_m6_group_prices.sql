-- Public monthly fee per group and year («الرسوم الشهرية»), so the app stops hardcoding A/B prices.
create function app_private.public_group_prices()
returns table (year smallint, group_code text, group_name text, monthly_amount integer)
language sql stable security definer set search_path = '' as $$
  select gp.year, g.code, g.name, gp.monthly_amount
  from public.group_prices gp join public.groups g on g.id = gp.group_id
  order by gp.year, g.code;
$$;
create view public.group_prices_public with (security_invoker = true) as
  select * from app_private.public_group_prices();

revoke all on public.group_prices_public from public, anon, authenticated;
grant select on public.group_prices_public to anon, authenticated, service_role;
revoke all on function app_private.public_group_prices() from public, anon, authenticated;
grant execute on function app_private.public_group_prices() to anon, authenticated, service_role;
