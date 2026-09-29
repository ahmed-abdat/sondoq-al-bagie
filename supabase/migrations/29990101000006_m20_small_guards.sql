-- ════════════════════════════════════════════════════════════════════════════════════════
-- M20 · small guards from the edge-case audit (P2).
--
-- M18 `before_opening`: money dated before the fund's records start (settings.opening_balance_on) was
--      added on top of the opening balance and counted in no term. Refused for payments (except the
--      admin's paper records, which rebuild that history) and expenses.
-- M15 `months_pending_after`: a back-dated «معفى/غادر» while a payment for a later month was still
--      pending let the month be paid inside a not-owed period.
-- U3  `last_admin`: two admins demoting or deactivating each other at the same moment could both
--      commit and leave the fund without an admin. A trigger re-checks under a transaction lock.
-- D6  index on audit_log.actor (committee_accounts checks each account's history).
-- ════════════════════════════════════════════════════════════════════════════════════════

/* ── M18: nothing before the start of the records ── */

create function app_private.tg_not_before_opening() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  opening date := (select s.opening_balance_on from public.settings s);
  d date;
begin
  -- one statement per table: each only names columns its table has
  if tg_table_name = 'payments' then
    if new.method = 'paper' then return new; end if;
    d := new.paid_on;
  else
    d := new.spent_on;
  end if;
  if d < opening then perform app_private.fail('before_opening'); end if;
  return new;
end $$;
create trigger b_not_before_opening before insert on public.payments for each row
  execute function app_private.tg_not_before_opening();
create trigger b_not_before_opening before insert on public.expenses for each row
  execute function app_private.tg_not_before_opening();

/* ── M15: no back-dated not-owed period over a pending payment ── */

create or replace function app_private.change_member_status(
  p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cur public.membership_periods;
  m date := date_trunc('month', p_from_month)::date;
  gid smallint;
  pid uuid;
begin
  perform app_private.require_admin();
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  select * into cur from public.membership_periods
  where member_id = p_member_id and cancelled_at is null and to_month is null for update;
  if cur.id is null then perform app_private.fail('no_open_period'); end if;
  if m <= cur.from_month then perform app_private.fail('before_current_period'); end if;
  if p_group_code is null then gid := cur.group_id;
  else
    select id into gid from public.groups where code = p_group_code;
    if gid is null then perform app_private.fail('unknown_group'); end if;
  end if;
  if exists (select 1 from public.payment_months pm where pm.member_id = p_member_id and pm.released_at is null
             and make_date(pm.year, pm.month, 1) >= m and p_status <> 'active') then
    perform app_private.fail('months_already_paid_after');
  end if;
  if p_status <> 'active' and exists (
       select 1 from public.payment_allocations a join public.payments p on p.id = a.payment_id
       where a.member_id = p_member_id and a.kind = 'months' and p.status = 'pending'
         and make_date(a.year, a.month, 1) >= m) then
    perform app_private.fail('months_pending_after');
  end if;
  perform app_private.set_action('change_member_status');
  update public.membership_periods set to_month = (m - interval '1 month')::date where id = cur.id;
  insert into public.membership_periods (member_id, group_id, status, from_month, reason, created_by)
  values (p_member_id, gid, p_status, m, btrim(p_reason), auth.uid())
  returning id into pid;
  return pid;
end $$;

/* ── U3: always one active admin ── */

create function app_private.tg_keep_an_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- serialise admin changes; after the wait this statement sees the other transaction's commit
  perform pg_advisory_xact_lock(hashtext('sondoq.committee_admins'));
  if not exists (select 1 from public.committee c where c.role = 'admin' and c.active) then
    perform app_private.fail('last_admin');
  end if;
  return null;
end $$;
create trigger z_keep_an_admin after update or delete on public.committee for each row
  when (old.role = 'admin' and old.active)
  execute function app_private.tg_keep_an_admin();

/* ── D6 ── */

create index audit_log_actor_idx on public.audit_log (actor);
