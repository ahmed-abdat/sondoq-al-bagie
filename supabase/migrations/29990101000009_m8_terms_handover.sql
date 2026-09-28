-- ════════════════════════════════════════════════════════════════════════════════════════
-- M8 · committee terms («الدورة») and handover («تسليم الصندوق»).
--
-- The calendar year still drives monthly fees (group_prices per year, arrears carry over). A
-- term is the committee's mandate: exactly one is open. At the end of a term the outgoing
-- treasurer/admin counts the money actually held (cash + each wallet) and submits a handover;
-- a DIFFERENT admin (the incoming one) accepts it. Acceptance closes the term, opens the next
-- one with the counted money as its opening balance, records any difference as a balance
-- adjustment («فرق عند التسليم») so the public balance equals the counted money, and
-- deactivates committee accounts that were not carried over. Nothing is deleted; all audited.
-- ════════════════════════════════════════════════════════════════════════════════════════

create type public.handover_status as enum ('draft', 'submitted', 'confirmed', 'cancelled');

create table public.terms (
  number          smallint primary key check (number > 0),   -- الدورة 1, 2, …
  title           text,
  started_on      date not null,
  ended_on        date check (ended_on >= started_on),
  opening_balance integer not null,                         -- MRO held when the term started
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id)
);
create unique index terms_one_open on public.terms ((true)) where ended_on is null;
create index terms_created_by_idx on public.terms (created_by);

create table public.handovers (
  id               uuid primary key default gen_random_uuid(),
  from_term        smallint not null references public.terms (number),
  to_term          smallint references public.terms (number),
  status           public.handover_status not null default 'draft',
  -- [{"label": "نقداً", "method": "cash", "account_id": null, "amount": 120000}, …] in MRO
  counted_lines    jsonb not null default '[]'::jsonb check (jsonb_typeof(counted_lines) = 'array'),
  counted_balance  integer,
  computed_balance integer,        -- app balance: at submit (preview), final at acceptance
  difference       integer,        -- counted − computed at acceptance
  carry_over       uuid[] not null default '{}',   -- committee accounts that stay active
  note             text,
  started_at       timestamptz not null default now(),
  started_by       uuid references auth.users (id),
  submitted_at     timestamptz,
  submitted_by     uuid references auth.users (id),
  accepted_at      timestamptz,
  accepted_by      uuid references auth.users (id),
  cancelled_at     timestamptz,
  cancelled_by     uuid references auth.users (id),
  cancel_reason    text,
  constraint handovers_cancel_reason check (status <> 'cancelled' or btrim(coalesce(cancel_reason, '')) <> '')
);
create unique index handovers_one_active on public.handovers ((true)) where status in ('draft', 'submitted');
create index handovers_from_term_idx on public.handovers (from_term);
create index handovers_to_term_idx on public.handovers (to_term);
create index handovers_started_by_idx on public.handovers (started_by);
create index handovers_submitted_by_idx on public.handovers (submitted_by);
create index handovers_accepted_by_idx on public.handovers (accepted_by);
create index handovers_cancelled_by_idx on public.handovers (cancelled_by);

-- Signed corrections of the fund balance (today only from handovers).
create table public.balance_adjustments (
  id          uuid primary key default gen_random_uuid(),
  term        smallint not null references public.terms (number),
  handover_id uuid references public.handovers (id),
  amount      integer not null check (amount <> 0),
  reason      text not null check (btrim(reason) <> ''),
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id)
);
create index balance_adjustments_term_idx on public.balance_adjustments (term);
create index balance_adjustments_handover_idx on public.balance_adjustments (handover_id);
create index balance_adjustments_created_by_idx on public.balance_adjustments (created_by);

create trigger a_guard before update or delete on public.terms for each row execute function
  app_private.tg_append_only('ended_on', 'title,opening_balance,started_on');
create trigger a_guard before update or delete on public.handovers for each row execute function
  app_private.tg_append_only('submitted_at,submitted_by,accepted_at,accepted_by,cancelled_at,cancelled_by,cancel_reason,to_term,difference',
                             'status,counted_lines,counted_balance,computed_balance,carry_over,note');
create trigger a_guard before update or delete on public.balance_adjustments for each row execute function
  app_private.tg_append_only('', '');

do $$
declare t text;
begin
  foreach t in array array['terms', 'handovers', 'balance_adjustments'] loop
    execute format('create trigger zz_no_truncate before truncate on public.%I for each statement execute function app_private.tg_no_truncate()', t);
    execute format('create trigger zz_audit after insert or update on public.%I for each row execute function app_private.tg_audit()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy committee_read on public.%I for select to authenticated using ((select app_private.is_committee()))', t);
  end loop;
end $$;

-- Term 1: the current committee, from the start of the records, with the settings' opening balance.
insert into public.terms (number, title, started_on, opening_balance)
select 1, 'الدورة 1', coalesce(s.opening_balance_on, date '2026-01-01'), s.opening_balance from public.settings s;

/* ───────────────────────── balance with adjustments; current term ───────────────────────── */

drop view public.fund_summary;
drop function app_private.public_fund_summary();

create function app_private.public_fund_summary()
returns table (opening_balance integer, money_in bigint, money_out bigint, transfers_in bigint, balance bigint,
               collected_this_year bigint, spent_this_year bigint, members_ok integer, members_behind integer,
               last_activity_at timestamptz, members_active integer, adjustments bigint,
               term_number smallint, term_started_on date)
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
  adj as (select coalesce(sum(b.amount), 0) as total from public.balance_adjustments b),
  mem as (
    select count(*) filter (where r.member_status = 'active' and r.months_behind = 0)::integer as ok,
           count(*) filter (where r.member_status = 'active' and r.months_behind > 0)::integer as behind,
           count(*) filter (where r.member_status = 'active')::integer as active
    from app_private.member_rollup() r
  ),
  cur as (select t.number, t.started_on from public.terms t where t.ended_on is null)
  select s.opening_balance, fin.total, fout.total, tr.total,
         s.opening_balance + fin.total - fout.total + tr.total + adj.total,
         fin.this_year, fout.this_year, mem.ok, mem.behind,
         greatest((select max(coalesce(p.cancelled_at, p.decided_at)) from public.payments p),
                  (select max(coalesce(e.cancelled_at, e.created_at)) from public.expenses e),
                  (select max(b.created_at) from public.balance_adjustments b)),
         mem.active, adj.total, cur.number, cur.started_on
  from public.settings s cross join fin cross join fout cross join tr cross join adj cross join mem
  left join cur on true;
$$;

create view public.fund_summary with (security_invoker = true) as
  select * from app_private.public_fund_summary();

-- Past and current terms, no personal data. Money is counted by date inside the term.
create function app_private.public_terms()
returns table (number smallint, title text, started_on date, ended_on date, opening_balance integer,
               closing_balance integer, collected bigint, spent bigint, adjustment bigint)
language sql stable security definer set search_path = '' as $$
  select t.number, t.title, t.started_on, t.ended_on,
         case when t.number = 1 then (select s.opening_balance from public.settings s) else t.opening_balance end,
         (select h.counted_balance from public.handovers h where h.from_term = t.number and h.status = 'confirmed'),
         (select coalesce(sum(a.amount), 0) from public.payment_allocations a join public.payments p on p.id = a.payment_id
          where p.status = 'confirmed' and a.kind in ('months', 'credit')
            and p.paid_on >= t.started_on and (t.ended_on is null or p.paid_on < t.ended_on)),
         (select coalesce(sum(e.amount), 0) from public.expenses e
          where e.cancelled_at is null and e.campaign_id is null
            and e.spent_on >= t.started_on and (t.ended_on is null or e.spent_on < t.ended_on)),
         (select coalesce(sum(b.amount), 0) from public.balance_adjustments b where b.term = t.number)
  from public.terms t
  order by t.number;
$$;
create view public.terms_public with (security_invoker = true) as
  select * from app_private.public_terms();

-- The difference recorded at a handover shows in the public activity («فرق عند التسليم»); amount is signed.
create or replace function app_private.public_activity_feed()
returns table (at timestamptz, kind text, member_names text, months integer, amount integer,
               category public.expense_category, payment_id uuid, method public.payment_method, receipt_code text)
language sql stable security definer set search_path = '' as $$
  (select p.decided_at, 'payment_confirmed',
          (select string_agg(distinct m.full_name, '، ') from public.payment_allocations a
           join public.members m on m.id = a.member_id where a.payment_id = p.id),
          (select count(*) from public.payment_allocations a where a.payment_id = p.id and a.kind = 'months')::integer,
          p.amount, null::public.expense_category, p.id, p.method, p.receipt_code
   from public.payments p
   where p.status = 'confirmed' and p.decided_at is not null and p.method <> 'paper'
   order by p.decided_at desc limit 30)
  union all
  (select e.created_at, 'expense', null, null, e.amount, e.category, null, null, null
   from public.expenses e where e.cancelled_at is null order by e.created_at desc limit 20)
  union all
  (select c.created_at, 'campaign_opened', null, null, c.target_amount, null, null, null, null
   from public.campaigns c order by c.created_at desc limit 10)
  union all
  (select b.created_at, 'balance_adjustment', null, null, b.amount, null, null, null, null
   from public.balance_adjustments b order by b.created_at desc limit 10)
  order by 1 desc limit 50;
$$;

/* ───────────────────────── RPCs ───────────────────────── */

create function app_private.current_balance() returns integer
language sql stable security definer set search_path = '' as $$
  select balance::integer from app_private.public_fund_summary();
$$;

create function app_private.require_money_keeper() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not (app_private.is_admin() or app_private.can_confirm()) then perform app_private.fail('not_allowed'); end if;
end $$;

-- Lines: [{"label": text, "method": payment_method|null, "account_id": uuid|null, "amount": integer ≥ 0}]
create function app_private.lines_total(p_lines jsonb) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  total integer := 0;
  l jsonb;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' then perform app_private.fail('invalid_input'); end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    if btrim(coalesce(l ->> 'label', '')) = '' or jsonb_typeof(l -> 'amount') <> 'number'
       or (l ->> 'amount')::numeric <> floor((l ->> 'amount')::numeric) or (l ->> 'amount')::numeric < 0 then
      perform app_private.fail('invalid_input');
    end if;
    total := total + (l ->> 'amount')::integer;
  end loop;
  return total;
end $$;

-- Outgoing admin/treasurer opens a draft for the current term. Retries replay on p_id.
create function public.start_handover(p_id uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cur smallint;
begin
  perform app_private.require_money_keeper();
  if exists (select 1 from public.handovers where id = p_id) then return p_id; end if;
  if exists (select 1 from public.handovers where status in ('draft', 'submitted')) then
    perform app_private.fail('handover_in_progress');
  end if;
  select number into cur from public.terms where ended_on is null;
  if cur is null then perform app_private.fail('no_open_term'); end if;
  perform app_private.set_action('start_handover');
  insert into public.handovers (id, from_term, note, started_by, computed_balance)
  values (p_id, cur, nullif(btrim(p_note), ''), auth.uid(), app_private.current_balance());
  return p_id;
end $$;

create function public.update_handover_draft(
  p_id uuid, p_counted_lines jsonb, p_carry_over uuid[] default '{}', p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h public.handovers;
begin
  perform app_private.require_money_keeper();
  select * into h from public.handovers where id = p_id for update;
  if h.id is null then perform app_private.fail('not_found'); end if;
  if h.status <> 'draft' then perform app_private.fail('handover_not_draft'); end if;
  if exists (select 1 from unnest(coalesce(p_carry_over, '{}')) u(uid)
             where not exists (select 1 from public.committee c where c.user_id = u.uid)) then
    perform app_private.fail('not_committee_member');
  end if;
  perform app_private.set_action('update_handover_draft');
  update public.handovers
  set counted_lines = p_counted_lines, counted_balance = app_private.lines_total(p_counted_lines),
      carry_over = coalesce(p_carry_over, '{}'), note = nullif(btrim(p_note), ''),
      computed_balance = app_private.current_balance()
  where id = p_id;
end $$;

-- Draft → submitted: the outgoing side is done; waits for the incoming admin.
create function public.submit_handover(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h public.handovers;
begin
  perform app_private.require_money_keeper();
  select * into h from public.handovers where id = p_id for update;
  if h.id is null then perform app_private.fail('not_found'); end if;
  if h.status = 'submitted' then return; end if;
  if h.status <> 'draft' then perform app_private.fail('handover_not_draft'); end if;
  if jsonb_array_length(h.counted_lines) = 0 or h.counted_balance is null then
    perform app_private.fail('counted_required');
  end if;
  perform app_private.set_action('submit_handover');
  update public.handovers
  set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(),
      computed_balance = app_private.current_balance()
  where id = p_id;
end $$;

-- Incoming admin accepts: must be an admin who neither started nor submitted it. Returns the new
-- term number. The acceptor always stays active; other accounts stay only if carried over.
create function public.accept_handover(p_id uuid, p_new_term_title text default null) returns smallint
language plpgsql security definer set search_path = '' as $$
declare
  h public.handovers;
  cur public.terms;
  me uuid := auth.uid();
  computed integer;
  next_no smallint;
begin
  perform app_private.require_admin();
  select * into h from public.handovers where id = p_id for update;
  if h.id is null then perform app_private.fail('not_found'); end if;
  if h.status = 'confirmed' then return h.to_term; end if;
  if h.status <> 'submitted' then perform app_private.fail('handover_not_submitted'); end if;
  if not app_private.is_server() and me in (h.started_by, h.submitted_by) then
    perform app_private.fail('same_person', 'the handover must be accepted by another admin (the incoming one)');
  end if;
  select * into cur from public.terms where number = h.from_term for update;
  if cur.ended_on is not null then perform app_private.fail('no_open_term'); end if;

  perform app_private.set_action('accept_handover');
  computed := app_private.current_balance();
  next_no := cur.number + 1;
  update public.terms set ended_on = current_date where number = cur.number;
  insert into public.terms (number, title, started_on, opening_balance, created_by)
  values (next_no, coalesce(nullif(btrim(p_new_term_title), ''), 'الدورة ' || next_no), current_date,
          h.counted_balance, me);
  if h.counted_balance <> computed then
    insert into public.balance_adjustments (term, handover_id, amount, reason, created_by)
    values (cur.number, h.id, h.counted_balance - computed, 'فرق عند التسليم', me);
  end if;
  update public.handovers
  set status = 'confirmed', accepted_at = now(), accepted_by = me, to_term = next_no,
      computed_balance = computed, difference = h.counted_balance - computed
  where id = p_id;
  update public.committee set active = false
  where active and not (user_id = any (array_remove(h.carry_over || me, null)));
  return next_no;
end $$;

create function public.cancel_handover(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  h public.handovers;
begin
  perform app_private.require_money_keeper();
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  select * into h from public.handovers where id = p_id for update;
  if h.id is null then perform app_private.fail('not_found'); end if;
  if h.status = 'cancelled' then return; end if;
  if h.status = 'confirmed' then perform app_private.fail('handover_confirmed'); end if;
  perform app_private.set_action('cancel_handover');
  update public.handovers
  set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where id = p_id;
end $$;

-- Term 1's opening balance follows the settings' opening balance (entered once by the admin).
create or replace function public.update_settings(
  p_opening_balance integer default null, p_opening_balance_on date default null,
  p_grace_days integer default null, p_show_amount_owed boolean default null,
  p_whatsapp_contact text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  perform app_private.set_action('update_settings');
  update public.settings set
    opening_balance    = coalesce(p_opening_balance, opening_balance),
    opening_balance_on = coalesce(p_opening_balance_on, opening_balance_on),
    grace_days         = coalesce(p_grace_days, grace_days),
    show_amount_owed   = coalesce(p_show_amount_owed, show_amount_owed),
    whatsapp_contact   = case when p_whatsapp_contact is null then whatsapp_contact
                              else nullif(regexp_replace(p_whatsapp_contact, '[\s-]', '', 'g'), '') end,
    updated_at = now(), updated_by = auth.uid()
  where id;   -- the singleton row (PostgREST sessions load pg_safeupdate: no UPDATE without WHERE)
  if p_opening_balance is not null or p_opening_balance_on is not null then
    update public.terms t
    set opening_balance = s.opening_balance, started_on = s.opening_balance_on
    from public.settings s
    where t.number = 1 and s.id;
  end if;
end $$;

/* ───────────────────────── committee view of handovers ───────────────────────── */

create view public.handovers_admin with (security_invoker = true) as
  select h.id, h.from_term, h.to_term, h.status, h.counted_lines, h.counted_balance, h.computed_balance,
         h.difference, h.carry_over, h.note,
         h.started_at, sc.display_name as started_by_name,
         h.submitted_at, su.display_name as submitted_by_name,
         h.accepted_at, ac.display_name as accepted_by_name,
         h.cancelled_at, h.cancel_reason,
         app_private.current_balance() as live_balance
  from public.handovers h
  left join public.committee sc on sc.user_id = h.started_by
  left join public.committee su on su.user_id = h.submitted_by
  left join public.committee ac on ac.user_id = h.accepted_by;

/* ───────────────────────── grants ───────────────────────── */

revoke all on public.fund_summary, public.terms_public, public.handovers_admin
  from public, anon, authenticated;
grant select on public.fund_summary, public.terms_public to anon, authenticated, service_role;
grant select on public.handovers_admin to authenticated, service_role;

revoke all on function
  app_private.public_fund_summary(), app_private.public_terms(),
  app_private.current_balance(), app_private.require_money_keeper(), app_private.lines_total(jsonb),
  public.start_handover(uuid, text), public.update_handover_draft(uuid, jsonb, uuid[], text),
  public.submit_handover(uuid), public.accept_handover(uuid, text), public.cancel_handover(uuid, text)
from public, anon, authenticated;
grant execute on function app_private.public_fund_summary(), app_private.public_terms()
  to anon, authenticated, service_role;
grant execute on function app_private.current_balance() to authenticated, service_role;
grant execute on function
  public.start_handover(uuid, text), public.update_handover_draft(uuid, jsonb, uuid[], text),
  public.submit_handover(uuid), public.accept_handover(uuid, text), public.cancel_handover(uuid, text)
to authenticated, service_role;
grant execute on function app_private.require_money_keeper(), app_private.lines_total(jsonb) to service_role;
