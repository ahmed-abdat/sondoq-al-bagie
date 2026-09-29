-- ════════════════════════════════════════════════════════════════════════════════════════
-- M18 · month prices for the record screen and the new year (edge-case audit M8, M11, M12).
--
-- M8:  the record screen priced every month with the member's current group, but the database
--      prices each month by the period (group) of that month → `wrong_month_amount` after a group
--      change. `member_months` now carries `price`: the exact amount a payment for that month must
--      have (same rule as app_private.price_at; null when the year has no price yet).
-- M11: `member_months` already has every year from the member's first period; the app now reads the
--      late months of past years from it (no SQL change needed).
-- M12: a year without prices counted late months as 0 owed. `owed` now falls back to the group's
--      latest earlier price, so arrears stay honest on 1 January. The price a payment must match
--      stays strict (`no_price` until the admin sets the new year's price).
-- ════════════════════════════════════════════════════════════════════════════════════════

create or replace function app_private.month_grid()
returns table (member_id uuid, year integer, month integer, group_id smallint, status public.membership_status,
               price integer, paid boolean, due boolean, owed integer)
language sql stable security definer set search_path = '' as $$
  with cfg as (select s.grace_days from public.settings s),
  months as (
    select p.member_id, p.group_id, p.status, gs::date as m
    from public.membership_periods p,
         generate_series(p.from_month,
                         least(coalesce(p.to_month, 'infinity'::date),
                               make_date(extract(year from current_date)::integer, 12, 1)),
                         interval '1 month') gs
    where p.cancelled_at is null
  )
  select mo.member_id, extract(year from mo.m)::integer, extract(month from mo.m)::integer, mo.group_id, mo.status,
         gp.monthly_amount,
         pm.member_id is not null,
         pm.member_id is null and mo.status = 'active' and current_date >= mo.m + cfg.grace_days,
         case when pm.member_id is null and mo.status = 'active' and current_date >= mo.m + cfg.grace_days
              then coalesce(gp.monthly_amount,
                            (select g2.monthly_amount from public.group_prices g2
                             where g2.group_id = mo.group_id and g2.year < extract(year from mo.m)
                             order by g2.year desc limit 1), 0)
              else 0 end
  from months mo
  cross join cfg
  left join public.group_prices gp on gp.group_id = mo.group_id and gp.year = extract(year from mo.m)
  left join public.payment_months pm
    on pm.member_id = mo.member_id and pm.year = extract(year from mo.m) and pm.month = extract(month from mo.m)
   and pm.released_at is null;
$$;

drop view public.member_months;
drop function app_private.public_member_months();

-- Each member's months for the detail sheet: paid | late | upcoming | not_owed, with the price a
-- payment for that month must have (null = no price set for that year yet).
create function app_private.public_member_months()
returns table (member_id uuid, year integer, month integer, state text, price integer)
language sql stable security definer set search_path = '' as $$
  select mg.member_id, mg.year, mg.month,
         case when mg.paid then 'paid'
              when mg.status <> 'active' then 'not_owed'
              when mg.due then 'late'
              else 'upcoming' end,
         mg.price
  from app_private.month_grid() mg;
$$;
create view public.member_months with (security_invoker = true) as
  select * from app_private.public_member_months();

revoke all on function app_private.public_member_months() from public;
grant execute on function app_private.public_member_months() to anon, authenticated, service_role;
revoke all on public.member_months from public;
grant select on public.member_months to anon, authenticated, service_role;
