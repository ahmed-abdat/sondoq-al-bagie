-- ════════════════════════════════════════════════════════════════════════════════════════
-- Sondoq al-Baqie M1 · 3/5 · computed views (arrears and totals are never stored)
--
-- Pattern: each view is SECURITY INVOKER and reads a SECURITY DEFINER function in the
-- private schema. The function returns only safe columns, so the public (anon) can read the
-- view without any grant on the base tables. app_private is not exposed over the API.
--
-- A month is DUE when the member is 'active' that month and today is past the grace period
-- (month start + settings.grace_days; 10 days → due from the 11th). Exempt, away, left and
-- deceased months are never owed.
-- ════════════════════════════════════════════════════════════════════════════════════════

/* ───────────────────────── the month grid ───────────────────────── */

-- One row per member per month of each live period, up to December of the current year.
create function app_private.month_grid()
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
              then gp.monthly_amount else 0 end
  from months mo
  cross join cfg
  left join public.group_prices gp on gp.group_id = mo.group_id and gp.year = extract(year from mo.m)
  left join public.payment_months pm
    on pm.member_id = mo.member_id and pm.year = extract(year from mo.m) and pm.month = extract(month from mo.m)
   and pm.released_at is null;
$$;

-- Per member: current group/status, paid this year, months behind, amount owed.
create function app_private.member_rollup()
returns table (member_id uuid, number integer, full_name text, group_code text, member_status public.membership_status,
               months_paid_this_year integer, months_behind integer, amount_owed integer)
language sql stable security definer set search_path = '' as $$
  with g as (
    select mg.member_id,
           count(*) filter (where mg.paid and mg.year = extract(year from current_date))::integer as paid_y,
           count(*) filter (where mg.due)::integer as behind,
           coalesce(sum(mg.owed), 0)::integer as owed
    from app_private.month_grid() mg group by mg.member_id
  ),
  cur as (   -- the period covering this month, else the most recent one
    select distinct on (p.member_id) p.member_id, p.group_id, p.status
    from public.membership_periods p
    where p.cancelled_at is null and p.from_month <= current_date
    order by p.member_id, p.from_month desc
  )
  select m.id, m.number, m.full_name, gr.code, cur.status,
         coalesce(g.paid_y, 0), coalesce(g.behind, 0), coalesce(g.owed, 0)
  from public.members m
  left join cur on cur.member_id = m.id
  left join public.groups gr on gr.id = cur.group_id
  left join g on g.member_id = m.id;
$$;

/* ───────────────────────── public (anon) ───────────────────────── */

-- Name + status only; amount owed is null unless the committee turns settings.show_amount_owed ON.
create function app_private.public_member_status()
returns table (member_id uuid, number integer, full_name text, group_code text, member_status public.membership_status,
               months_paid_this_year integer, months_behind integer, status_label text, amount_owed integer)
language sql stable security definer set search_path = '' as $$
  select r.member_id, r.number, r.full_name, r.group_code, r.member_status,
         r.months_paid_this_year, r.months_behind,
         case when r.months_behind > 0 then 'متأخر' else 'منتظم' end,
         case when (select s.show_amount_owed from public.settings s) then r.amount_owed end
  from app_private.member_rollup() r;
$$;

-- Each member's months for the detail sheet: paid | late | upcoming | not_owed.
create function app_private.public_member_months()
returns table (member_id uuid, year integer, month integer, state text)
language sql stable security definer set search_path = '' as $$
  select mg.member_id, mg.year, mg.month,
         case when mg.paid then 'paid'
              when mg.status <> 'active' then 'not_owed'
              when mg.due then 'late'
              else 'upcoming' end
  from app_private.month_grid() mg;
$$;

-- Main fund = opening + confirmed money not given to a campaign − fund expenses + campaign transfers.
create function app_private.public_fund_summary()
returns table (opening_balance integer, money_in bigint, money_out bigint, transfers_in bigint, balance bigint,
               collected_this_year bigint, spent_this_year bigint, members_ok integer, members_behind integer,
               last_activity_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with fin as (
    select coalesce(sum(a.amount), 0) as total,
           coalesce(sum(a.amount) filter (where extract(year from p.paid_on) = extract(year from current_date)), 0) as this_year
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    where p.status = 'confirmed' and a.kind in ('months', 'credit')
  ),
  fout as (
    select coalesce(sum(e.amount), 0) as total,
           coalesce(sum(e.amount) filter (where extract(year from e.spent_on) = extract(year from current_date)), 0) as this_year
    from public.expenses e where e.cancelled_at is null and e.campaign_id is null
  ),
  tr as (select coalesce(sum(t.amount), 0) as total from public.transfers t),
  mem as (
    select count(*) filter (where r.months_behind = 0 and r.member_status = 'active')::integer as ok,
           count(*) filter (where r.months_behind > 0)::integer as behind
    from app_private.member_rollup() r
  )
  select s.opening_balance, fin.total, fout.total, tr.total,
         s.opening_balance + fin.total - fout.total + tr.total,
         fin.this_year, fout.this_year, mem.ok, mem.behind,
         greatest((select max(coalesce(p.cancelled_at, p.decided_at)) from public.payments p),
                  (select max(coalesce(e.cancelled_at, e.created_at)) from public.expenses e))
  from public.settings s, fin, fout, tr, mem;
$$;

-- Expected vs collected per month (expected counts active members only).
create function app_private.public_monthly_collection()
returns table (year integer, month integer, expected bigint, collected bigint)
language sql stable security definer set search_path = '' as $$
  select mg.year, mg.month,
         coalesce(sum(mg.price) filter (where mg.status = 'active'), 0),
         coalesce(sum(mg.price) filter (where mg.paid), 0)
  from app_private.month_grid() mg
  group by mg.year, mg.month;
$$;

create function app_private.public_expense_totals()
returns table (year integer, category public.expense_category, total bigint)
language sql stable security definer set search_path = '' as $$
  select extract(year from e.spent_on)::integer, e.category, sum(e.amount)
  from public.expenses e where e.cancelled_at is null
  group by 1, 2;
$$;

create function app_private.public_recent_expenses()
returns table (id uuid, spent_on date, category public.expense_category, amount integer, note text, campaign_id uuid)
language sql stable security definer set search_path = '' as $$
  select e.id, e.spent_on, e.category, e.amount, e.note, e.campaign_id
  from public.expenses e where e.cancelled_at is null
  order by e.spent_on desc, e.created_at desc limit 50;
$$;

-- Campaign pot = confirmed contributions − its expenses − transfers to the fund.
create function app_private.public_campaign_progress()
returns table (campaign_id uuid, title text, purpose text, target_amount integer, deadline date,
               status public.campaign_status, amount_mode public.campaign_mode, collected bigint, spent bigint,
               transferred bigint, balance bigint, participants integer, participants_paid integer)
language sql stable security definer set search_path = '' as $$
  with contrib as (
    select a.campaign_id, a.member_id, sum(a.amount) as amount
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    where p.status = 'confirmed' and a.kind = 'campaign'
    group by a.campaign_id, a.member_id
  )
  select c.id, c.title, c.purpose, c.target_amount, c.deadline, c.status, c.amount_mode,
         coalesce((select sum(x.amount) from contrib x where x.campaign_id = c.id), 0),
         coalesce((select sum(e.amount) from public.expenses e where e.campaign_id = c.id and e.cancelled_at is null), 0),
         coalesce((select sum(t.amount) from public.transfers t where t.from_campaign_id = c.id), 0),
         coalesce((select sum(x.amount) from contrib x where x.campaign_id = c.id), 0)
           - coalesce((select sum(e.amount) from public.expenses e where e.campaign_id = c.id and e.cancelled_at is null), 0)
           - coalesce((select sum(t.amount) from public.transfers t where t.from_campaign_id = c.id), 0),
         (select count(*) from public.campaign_participants cp where cp.campaign_id = c.id)::integer,
         (select count(*) from public.campaign_participants cp
          join contrib x on x.campaign_id = cp.campaign_id and x.member_id = cp.member_id
          where cp.campaign_id = c.id and x.amount >= coalesce(cp.expected_amount, 1))::integer
  from public.campaigns c;
$$;

-- Recent events for the trust feed. No amounts per payment, no payer names, no proofs.
create function app_private.public_activity_feed()
returns table (at timestamptz, kind text, member_names text, months integer, amount integer, category public.expense_category)
language sql stable security definer set search_path = '' as $$
  (select p.decided_at, 'payment_confirmed',
          (select string_agg(distinct m.full_name, '، ') from public.payment_allocations a
           join public.members m on m.id = a.member_id where a.payment_id = p.id),
          (select count(*) from public.payment_allocations a where a.payment_id = p.id and a.kind = 'months')::integer,
          null::integer, null::public.expense_category
   from public.payments p
   where p.status in ('confirmed', 'cancelled') and p.decided_at is not null and p.method <> 'paper'
   order by p.decided_at desc limit 30)
  union all
  (select e.created_at, 'expense', null, null, e.amount, e.category
   from public.expenses e where e.cancelled_at is null order by e.created_at desc limit 20)
  union all
  (select c.created_at, 'campaign_opened', null, null, c.target_amount, null
   from public.campaigns c order by c.created_at desc limit 10)
  order by 1 desc limit 50;
$$;

/* ───────────────────────── committee (reads phones through RLS) ───────────────────────── */

create function app_private.member_owed_months()
returns table (member_id uuid, months text[], months_count integer, amount_owed integer)
language sql stable security definer set search_path = '' as $$
  select mg.member_id,
         array_agg(format('%s-%s', mg.year, lpad(mg.month::text, 2, '0')) order by mg.year, mg.month),
         count(*)::integer, sum(mg.owed)::integer
  from app_private.month_grid() mg where mg.due
  group by mg.member_id;
$$;

create function app_private.member_credit()
returns table (member_id uuid, credit bigint)
language sql stable security definer set search_path = '' as $$
  select a.member_id, sum(a.amount)
  from public.payment_allocations a join public.payments p on p.id = a.payment_id
  where p.status = 'confirmed' and a.kind = 'credit'
  group by a.member_id;
$$;

/* ───────────────────────── the views ───────────────────────── */

create view public.member_status with (security_invoker = true) as
  select * from app_private.public_member_status();
create view public.member_months with (security_invoker = true) as
  select * from app_private.public_member_months();
create view public.fund_summary with (security_invoker = true) as
  select * from app_private.public_fund_summary();
create view public.monthly_collection with (security_invoker = true) as
  select * from app_private.public_monthly_collection();
create view public.expense_totals with (security_invoker = true) as
  select * from app_private.public_expense_totals();
create view public.recent_expenses with (security_invoker = true) as
  select * from app_private.public_recent_expenses();
create view public.campaign_progress with (security_invoker = true) as
  select * from app_private.public_campaign_progress();
create view public.activity_feed with (security_invoker = true) as
  select * from app_private.public_activity_feed();

-- Committee: who is behind, with phone for the WhatsApp reminder. Reading members.phone
-- goes through RLS, so only an active committee account gets rows.
create view public.arrears with (security_invoker = true) as
  select m.id as member_id, m.number, m.full_name, m.phone, r.group_code, r.member_status,
         o.months, o.months_count, o.amount_owed, coalesce(cr.credit, 0) as credit,
         (select max(rm.sent_at) from public.reminders rm where rm.member_id = m.id) as last_reminded_at
  from public.members m
  join app_private.member_owed_months() o on o.member_id = m.id
  join app_private.member_rollup() r on r.member_id = m.id
  left join app_private.member_credit() cr on cr.member_id = m.id;
