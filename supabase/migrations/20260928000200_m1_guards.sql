-- ════════════════════════════════════════════════════════════════════════════════════════
-- Sondoq al-Baqie M1 · 2/5 · helpers, append-only guards, validation, audit
--
-- The database refuses edits and deletes whoever asks. A stored value changes only when:
--   • a "stamp" column goes from NULL to a value once (decided_at, cancelled_at…), or
--   • a declared "mutable" column changes (names, labels, status via its own state machine).
-- Errors: SQLSTATE P0001 with a stable HINT code the app maps to an Arabic message.
-- ════════════════════════════════════════════════════════════════════════════════════════

/* ───────────────────────── generic helpers ───────────────────────── */

create function app_private.fail(p_code text, p_msg text default null) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'sondoq: %', coalesce(p_msg, p_code) using errcode = 'P0001', hint = p_code;
end $$;

create function app_private.csv(val text) returns text[]
language sql immutable set search_path = '' as $$
  select case when val is null or val = '' then '{}'::text[] else string_to_array(val, ',') end;
$$;

create function app_private.month_start(p_year integer, p_month integer) returns date
language sql immutable set search_path = '' as $$ select make_date(p_year, p_month, 1) $$;

/* ───────────────────────── role helpers ───────────────────────── */

-- Trusted server side: SQL editor / migrations / service_role key (the 2026 paper import).
-- API callers always run under SET ROLE anon|authenticated (PostgREST), which this checks.
create function app_private.is_server() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('role', true), 'none') not in ('anon', 'authenticated');
$$;

create function app_private.my_role() returns public.committee_role
language sql stable security definer set search_path = '' as $$
  select c.role from public.committee c where c.user_id = auth.uid() and c.active;
$$;

create function app_private.is_committee() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.my_role() is not null;
$$;

create function app_private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app_private.my_role() = 'admin', false) or app_private.is_server();
$$;

-- Only the treasurer (or the named deputy when the treasurer is away) confirms money.
create function app_private.can_confirm() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app_private.my_role() in ('treasurer', 'deputy'), false) or app_private.is_server();
$$;

create function app_private.my_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select c.member_id from public.committee c where c.user_id = auth.uid() and c.active;
$$;

/* ───────────────────────── membership lookups ───────────────────────── */

-- The live period covering a given month (at most one: periods cannot overlap).
create function app_private.period_at(p_member uuid, p_year integer, p_month integer)
returns public.membership_periods
language sql stable security definer set search_path = '' as $$
  select p.* from public.membership_periods p
  where p.member_id = p_member and p.cancelled_at is null
    and app_private.month_start(p_year, p_month) between p.from_month and coalesce(p.to_month, 'infinity'::date);
$$;

-- Monthly price owed by a member for a month, or null when no price/period applies.
create function app_private.price_at(p_member uuid, p_year integer, p_month integer) returns integer
language sql stable security definer set search_path = '' as $$
  select gp.monthly_amount
  from public.membership_periods p
  join public.group_prices gp on gp.group_id = p.group_id and gp.year = p_year
  where p.member_id = p_member and p.cancelled_at is null
    and app_private.month_start(p_year, p_month) between p.from_month and coalesce(p.to_month, 'infinity'::date);
$$;

/* ───────────────────────── append-only ───────────────────────── */

-- TG_ARGV: [0] stamp columns (NULL → value once), [1] mutable columns.
create function app_private.tg_append_only() returns trigger
language plpgsql set search_path = '' as $$
declare
  stamps  text[] := app_private.csv(case when tg_nargs > 0 then tg_argv[0] end);
  mutable text[] := app_private.csv(case when tg_nargs > 1 then tg_argv[1] end);
  o jsonb;
  n jsonb;
  c text;
begin
  if tg_op = 'DELETE' then
    raise exception 'sondoq: %.% rows are never deleted', tg_table_schema, tg_table_name
      using errcode = 'P0001', hint = 'append_only';
  end if;
  o := to_jsonb(old);
  n := to_jsonb(new);
  foreach c in array stamps loop
    if (o -> c) is distinct from (n -> c) and jsonb_typeof(o -> c) <> 'null' then
      raise exception 'sondoq: %.% can be set only once', tg_table_name, c
        using errcode = 'P0001', hint = 'stamp_once';
    end if;
  end loop;
  if (o - stamps - mutable) is distinct from (n - stamps - mutable) then
    raise exception 'sondoq: %.% is append-only: cancel and record again instead of editing', tg_table_schema, tg_table_name
      using errcode = 'P0001', hint = 'append_only';
  end if;
  return new;
end $$;

create trigger a_guard before update or delete on public.settings for each row execute function
  app_private.tg_append_only('', 'opening_balance,opening_balance_on,grace_days,show_amount_owed,updated_at,updated_by');
create trigger a_guard before update or delete on public.groups for each row execute function
  app_private.tg_append_only('', 'name');
create trigger a_guard before update or delete on public.group_prices for each row execute function
  app_private.tg_append_only('', 'monthly_amount');
create trigger a_guard before update or delete on public.members for each row execute function
  app_private.tg_append_only('', 'full_name,phone,note');
create trigger a_guard before update or delete on public.membership_periods for each row execute function
  app_private.tg_append_only('to_month,cancelled_at,cancelled_by,cancel_reason', '');
create trigger a_guard before update or delete on public.committee for each row execute function
  app_private.tg_append_only('', 'display_name,role,member_id,active');
create trigger a_guard before update or delete on public.campaigns for each row execute function
  app_private.tg_append_only('closed_at,closed_by,surplus_action', 'title,purpose,target_amount,deadline,status');
create trigger a_guard before update or delete on public.campaign_participants for each row execute function
  app_private.tg_append_only('', 'expected_amount');
create trigger a_guard before update or delete on public.payments for each row execute function
  app_private.tg_append_only('decided_at,decided_by,reject_reason,cancelled_at,cancelled_by,cancel_reason', 'status');
create trigger a_guard before update or delete on public.payment_allocations for each row execute function
  app_private.tg_append_only('', '');
create trigger a_guard before update or delete on public.payment_months for each row execute function
  app_private.tg_append_only('released_at', '');
create trigger a_guard before update or delete on public.expenses for each row execute function
  app_private.tg_append_only('cancelled_at,cancelled_by,cancel_reason', '');
create trigger a_guard before update or delete on public.transfers for each row execute function
  app_private.tg_append_only('', '');
create trigger a_guard before update or delete on public.reminders for each row execute function
  app_private.tg_append_only('', '');
create trigger a_guard before update or delete on public.audit_log for each row execute function
  app_private.tg_append_only('', '');

create function app_private.tg_no_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'sondoq: %.% is never truncated', tg_table_schema, tg_table_name using errcode = 'P0001', hint = 'append_only';
end $$;

/* ───────────────────────── state machines ───────────────────────── */

-- pending → confirmed | rejected | cancelled;  confirmed → cancelled.  Nothing else.
create function app_private.tg_payment_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'pending' and new.status in ('confirmed', 'rejected', 'cancelled'))
    or (old.status = 'confirmed' and new.status = 'cancelled')) then
    raise exception 'sondoq: payment cannot go from % to %', old.status, new.status
      using errcode = 'P0001', hint = 'bad_transition';
  end if;
  return new;
end $$;
create trigger b_state before update on public.payments for each row execute function app_private.tg_payment_status();

create function app_private.tg_campaign_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'closed' and new.status <> 'closed' then
    raise exception 'sondoq: a closed campaign stays closed' using errcode = 'P0001', hint = 'bad_transition';
  end if;
  return new;
end $$;
create trigger b_state before update on public.campaigns for each row execute function app_private.tg_campaign_status();

-- A price is fixed once money for that year has been allocated.
create function app_private.tg_price_freeze() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.monthly_amount <> old.monthly_amount and exists (
    select 1 from public.payment_allocations a
    join public.membership_periods p on p.member_id = a.member_id and p.group_id = old.group_id and p.cancelled_at is null
    where a.kind = 'months' and a.year = old.year
      and app_private.month_start(a.year, a.month) between p.from_month and coalesce(p.to_month, 'infinity'::date)) then
    raise exception 'sondoq: the price is fixed once payments exist for that year' using errcode = 'P0001', hint = 'price_frozen';
  end if;
  return new;
end $$;
create trigger b_freeze before update on public.group_prices for each row execute function app_private.tg_price_freeze();

/* ───────────────────────── payment validation ───────────────────────── */

-- Allocations are written once, while the payment is still pending (inside record_payment).
create function app_private.tg_allocation_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  st public.payment_status;
  price integer;
  per public.membership_periods;
begin
  select status into st from public.payments where id = new.payment_id;
  if st is distinct from 'pending' then
    raise exception 'sondoq: allocations are added only to a new pending payment' using errcode = 'P0001', hint = 'not_pending';
  end if;
  if new.kind = 'months' then
    per := app_private.period_at(new.member_id, new.year, new.month);
    if per.id is null or per.status <> 'active' then
      raise exception 'sondoq: month %-% is not owed by this member', new.year, new.month
        using errcode = 'P0001', hint = 'month_not_owed';
    end if;
    price := app_private.price_at(new.member_id, new.year, new.month);
    if price is null then
      raise exception 'sondoq: no price set for % in %', per.group_id, new.year using errcode = 'P0001', hint = 'no_price';
    end if;
    if new.amount <> price then
      raise exception 'sondoq: a month costs % MRO, not %', price, new.amount using errcode = 'P0001', hint = 'wrong_month_amount';
    end if;
  elsif new.kind = 'campaign' then
    if not exists (select 1 from public.campaigns c where c.id = new.campaign_id and c.status = 'open') then
      raise exception 'sondoq: campaign is not open' using errcode = 'P0001', hint = 'campaign_closed';
    end if;
  end if;
  return new;
end $$;
create trigger a_validate before insert on public.payment_allocations for each row
  execute function app_private.tg_allocation_before_insert();

-- At commit: every payment's allocations add up to its amount.
create function app_private.tg_allocations_sum() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  pid uuid := (to_jsonb(new) ->> case when tg_table_name = 'payments' then 'id' else 'payment_id' end)::uuid;
  amt integer;
  total integer;
begin
  select p.amount, coalesce((select sum(a.amount) from public.payment_allocations a where a.payment_id = p.id), 0)
    into amt, total
  from public.payments p where p.id = pid;
  if amt is not null and amt <> total then
    raise exception 'sondoq: payment % allocations add up to % MRO, not %', pid, total, amt
      using errcode = 'P0001', hint = 'allocations_mismatch';
  end if;
  return null;
end $$;
create constraint trigger z_allocations_sum after insert on public.payments
  deferrable initially deferred for each row execute function app_private.tg_allocations_sum();
create constraint trigger z_allocations_sum after insert on public.payment_allocations
  deferrable initially deferred for each row execute function app_private.tg_allocations_sum();

-- payment_months is written only from inside confirm_payment() (flag set for that transaction).
create function app_private.tg_payment_month_before_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('sondoq.confirming', true), '') <> new.payment_id::text then
    raise exception 'sondoq: paid months are written only by confirm_payment()' using errcode = 'P0001', hint = 'confirm_only';
  end if;
  new.created_at := now();
  new.released_at := null;
  return new;
end $$;
create trigger a_validate before insert on public.payment_months for each row
  execute function app_private.tg_payment_month_before_insert();

/* ───────────────────────── audit (column names only) ───────────────────────── */

create function app_private.tg_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  n jsonb := to_jsonb(new);
  changed text[];
begin
  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into changed
    from jsonb_object_keys(n) k where (o -> k) is distinct from (n -> k);
    if changed is null then return null; end if;
  end if;
  insert into public.audit_log (actor, actor_role, action, table_name, row_id, changed)
  values (auth.uid(),
          coalesce(app_private.my_role()::text, auth.jwt() ->> 'role', current_user),
          coalesce(nullif(current_setting('sondoq.action', true), ''), lower(tg_op)),
          tg_table_name,
          coalesce(n ->> 'id', n ->> 'payment_id', n ->> 'user_id', n ->> 'member_id', n ->> 'group_id'),
          changed);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['settings','groups','group_prices','members','membership_periods','committee','campaigns',
                           'campaign_participants','payments','payment_allocations','payment_months','expenses',
                           'transfers','reminders','audit_log'] loop
    execute format('create trigger zz_no_truncate before truncate on public.%I for each statement execute function app_private.tg_no_truncate()', t);
    continue when t = 'audit_log';
    execute format('create trigger zz_audit after insert or update on public.%I for each row execute function app_private.tg_audit()', t);
  end loop;
end $$;
