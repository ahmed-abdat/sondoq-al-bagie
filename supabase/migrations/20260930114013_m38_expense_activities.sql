-- ════════════════════════════════════════════════════════════════════════════════════════
-- M38 · expense activities («الأنشطة», owner 2026-09-30): the fixed expense categories become a list
-- the «مسؤول» manages (add, rename, retire / bring back). Committee reads it; every change is audited.
-- - expense_activities (name, sort_order, active); the 4 old categories are its first rows
--   (legacy_category), named by the owner.
-- - expenses.activity_id (required). The old `category` column stays as a mirror (the activity's old
--   category, «أخرى» for new activities) so older views keep working; b_activity fills both.
-- - record_expense takes p_activity_id (the old p_category still works until the app switches);
--   a retired activity takes no new expenses (activity_retired).
-- - report_period spending carries by_activity [{activity_id, name, amount}] next to by_category.
-- Bodies of report_period / record_expense = pg_get_functiondef at m37, changed where marked.
-- Undo: supabase/rollback/m38_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

create table public.expense_activities (
  id              smallint generated always as identity primary key,
  name            text not null check (btrim(name) <> '' and length(name) <= 60),
  sort_order      smallint not null default 0,
  active          boolean not null default true,
  legacy_category public.expense_category unique,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id),
  updated_at      timestamptz,
  updated_by      uuid references auth.users (id)
);
create unique index expense_activities_name_key on public.expense_activities (btrim(name));
create index expense_activities_created_by_idx on public.expense_activities (created_by);
create index expense_activities_updated_by_idx on public.expense_activities (updated_by);
create trigger a_guard before update or delete on public.expense_activities for each row execute function
  app_private.tg_append_only('', 'name,sort_order,active,updated_at,updated_by');
create trigger zz_no_truncate before truncate on public.expense_activities for each statement
  execute function app_private.tg_no_truncate();
create trigger zz_audit after insert or update on public.expense_activities for each row
  execute function app_private.tg_audit();
alter table public.expense_activities enable row level security;
revoke all on public.expense_activities from public, anon, authenticated;
grant select on public.expense_activities to authenticated;
grant all on public.expense_activities to service_role;
create policy committee_read on public.expense_activities for select to authenticated
  using ((select app_private.is_committee()));

insert into public.expense_activities (name, sort_order, legacy_category) values
  ('التدريس المحوري', 1, 'teaching'),
  ('تكريم الناجحين', 2, 'honoring'),
  ('الفريق الرياضي', 3, 'sports'),
  ('أخرى', 99, 'other');

-- an account that added or changed an activity has history (it cannot be deleted, only deactivated)
CREATE OR REPLACE FUNCTION app_private.account_has_history(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.payments where p_user in (created_by, decided_by, cancelled_by))
      or exists (select 1 from public.expenses where p_user in (created_by, cancelled_by))
      or exists (select 1 from public.campaigns where p_user in (created_by, closed_by))
      or exists (select 1 from public.transfers where created_by = p_user)
      or exists (select 1 from public.reminders where sent_by = p_user)
      or exists (select 1 from public.members where created_by = p_user)
      or exists (select 1 from public.membership_periods where p_user in (created_by, cancelled_by))
      or exists (select 1 from public.fund_accounts where p_user in (created_by, updated_by))
      or exists (select 1 from public.expense_activities where p_user in (created_by, updated_by))
      or exists (select 1 from public.settings where updated_by = p_user)
      or exists (select 1 from public.terms where created_by = p_user)
      or exists (select 1 from public.handovers where p_user in (started_by, submitted_by, accepted_by, cancelled_by))
      or exists (select 1 from public.balance_adjustments where created_by = p_user)
      or exists (select 1 from public.member_links where p_user in (created_by, revoked_by))
      or exists (select 1 from public.campaign_participants where exempted_by = p_user)
      or exists (select 1 from public.audit_log where actor = p_user);
$function$
;

/* ───────────────────────── expenses.activity_id ───────────────────────── */

alter table public.expenses add column activity_id smallint references public.expense_activities (id);
-- existing rows (0 on production at 2026-09-30): their activity is the one of their category
alter table public.expenses disable trigger a_guard;
update public.expenses e set activity_id = a.id
from public.expense_activities a where a.legacy_category = e.category and e.activity_id is null;
alter table public.expenses enable trigger a_guard;
alter table public.expenses alter column activity_id set not null;
create index expenses_activity_idx on public.expenses (activity_id);

-- a new expense: the activity from the old category when only that is given; the category mirror
-- from the activity; a retired activity takes no new expense
create function app_private.tg_expense_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a public.expense_activities;
begin
  if new.activity_id is null then
    select * into a from public.expense_activities where legacy_category = new.category;
  else
    select * into a from public.expense_activities where id = new.activity_id;
  end if;
  if a.id is null then perform app_private.fail('not_found'); end if;
  if not a.active then perform app_private.fail('activity_retired'); end if;
  new.activity_id := a.id;
  new.category := coalesce(a.legacy_category, 'other');
  return new;
end $$;
revoke all on function app_private.tg_expense_activity() from public, anon, authenticated;
create trigger b_activity before insert on public.expenses for each row execute function app_private.tg_expense_activity();

/* ───────────────────────── record_expense: p_activity_id ───────────────────────── */

drop function public.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean);
drop function app_private.record_expense(uuid, date, public.expense_category, integer, text, uuid, text, uuid, boolean);
CREATE OR REPLACE FUNCTION app_private.record_expense(p_id uuid, p_spent_on date, p_amount integer, p_activity_id integer DEFAULT NULL::integer, p_category public.expense_category DEFAULT NULL::public.expense_category, p_note text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_receipt_path text DEFAULT NULL::text, p_fund_account_id uuid DEFAULT NULL::uuid, p_paid_in_cash boolean DEFAULT false) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform app_private.require_committee();
  if exists (select 1 from public.expenses where id = p_id) then return p_id; end if;
  if p_spent_on > current_date + 1 then perform app_private.fail('future_date'); end if;
  if p_activity_id is null and p_category is null then perform app_private.fail('invalid_input'); end if;
  if p_campaign_id is not null
     and exists (select 1 from public.campaigns c where c.id = p_campaign_id and c.status = 'closed' for share) then
    perform app_private.fail('campaign_closed');
  end if;
  if coalesce(p_paid_in_cash, false) and p_fund_account_id is not null then perform app_private.fail('invalid_input'); end if;
  if p_fund_account_id is not null and not exists (select 1 from public.fund_accounts f where f.id = p_fund_account_id) then
    perform app_private.fail('not_found');
  end if;
  perform app_private.set_action('record_expense');
  -- activity_id (or, until the app switches, the old category mapped to its activity): b_activity fills both
  insert into public.expenses (id, spent_on, category, activity_id, campaign_id, amount, note, receipt_path, created_by,
                               fund_account_id, paid_in_cash)
  values (p_id, p_spent_on, p_category, p_activity_id, p_campaign_id, p_amount, p_note, p_receipt_path, auth.uid(),
          p_fund_account_id, coalesce(p_paid_in_cash, false));
  return p_id;
end $function$
;
create function public.record_expense(
  p_id uuid, p_spent_on date, p_amount integer, p_activity_id integer default null,
  p_category public.expense_category default null, p_note text default null, p_campaign_id uuid default null,
  p_receipt_path text default null, p_fund_account_id uuid default null, p_paid_in_cash boolean default false
) returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.record_expense(p_id => p_id, p_spent_on => p_spent_on, p_amount => p_amount,
                                    p_activity_id => p_activity_id, p_category => p_category, p_note => p_note,
                                    p_campaign_id => p_campaign_id, p_receipt_path => p_receipt_path,
                                    p_fund_account_id => p_fund_account_id, p_paid_in_cash => p_paid_in_cash)
$$;

/* ───────────────────────── «مسؤول»: manage the list ───────────────────────── */

-- A new activity, last in the list. Returns its id.
create function app_private.add_expense_activity(p_name text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  aid integer;
begin
  perform app_private.require_admin();
  if btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) > 60 then perform app_private.fail('invalid_input'); end if;
  if exists (select 1 from public.expense_activities where btrim(name) = btrim(p_name)) then
    perform app_private.fail('activity_name_taken');
  end if;
  perform app_private.set_action('add_expense_activity');
  insert into public.expense_activities (name, sort_order, created_by)
  values (btrim(p_name),
          coalesce((select max(sort_order) from public.expense_activities where legacy_category is distinct from 'other'), 0) + 1,
          auth.uid())
  returning id into aid;
  return aid;
end $$;

-- Rename (past expenses show the new name: it is the same activity).
create function app_private.rename_expense_activity(p_id integer, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) > 60 then perform app_private.fail('invalid_input'); end if;
  if not exists (select 1 from public.expense_activities where id = p_id) then perform app_private.fail('not_found'); end if;
  if exists (select 1 from public.expense_activities where btrim(name) = btrim(p_name) and id <> p_id) then
    perform app_private.fail('activity_name_taken');
  end if;
  perform app_private.set_action('rename_expense_activity');
  update public.expense_activities set name = btrim(p_name), updated_at = now(), updated_by = auth.uid() where id = p_id;
end $$;

-- Retire (false) or bring back (true). A retired activity keeps its past expenses and reports.
create function app_private.set_expense_activity_active(p_id integer, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if p_active is null then perform app_private.fail('invalid_input'); end if;
  if not exists (select 1 from public.expense_activities where id = p_id) then perform app_private.fail('not_found'); end if;
  if not p_active and not exists (select 1 from public.expense_activities where active and id <> p_id) then
    perform app_private.fail('last_activity');
  end if;
  perform app_private.set_action(case when p_active then 'restore_expense_activity' else 'retire_expense_activity' end);
  update public.expense_activities set active = p_active, updated_at = now(), updated_by = auth.uid() where id = p_id;
end $$;

create function public.add_expense_activity(p_name text) returns integer
language sql security invoker set search_path = '' as $$
  select app_private.add_expense_activity(p_name => p_name)
$$;
create function public.rename_expense_activity(p_id integer, p_name text) returns void
language sql security invoker set search_path = '' as $$
  select app_private.rename_expense_activity(p_id => p_id, p_name => p_name)
$$;
create function public.set_expense_activity_active(p_id integer, p_active boolean) returns void
language sql security invoker set search_path = '' as $$
  select app_private.set_expense_activity_active(p_id => p_id, p_active => p_active)
$$;

/* ───────────────────────── reports: spending by activity ───────────────────────── */

CREATE OR REPLACE FUNCTION app_private.report_period(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  opening_base bigint := (select s.opening_balance from public.settings s);
  before_in bigint;
  before_out bigint;
  before_adj bigint;
  r jsonb;
begin
  perform app_private.require_committee();
  if p_from is null or p_to is null or p_to < p_from then perform app_private.fail('invalid_input'); end if;

  -- all money in: fees + levy shares + donations (confirmed; credit use is not new money)
  select coalesce(sum(a.amount), 0) into before_in
  from public.payment_allocations a join public.payments p on p.id = a.payment_id
  where p.status = 'confirmed' and p.method::text <> 'credit' and p.paid_on < p_from;
  select coalesce(sum(e.amount), 0) into before_out
  from public.expenses e where e.cancelled_at is null and e.spent_on < p_from;
  select coalesce(sum(b.amount), 0) into before_adj
  from public.balance_adjustments b where b.created_at::date < p_from;

  with pin as (
    select p.paid_on, a.amount,
           case when a.kind in ('months', 'credit') then 'fees'
                when c.kind = 'levy' then 'levies' else 'donations' end as source
    from public.payment_allocations a join public.payments p on p.id = a.payment_id
    left join public.campaigns c on c.id = a.campaign_id
    where p.status = 'confirmed' and p.method::text <> 'credit' and p.paid_on between p_from and p_to
  ),
  pout as (
    select e.spent_on, e.category, e.activity_id, e.amount, e.campaign_id
    from public.expenses e where e.cancelled_at is null and e.spent_on between p_from and p_to
  ),
  padj as (select coalesce(sum(b.amount), 0) as total from public.balance_adjustments b
           where b.created_at::date between p_from and p_to),
  months as (
    select date_trunc('month', gs)::date as m
    from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') gs
  ),
  -- campaign money still held at p_to (collected − spent − moved to the fund)
  camp as (
    select coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id = a.payment_id
                     where a.kind = 'campaign' and p.status = 'confirmed' and p.paid_on <= p_to), 0)
         - coalesce((select sum(e.amount) from public.expenses e
                     where e.campaign_id is not null and e.cancelled_at is null and e.spent_on <= p_to), 0)
         - coalesce((select sum(t.amount) from public.transfers t where t.created_at::date <= p_to), 0) as held
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'opening', opening_base + before_in - before_out + before_adj,
    'income', jsonb_build_object(
      'fees', coalesce((select sum(amount) from pin where source = 'fees'), 0),
      'levies', coalesce((select sum(amount) from pin where source = 'levies'), 0),
      'donations', coalesce((select sum(amount) from pin where source = 'donations'), 0),
      'total', coalesce((select sum(amount) from pin), 0)),
    'spending', jsonb_build_object(
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('category', x.category, 'amount', x.amount) order by x.amount desc, x.category)
                               from (select category, sum(amount) as amount from pout group by category) x), '[]'::jsonb),
      'by_activity', coalesce((select jsonb_agg(jsonb_build_object('activity_id', x.activity_id, 'name', a.name, 'amount', x.amount)
                                                order by x.amount desc, a.sort_order, a.id)
                               from (select activity_id, sum(amount) as amount from pout group by activity_id) x
                               join public.expense_activities a on a.id = x.activity_id), '[]'::jsonb),
      'from_campaigns', coalesce((select sum(amount) from pout where campaign_id is not null), 0),
      'total', coalesce((select sum(amount) from pout), 0)),
    'adjustments', (select total from padj),
    'closing', opening_base + before_in - before_out + before_adj
               + coalesce((select sum(amount) from pin), 0) - coalesce((select sum(amount) from pout), 0) + (select total from padj),
    'campaigns_held', (select held from camp),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'year', extract(year from mo.m)::int, 'month', extract(month from mo.m)::int,
               'income', coalesce((select sum(amount) from pin where date_trunc('month', pin.paid_on) = mo.m), 0),
               'spending', coalesce((select sum(amount) from pout where date_trunc('month', pout.spent_on) = mo.m), 0))
             order by mo.m)
      from months mo), '[]'::jsonb))
  into r;
  return r;
end $function$
;

revoke all on function
  app_private.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean),
  public.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean),
  app_private.add_expense_activity(text), public.add_expense_activity(text),
  app_private.rename_expense_activity(integer, text), public.rename_expense_activity(integer, text),
  app_private.set_expense_activity_active(integer, boolean), public.set_expense_activity_active(integer, boolean)
from public, anon, authenticated;
grant execute on function
  app_private.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean),
  public.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean),
  app_private.add_expense_activity(text), public.add_expense_activity(text),
  app_private.rename_expense_activity(integer, text), public.rename_expense_activity(integer, text),
  app_private.set_expense_activity_active(integer, boolean), public.set_expense_activity_active(integer, boolean)
to authenticated, service_role;
