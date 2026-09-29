-- ════════════════════════════════════════════════════════════════════════════════════════
-- M23 · P2 backend items of the edge-case audit.
--
-- M5  record_payment returns `pending_overlap: true` when another pending payment already covers
--     one of the same member-months (the slip can warn: only one of them can be confirmed).
-- M17 transaction references are compared normalised (no spaces, upper case, no leading zeros):
--     «00123 45» and «12345» are the same transfer. Pre-check and unique index both use it.
-- E5  set_committee_member refuses linking a member who is not active (same rule as «حسابي»),
--     when the link changes.
-- D10 a term's «collected» counts payments by the day they were confirmed (paid_on for older
--     rows without it), so a back-dated confirmation after a handover lands in the open term.
-- C4  a confirmed contribution to a closed campaign cannot be cancelled: its leftover has already
--     moved to the fund (every close moves it, owner decision), so the campaign would go negative.
-- ════════════════════════════════════════════════════════════════════════════════════════

/* ── M17 ── */

create function app_private.norm_txn(p_ref text) returns text
language sql immutable set search_path = '' as $$
  select nullif(ltrim(upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g')), '0'), '');
$$;

drop index public.payments_txn_ref_uniq;
create unique index payments_txn_ref_uniq on public.payments (method, app_private.norm_txn(txn_ref))
  where txn_ref is not null and status in ('pending', 'confirmed');

/* ── M5 + M17: record_payment (m17 body) ── */

create or replace function app_private.record_payment(
  p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date,
  p_allocations jsonb, p_txn_ref text default null, p_proof_path text default null, p_proof_hash text default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  existing public.payments;
  mine uuid := app_private.my_member_id();
  paid record;
  overlap boolean;
begin
  perform app_private.require_committee();
  select * into existing from public.payments where id = p_id;
  if existing.id is not null then
    if existing.created_by is distinct from auth.uid() then perform app_private.fail('id_taken'); end if;
    return jsonb_build_object('id', existing.id, 'status', existing.status, 'replay', true);
  end if;
  if p_method = 'paper' and not app_private.is_admin() then perform app_private.fail('paper_admin_only'); end if;
  if p_paid_on > current_date + 1 then perform app_private.fail('future_date'); end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) = 0 then
    perform app_private.fail('allocations_required');
  end if;
  if app_private.norm_txn(p_txn_ref) is not null and exists (
    select 1 from public.payments x
    where x.method = p_method and app_private.norm_txn(x.txn_ref) = app_private.norm_txn(p_txn_ref)
      and x.status in ('pending', 'confirmed')) then
    perform app_private.fail('duplicate_txn_ref');
  end if;
  select a.member_id, a.year, a.month into paid
  from jsonb_to_recordset(p_allocations) a(kind public.allocation_kind, member_id uuid, year smallint, month smallint)
  join public.payment_months pm on pm.member_id = a.member_id and pm.year = a.year and pm.month = a.month and pm.released_at is null
  where a.kind = 'months'
  order by a.year, a.month
  limit 1;
  if paid.member_id is not null then
    perform app_private.month_error('month_already_paid', paid.member_id, paid.year, paid.month);
  end if;
  overlap := exists (
    select 1 from jsonb_to_recordset(p_allocations) a(kind public.allocation_kind, member_id uuid, year smallint, month smallint)
    join public.payment_allocations o on o.kind = 'months' and o.member_id = a.member_id and o.year = a.year and o.month = a.month
    join public.payments op on op.id = o.payment_id and op.status = 'pending'
    where a.kind = 'months');

  perform app_private.set_action('record_payment');
  insert into public.payments (id, payer_name, method, amount, paid_on, txn_ref, proof_path, proof_hash, note, created_by)
  values (p_id, btrim(p_payer_name), p_method, p_amount, p_paid_on, nullif(btrim(p_txn_ref), ''), p_proof_path,
          lower(p_proof_hash), p_note, auth.uid());
  insert into public.payment_allocations (payment_id, kind, member_id, campaign_id, year, month, amount)
  select p_id, a.kind, a.member_id, a.campaign_id, a.year, a.month, a.amount
  from jsonb_to_recordset(p_allocations)
       a(kind public.allocation_kind, member_id uuid, campaign_id uuid, year smallint, month smallint, amount integer);

  -- Fail now with a clear code rather than at commit.
  if p_amount <> (select sum(a.amount) from public.payment_allocations a where a.payment_id = p_id) then
    perform app_private.fail('allocations_mismatch');
  end if;

  if app_private.can_confirm() and not (mine is not null and exists (
       select 1 from public.payment_allocations a where a.payment_id = p_id and a.member_id = mine)) then
    return jsonb_build_object('id', p_id, 'replay', false, 'pending_overlap', overlap) || public.confirm_payment(p_id);
  end if;
  return jsonb_build_object('id', p_id, 'status', 'pending', 'replay', false, 'pending_overlap', overlap);
end $$;

/* ── E5 ── */

create or replace function app_private.set_committee_member(
  p_user_id uuid, p_display_name text, p_role public.committee_role, p_member_id uuid default null, p_active boolean default true
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if p_user_id = auth.uid() and (p_role <> 'admin' or not p_active) then
    perform app_private.fail('cannot_demote_self');
  end if;
  if p_member_id is not null
     and p_member_id is distinct from (select c.member_id from public.committee c where c.user_id = p_user_id)
     and not exists (select 1 from public.members_admin where member_id = p_member_id and member_status = 'active') then
    perform app_private.fail('member_not_active');
  end if;
  perform app_private.set_action('set_committee_member');
  insert into public.committee (user_id, display_name, role, member_id, active)
  values (p_user_id, btrim(p_display_name), p_role, p_member_id, p_active)
  on conflict (user_id) do update
    set display_name = excluded.display_name, role = excluded.role, member_id = excluded.member_id, active = excluded.active;
end $$;

/* ── C4 ── */

create or replace function app_private.cancel_payment(p_payment_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  perform app_private.require_committee();
  if btrim(coalesce(p_reason, '')) = '' then perform app_private.fail('reason_required'); end if;
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null then perform app_private.fail('not_found'); end if;
  if p.status = 'cancelled' then return; end if;
  if p.status = 'rejected' then perform app_private.fail('not_pending'); end if;
  if not (app_private.can_confirm() or app_private.is_admin()
          or (p.status = 'pending' and p.created_by = auth.uid())) then
    perform app_private.fail('not_allowed');
  end if;
  if p.status = 'confirmed' and exists (
       select 1 from public.payment_allocations a join public.campaigns c on c.id = a.campaign_id
       where a.payment_id = p.id and a.kind = 'campaign' and c.status = 'closed') then
    perform app_private.fail('campaign_closed');
  end if;
  perform app_private.set_action('cancel_payment');
  update public.payments set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  where id = p.id;
  update public.payment_months set released_at = now() where payment_id = p.id and released_at is null;
end $$;

/* ── D10: public_terms (m21 body), collected by confirmation day ── */

create or replace function app_private.public_terms()
returns table (number smallint, title text, started_on date, ended_on date, opening_balance integer,
               closing_balance integer, collected bigint, spent bigint, adjustment bigint)
language sql stable security definer set search_path = '' as $$
  select t.number, t.title, t.started_on, t.ended_on,
         case when t.number = 1 then (select s.opening_balance from public.settings s) else t.opening_balance end,
         (select n.opening_balance from public.terms n where n.number = t.number + 1),
         (select coalesce(sum(a.amount), 0) from public.payment_allocations a join public.payments p on p.id = a.payment_id
          where p.status = 'confirmed' and a.kind in ('months', 'credit') and p.method::text <> 'credit'
            and coalesce(p.decided_at::date, p.paid_on) >= t.started_on
            and (t.ended_on is null or coalesce(p.decided_at::date, p.paid_on) < t.ended_on)),
         (select coalesce(sum(e.amount), 0) from public.expenses e
          where e.cancelled_at is null and e.campaign_id is null
            and e.spent_on >= t.started_on and (t.ended_on is null or e.spent_on < t.ended_on)),
         (select coalesce(sum(b.amount), 0) from public.balance_adjustments b where b.term = t.number)
  from public.terms t
  order by t.number;
$$;
