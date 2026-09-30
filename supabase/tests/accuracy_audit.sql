-- Accuracy audit (owner priority #1, docs/COMMITTEE-ONLY-PLAN.md §12.1). READ-ONLY: one SELECT,
-- safe on production (MCP execute_sql / psql as postgres) and run by supabase/tests/local/run.sh.
-- Every figure is recomputed from the base tables and compared with what the app shows
-- (fund summary, views, grid, statement, stats, levies, campaigns). Returns one row per check:
-- (check, ok, detail). Anything not ok is a wrong number somewhere: report it, never "fix" data here.
with
settings as (select s.opening_balance from public.settings s),
conf as (select p.* from public.payments p where p.status = 'confirmed'),
alloc as (select a.*, p.status, p.method, p.paid_on from public.payment_allocations a join public.payments p on p.id = a.payment_id),
-- money in, recomputed: fees (months + credit, not credit use) and campaign money
fees_in as (select coalesce(sum(a.amount), 0) as v from alloc a
            where a.status = 'confirmed' and a.kind in ('months', 'credit') and a.method::text <> 'credit'),
camp_in as (select coalesce(sum(a.amount), 0) as v from alloc a where a.status = 'confirmed' and a.kind = 'campaign'),
exp_main as (select coalesce(sum(e.amount), 0) as v from public.expenses e where e.cancelled_at is null and e.campaign_id is null),
exp_camp as (select coalesce(sum(e.amount), 0) as v from public.expenses e where e.cancelled_at is null and e.campaign_id is not null),
transfers as (select coalesce(sum(t.amount), 0) as v from public.transfers t),
adjust as (select coalesce(sum(b.amount), 0) as v from public.balance_adjustments b),
fund as (select f.balance, f.money_in from app_private.public_fund_summary() f),
grid as (select mg.* from app_private.month_grid() mg),
pm as (select * from public.payment_months where released_at is null),
active_now as (select mg.member_id from grid mg
               where mg.year = extract(year from current_date) and mg.month = extract(month from current_date) and mg.status = 'active'),
checks as (
  -- 1 · the fund balance is opening + fees − main-fund spending + transfers in + adjustments
  select 'fund balance = opening + fees − spending + transfers + adjustments' as check_name,
         (select balance from fund) = (select opening_balance from settings) + (select v from fees_in) - (select v from exp_main)
                                      + (select v from transfers) + (select v from adjust) as ok,
         format('shown %s, recomputed %s', (select balance from fund),
                (select opening_balance from settings) + (select v from fees_in) - (select v from exp_main)
                + (select v from transfers) + (select v from adjust)) as detail
  union all
  select 'fund money in = confirmed fees', (select money_in from fund) = (select v from fees_in),
         format('shown %s, recomputed %s', (select money_in from fund), (select v from fees_in))
  union all
  -- 2 · the whole association: fund + campaign money = everything in − everything out + adjustments
  select 'fund + campaigns held = opening + all income − all spending + adjustments',
         (select balance from fund) + coalesce((select sum(c.balance) from app_private.public_campaign_progress() c), 0)
           = (select opening_balance from settings) + (select v from fees_in) + (select v from camp_in)
             - (select v from exp_main) - (select v from exp_camp) + (select v from adjust),
         format('fund %s + campaigns %s vs %s', (select balance from fund),
                coalesce((select sum(c.balance) from app_private.public_campaign_progress() c), 0),
                (select opening_balance from settings) + (select v from fees_in) + (select v from camp_in)
                - (select v from exp_main) - (select v from exp_camp) + (select v from adjust))
  union all
  -- 3 · every payment equals the sum of its allocations
  select 'each payment = sum of its allocations',
         not exists (select 1 from public.payments p
                     where p.amount <> coalesce((select sum(a.amount) from public.payment_allocations a where a.payment_id = p.id), -1)),
         format('%s payment(s) differ', (select count(*) from public.payments p
                     where p.amount <> coalesce((select sum(a.amount) from public.payment_allocations a where a.payment_id = p.id), -1)))
  union all
  -- 4 · a paid month is paid once, by a confirmed payment with a matching allocation
  select 'each paid month has exactly one live payment',
         not exists (select 1 from pm group by member_id, year, month having count(*) > 1),
         format('%s month(s) paid twice', (select count(*) from (select 1 from pm group by member_id, year, month having count(*) > 1) x))
  union all
  select 'each paid month comes from a confirmed payment with the same allocation',
         not exists (select 1 from pm
                     where not exists (select 1 from alloc a where a.payment_id = pm.payment_id and a.status = 'confirmed'
                                         and a.kind = 'months' and a.member_id = pm.member_id and a.year = pm.year
                                         and a.month = pm.month and a.amount = pm.amount)),
         format('%s paid month(s) without a matching confirmed allocation', (select count(*) from pm
                     where not exists (select 1 from alloc a where a.payment_id = pm.payment_id and a.status = 'confirmed'
                                         and a.kind = 'months' and a.member_id = pm.member_id and a.year = pm.year
                                         and a.month = pm.month and a.amount = pm.amount)))
  union all
  select 'each confirmed month allocation is a paid month',
         not exists (select 1 from alloc a where a.status = 'confirmed' and a.kind = 'months'
                       and not exists (select 1 from pm where pm.payment_id = a.payment_id and pm.member_id = a.member_id
                                         and pm.year = a.year and pm.month = a.month)),
         format('%s confirmed month(s) not marked paid', (select count(*) from alloc a where a.status = 'confirmed' and a.kind = 'months'
                       and not exists (select 1 from pm where pm.payment_id = a.payment_id and pm.member_id = a.member_id
                                         and pm.year = a.year and pm.month = a.month)))
  union all
  -- 5 · cancelled / rejected / pending never count
  select 'cancelled, rejected or pending payments hold no paid month',
         not exists (select 1 from pm join public.payments p on p.id = pm.payment_id where p.status <> 'confirmed'),
         format('%s', (select count(*) from pm join public.payments p on p.id = pm.payment_id where p.status <> 'confirmed'))
  union all
  select 'the activity feed lists confirmed payments only',
         not exists (select 1 from app_private.public_activity_feed() f join public.payments p on p.id = f.payment_id
                     where f.kind = 'payment_confirmed' and p.status <> 'confirmed'),
         format('%s', (select count(*) from app_private.public_activity_feed() f join public.payments p on p.id = f.payment_id
                     where f.kind = 'payment_confirmed' and p.status <> 'confirmed'))
  union all
  -- 6 · the months grid agrees with the paid months
  select 'grid paid ⇔ a live paid month',
         not exists (select 1 from grid mg where mg.paid
                       <> exists (select 1 from pm where pm.member_id = mg.member_id and pm.year = mg.year and pm.month = mg.month)),
         format('%s cell(s) differ', (select count(*) from grid mg where mg.paid
                       <> exists (select 1 from pm where pm.member_id = mg.member_id and pm.year = mg.year and pm.month = mg.month)))
  union all
  select 'member_months view state agrees with the grid',
         not exists (select 1 from public.member_months v join grid mg on mg.member_id = v.member_id and mg.year = v.year and mg.month = v.month
                     where (v.state = 'paid') <> mg.paid or (v.state = 'late') <> mg.due),
         format('%s cell(s) differ', (select count(*) from public.member_months v join grid mg on mg.member_id = v.member_id and mg.year = v.year and mg.month = v.month
                     where (v.state = 'paid') <> mg.paid or (v.state = 'late') <> mg.due))
  union all
  -- 7 · only active months can be late (exempt / away / left / deceased never owe)
  select 'only active months are late',
         not exists (select 1 from grid mg where mg.due and mg.status <> 'active'),
         format('%s', (select count(*) from grid mg where mg.due and mg.status <> 'active'))
  union all
  -- 8 · arrears = member status = grid (count and amount owed)
  select 'arrears months = late months in the grid',
         not exists (select 1 from public.arrears ar
                     where ar.months_count <> (select count(*) from grid mg where mg.member_id = ar.member_id and mg.due)
                        or ar.amount_owed <> (select coalesce(sum(mg.owed), 0) from grid mg where mg.member_id = ar.member_id)),
         format('%s member(s) differ', (select count(*) from public.arrears ar
                     where ar.months_count <> (select count(*) from grid mg where mg.member_id = ar.member_id and mg.due)
                        or ar.amount_owed <> (select coalesce(sum(mg.owed), 0) from grid mg where mg.member_id = ar.member_id)))
  union all
  select 'every active member with a late month is in arrears',
         not exists (select 1 from grid mg join app_private.member_rollup() r on r.member_id = mg.member_id
                     where mg.due and r.member_status = 'active'
                       and not exists (select 1 from public.arrears ar where ar.member_id = mg.member_id)),
         format('%s', (select count(distinct mg.member_id) from grid mg join app_private.member_rollup() r on r.member_id = mg.member_id
                     where mg.due and r.member_status = 'active'
                       and not exists (select 1 from public.arrears ar where ar.member_id = mg.member_id)))
  union all
  select 'member status months behind = late months',
         not exists (select 1 from app_private.member_rollup() r
                     where r.months_behind <> (select count(*) from grid mg where mg.member_id = r.member_id and mg.due)),
         format('%s', (select count(*) from app_private.member_rollup() r
                     where r.months_behind <> (select count(*) from grid mg where mg.member_id = r.member_id and mg.due)))
  union all
  -- 9 · a paid month cost the price of that month (price per year, group at that month)
  select 'each paid month cost the price of that month',
         not exists (select 1 from pm join public.payments p on p.id = pm.payment_id
                     where p.method::text <> 'paper'
                       and pm.amount <> coalesce(app_private.price_at(pm.member_id, pm.year, pm.month), -1)),
         format('%s month(s) differ', (select count(*) from pm join public.payments p on p.id = pm.payment_id
                     where p.method::text <> 'paper'
                       and pm.amount <> coalesce(app_private.price_at(pm.member_id, pm.year, pm.month), -1)))
  union all
  -- 10 · credit is never negative
  select 'no member has negative credit',
         not exists (select 1 from app_private.member_credit() c where c.credit < 0),
         format('%s', (select count(*) from app_private.member_credit() c where c.credit < 0))
  union all
  -- 11 · campaigns: collected = confirmed contributions; balance = collected − spent − moved
  select 'campaign collected = confirmed contributions, balance = collected − spent − moved',
         not exists (select 1 from app_private.public_campaign_progress() c
                     where c.collected <> coalesce((select sum(a.amount) from alloc a where a.status = 'confirmed' and a.kind = 'campaign'
                                                     and a.campaign_id = c.campaign_id), 0)
                        or c.spent <> coalesce((select sum(e.amount) from public.expenses e where e.campaign_id = c.campaign_id
                                                  and e.cancelled_at is null), 0)
                        or c.transferred <> coalesce((select sum(t.amount) from public.transfers t where t.from_campaign_id = c.campaign_id), 0)
                        or c.balance <> c.collected - c.spent - c.transferred),
         format('%s campaign(s) differ', (select count(*) from app_private.public_campaign_progress() c
                     where c.collected <> coalesce((select sum(a.amount) from alloc a where a.status = 'confirmed' and a.kind = 'campaign'
                                                     and a.campaign_id = c.campaign_id), 0)
                        or c.balance <> c.collected - c.spent - c.transferred))
  union all
  select 'no campaign has spent more than it held',
         not exists (select 1 from app_private.public_campaign_progress() c where c.balance < 0),
         format('%s', (select count(*) from app_private.public_campaign_progress() c where c.balance < 0))
  union all
  -- 12 · levies: shares collected = confirmed share payments; a share is paid at most once
  select 'levy shares paid = confirmed share payments',
         coalesce((select sum(l.paid) from app_private.levy_shares() l), 0)
           = coalesce((select sum(a.amount) from alloc a join public.campaigns c on c.id = a.campaign_id
                       where a.status = 'confirmed' and a.kind = 'campaign' and c.kind = 'levy'), 0),
         format('shares %s, payments %s', coalesce((select sum(l.paid) from app_private.levy_shares() l), 0),
                coalesce((select sum(a.amount) from alloc a join public.campaigns c on c.id = a.campaign_id
                          where a.status = 'confirmed' and a.kind = 'campaign' and c.kind = 'levy'), 0))
  union all
  select 'no levy share is overpaid or paid for an exempt member',
         not exists (select 1 from app_private.levy_shares() l where l.paid > l.expected or (l.exempt and l.paid > 0)),
         format('%s', (select count(*) from app_private.levy_shares() l where l.paid > l.expected or (l.exempt and l.paid > 0)))
  union all
  -- 13 · reports: this year's period report closes on the fund + campaign money; years chain
  select 'this year''s report closes on the fund + campaign money',
         ((app_private.report_period(make_date(extract(year from current_date)::int, 1, 1), current_date + 3650)) ->> 'closing')::bigint
           = (select balance from fund) + coalesce((select sum(c.balance) from app_private.public_campaign_progress() c), 0),
         format('report %s, fund + campaigns %s',
                (app_private.report_period(make_date(extract(year from current_date)::int, 1, 1), current_date + 3650)) ->> 'closing',
                (select balance from fund) + coalesce((select sum(c.balance) from app_private.public_campaign_progress() c), 0))
  union all
  select 'report months add up to the year',
         (select sum((m ->> 'income')::bigint) = (y -> 'income' ->> 'total')::bigint
                 and sum((m ->> 'spending')::bigint) = (y -> 'spending' ->> 'total')::bigint
          from (select app_private.report_period(make_date(extract(year from current_date)::int, 1, 1),
                                                 make_date(extract(year from current_date)::int, 12, 31)) y) q,
               lateral jsonb_array_elements(q.y -> 'months') m
          group by q.y),
         'monthly income and spending vs the year totals'
  union all
  -- 14 · statistics: buckets add up; active = members active this month
  select 'fee stats buckets add up to active members',
         (select (o ->> 'paid_up')::int + (o ->> 'owe_1')::int + (o ->> 'owe_2_3')::int + (o ->> 'owe_4plus')::int = (o ->> 'active')::int
                 and (o ->> 'active')::int = (select count(*) from active_now)
          from (select app_private.report_fee_stats(extract(year from current_date)::int) -> 'overall' o) x),
         (select format('active %s (grid %s), paid up %s, owe %s/%s/%s', o ->> 'active', (select count(*) from active_now),
                        o ->> 'paid_up', o ->> 'owe_1', o ->> 'owe_2_3', o ->> 'owe_4plus')
          from (select app_private.report_fee_stats(extract(year from current_date)::int) -> 'overall' o) x)
  union all
  select 'fee stats: late members = active members with a late month this year',
         (select (o ->> 'active')::int - (o ->> 'paid_up')::int
          from (select app_private.report_fee_stats(extract(year from current_date)::int) -> 'overall' o) x)
           = (select count(*) from active_now a
              where exists (select 1 from grid mg where mg.member_id = a.member_id and mg.year = extract(year from current_date) and mg.due)),
         'stats late vs grid'
  union all
  -- 15 · the member statement agrees with the grid and arrears (every member)
  select 'member statement owed = arrears = grid',
         not exists (select 1 from public.members m
                     where ((app_private.member_statement(m.id, extract(year from current_date)::smallint)) -> 'owed' ->> 'months_count')::int
                           <> (select count(*) from grid mg where mg.member_id = m.id and mg.due)),
         format('%s member(s) differ', (select count(*) from public.members m
                     where ((app_private.member_statement(m.id, extract(year from current_date)::smallint)) -> 'owed' ->> 'months_count')::int
                           <> (select count(*) from grid mg where mg.member_id = m.id and mg.due)))
  union all
  -- 16 · group moves: a member is in one period at a time
  select 'no overlapping membership periods',
         not exists (select 1 from public.membership_periods a join public.membership_periods b
                       on a.member_id = b.member_id and a.id < b.id and a.cancelled_at is null and b.cancelled_at is null
                      and a.from_month <= coalesce(b.to_month, 'infinity'::date) and b.from_month <= coalesce(a.to_month, 'infinity'::date)),
         format('%s pair(s)', (select count(*) from public.membership_periods a join public.membership_periods b
                       on a.member_id = b.member_id and a.id < b.id and a.cancelled_at is null and b.cancelled_at is null
                      and a.from_month <= coalesce(b.to_month, 'infinity'::date) and b.from_month <= coalesce(a.to_month, 'infinity'::date)))
  union all
  -- data completeness: an active month with no fee for its year (nor an earlier year to fall back on) shows 0 owed
  select 'every active month has a fee (its year, or an earlier one)',
         not exists (select 1 from grid mg where mg.status = 'active' and mg.price is null
                       and make_date(mg.year, mg.month, 1) <= current_date
                       and not exists (select 1 from public.group_prices g2 where g2.group_id = mg.group_id and g2.year < mg.year)),
         format('%s active started month(s) without any fee', (select count(*) from grid mg where mg.status = 'active' and mg.price is null
                       and make_date(mg.year, mg.month, 1) <= current_date
                       and not exists (select 1 from public.group_prices g2 where g2.group_id = mg.group_id and g2.year < mg.year)))
)
select check_name as check, ok, detail from checks;
