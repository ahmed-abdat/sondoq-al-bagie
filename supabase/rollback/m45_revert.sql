-- Undo m45 (one opening): report_wallets, set_fund_account_opening, set_cash_opening and
-- accuracy_audit as at m44 (pg_get_functiondef); the settings trigger dropped. Dev/branch only. Run as
-- postgres; also run first by m2_down.sql.
set client_min_messages = warning;
drop trigger if exists b_openings_fit on public.settings;
drop function if exists app_private.tg_openings_fit();
CREATE OR REPLACE FUNCTION app_private.report_wallets(p_from date, p_to date)
 RETURNS TABLE(wallet_type_id smallint, fund_account_id uuid, method public.payment_method, in_count integer, in_amount bigint, out_count integer, out_amount bigint, opening_balance bigint, opening_on date, balance bigint, transfer_in bigint, transfer_out bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  cash_id smallint := (select w.id from public.wallet_types w where w.kind = 'cash');
  base bigint := (select s.opening_balance from public.settings s);
begin
  perform app_private.require_committee();
  if p_from is null or p_to is null or p_to < p_from then perform app_private.fail('invalid_input'); end if;
  return query
  with raw as (
    select p.wallet_type_id as t, p.fund_account_id as w, p.method as m, p.amount::bigint as amount, p.paid_on as d, 'in' as k
    from public.payments p where p.status = 'confirmed' and p.method::text <> 'credit'
    union all
    select e.wallet_type_id, e.fund_account_id, null, e.amount, e.spent_on, 'out'
    from public.expenses e where e.cancelled_at is null
    union all
    select x.from_wallet_type_id, x.from_account_id, null, x.amount, x.moved_on, 'tout'
    from public.wallet_transfers x where x.cancelled_at is null
    union all
    select x.to_wallet_type_id, x.to_account_id, null, x.amount, x.moved_on, 'tin'
    from public.wallet_transfers x where x.cancelled_at is null
    union all
    -- a handover difference is counted in cash
    select cash_id, null, null, b.amount, b.created_at::date, 'adj' from public.balance_adjustments b
  ),
  -- where the balance sits: the account, else the wallet, else cash (paper sheets, expenses without a wallet)
  moves as (
    select r.*, case when r.k in ('out', 'tout') then -r.amount else r.amount end as signed,
           coalesce(r.t, cash_id) as bt
    from raw r
  ),
  accounts as (
    select f.wallet_type_id as t, f.id as w, f.method as m, f.opening_balance, f.opening_on,
           (select count(*) from moves x where x.w = f.id and x.k = 'in' and x.d between p_from and p_to)::integer as ic,
           coalesce((select sum(amount) from moves x where x.w = f.id and x.k = 'in' and x.d between p_from and p_to), 0)::bigint as ia,
           (select count(*) from moves x where x.w = f.id and x.k = 'out' and x.d between p_from and p_to)::integer as oc,
           coalesce((select sum(amount) from moves x where x.w = f.id and x.k = 'out' and x.d between p_from and p_to), 0)::bigint as oa,
           coalesce((select sum(amount) from moves x where x.w = f.id and x.k = 'tin' and x.d between p_from and p_to), 0)::bigint as ti,
           coalesce((select sum(amount) from moves x where x.w = f.id and x.k = 'tout' and x.d between p_from and p_to), 0)::bigint as tt,
           (coalesce(f.opening_balance, 0)
            + coalesce((select sum(signed) from moves x where x.w = f.id and x.d <= p_to
                          and (f.opening_on is null or x.d >= f.opening_on)), 0))::bigint as bal,
           f.active
    from public.fund_accounts f
  ),
  -- money of a wallet with no account, and cash
  loose as (
    select w.id as t, w.kind, w.legacy_method as m, w.opening_balance, w.opening_on,
           count(*) filter (where x.k = 'in' and x.t = w.id and x.d between p_from and p_to)::integer as ic,
           coalesce(sum(x.amount) filter (where x.k = 'in' and x.t = w.id and x.d between p_from and p_to), 0)::bigint as ia,
           count(*) filter (where x.k = 'out' and x.t = w.id and x.d between p_from and p_to)::integer as oc,
           coalesce(sum(x.amount) filter (where x.k = 'out' and x.t = w.id and x.d between p_from and p_to), 0)::bigint as oa,
           coalesce(sum(x.amount) filter (where x.k = 'tin' and x.d between p_from and p_to), 0)::bigint as ti,
           coalesce(sum(x.amount) filter (where x.k = 'tout' and x.d between p_from and p_to), 0)::bigint as tt,
           (case when w.kind = 'cash' then coalesce(w.opening_balance, base) else 0 end
            + coalesce(sum(x.signed) filter (where x.d <= p_to and (w.opening_on is null or x.d >= w.opening_on)), 0))::bigint as bal
    from public.wallet_types w
    left join moves x on x.w is null and x.bt = w.id
    group by w.id
  ),
  -- paper sheets and expenses without a wallet: their own rows (in/out only; the money is in cash)
  other as (
    select x.m,
           count(*) filter (where x.k = 'in')::integer as ic, coalesce(sum(x.amount) filter (where x.k = 'in'), 0)::bigint as ia,
           count(*) filter (where x.k = 'out')::integer as oc, coalesce(sum(x.amount) filter (where x.k = 'out'), 0)::bigint as oa
    from moves x where x.t is null and x.w is null and x.k in ('in', 'out') and x.d between p_from and p_to
    group by x.m
  )
  select a.t, a.w, a.m, a.ic, a.ia, a.oc, a.oa, a.opening_balance::bigint, a.opening_on, a.bal, a.ti, a.tt
  from accounts a where a.active or a.ic > 0 or a.oc > 0 or a.ti > 0 or a.tt > 0 or a.bal <> 0
  union all
  select l.t, null, l.m, l.ic, l.ia, l.oc, l.oa, l.opening_balance::bigint, l.opening_on, l.bal, l.ti, l.tt
  from loose l where l.kind = 'cash' or l.ic > 0 or l.oc > 0 or l.ti > 0 or l.tt > 0 or l.bal <> 0
  union all
  select null, null, o.m, o.ic, o.ia, o.oc, o.oa, null, null, null, 0::bigint, 0::bigint from other o
  order by 1 nulls last, 2 nulls last, 3 nulls last;
end $function$
;
CREATE OR REPLACE FUNCTION app_private.set_fund_account_opening(p_id uuid, p_amount integer, p_on date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.fund_accounts;
begin
  perform app_private.require_admin();
  if p_amount is null or p_amount < 0 or p_on is null or p_on > current_date then perform app_private.fail('invalid_input'); end if;
  select * into a from public.fund_accounts where id = p_id for update;
  if a.id is null then perform app_private.fail('not_found'); end if;
  if a.opening_on is not null then perform app_private.fail('opening_already_set'); end if;
  perform app_private.set_action('set_fund_account_opening');
  update public.fund_accounts set opening_balance = p_amount, opening_on = p_on, updated_at = now(), updated_by = auth.uid()
  where id = p_id;
end $function$
;
CREATE OR REPLACE FUNCTION app_private.set_cash_opening(p_amount integer, p_on date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  w public.wallet_types;
begin
  perform app_private.require_admin();
  if p_amount is null or p_amount < 0 or p_on is null or p_on > current_date then perform app_private.fail('invalid_input'); end if;
  select * into w from public.wallet_types where kind = 'cash' for update;
  if w.id is null then perform app_private.fail('not_found'); end if;
  if w.opening_on is not null then perform app_private.fail('opening_already_set'); end if;
  perform app_private.set_action('set_cash_opening');
  update public.wallet_types set opening_balance = p_amount, opening_on = p_on, updated_at = now(), updated_by = auth.uid()
  where id = w.id;
end $function$
;
CREATE OR REPLACE FUNCTION app_private.accuracy_audit()
 RETURNS TABLE(check_name text, ok boolean, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  perform app_private.require_committee();
  return query
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
      -- 13b · income by the month it pays for: the months add up, and it reconciles with income by date
      select 'income by due month adds up and reconciles with income by date',
             (select sum((m ->> 'due_income')::bigint) = (y -> 'income_due' ->> 'total')::bigint
                     and (y -> 'income_due' ->> 'total')::bigint
                         = (y -> 'income' ->> 'total')::bigint - (y -> 'income_due' ->> 'fees_for_other_months')::bigint
                           + (y -> 'income_due' ->> 'fees_paid_outside')::bigint
              from (select app_private.report_period(make_date(extract(year from current_date)::int, 1, 1),
                                                     make_date(extract(year from current_date)::int, 12, 31)) y) q,
                   lateral jsonb_array_elements(q.y -> 'months') m
              group by q.y),
             (select format('due %s = by date %s − other months %s + paid outside %s', y -> 'income_due' ->> 'total',
                            y -> 'income' ->> 'total', y -> 'income_due' ->> 'fees_for_other_months',
                            y -> 'income_due' ->> 'fees_paid_outside')
              from (select app_private.report_period(make_date(extract(year from current_date)::int, 1, 1),
                                                     make_date(extract(year from current_date)::int, 12, 31)) y) q)
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
      union all
      -- 30 · wallets (m43): every account, wallet and cash balance together = all the association's money
      --      (opening + everything in − everything out + adjustments); a manual opening may differ (shown)
      select 'wallet balances + cash = opening + everything in − everything out + adjustments',
             (select coalesce(sum(w.balance), 0) from app_private.report_wallets(
                (select s.opening_balance_on from public.settings s), current_date + 1) w)
               = (select opening_balance from settings) + (select coalesce(sum(p.amount), 0) from conf p where p.method::text <> 'credit')
                 - (select v from exp_main) - (select v from exp_camp) + (select v from adjust)
             or exists (select 1 from public.fund_accounts f where f.opening_on is not null)
             or exists (select 1 from public.wallet_types w where w.opening_on is not null),
             format('wallets %s, recomputed %s%s',
                    (select coalesce(sum(w.balance), 0) from app_private.report_wallets(
                       (select s.opening_balance_on from public.settings s), current_date + 1) w),
                    (select opening_balance from settings) + (select coalesce(sum(p.amount), 0) from conf p where p.method::text <> 'credit')
                    - (select v from exp_main) - (select v from exp_camp) + (select v from adjust),
                    case when exists (select 1 from public.fund_accounts f where f.opening_on is not null)
                           or exists (select 1 from public.wallet_types w where w.opening_on is not null)
                         then ' (manual opening set: the difference is not checked)' else '' end)
      union all
      -- 31 · no wallet, account or cash below 0 (money taken out that was never recorded coming in)
      select 'no wallet balance below 0',
             not exists (select 1 from app_private.report_wallets((select s.opening_balance_on from public.settings s), current_date + 1) w
                         where w.balance < 0),
             format('%s below 0', (select count(*) from app_private.report_wallets(
                                     (select s.opening_balance_on from public.settings s), current_date + 1) w where w.balance < 0))
    )
    select c.check_name, c.ok, c.detail from checks c;
end $function$
;
