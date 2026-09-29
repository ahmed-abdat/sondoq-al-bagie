-- ════════════════════════════════════════════════════════════════════════════════════════
-- M17 · month errors say which member and month (edge-case audit M10).
--
-- One transfer can pay several members; «أحد هذه الأشهر مدفوع من قبل» did not say which.
-- `app_private.month_error` raises the same P0001 + HINT code with a JSON DETAIL
-- {"name", "ref" (A-12), "ym" (2026-07), "price" (MRO, wrong_month_amount only)} that the app turns
-- into «شهر يوليو 2026 لـ … مدفوع من قبل». Used for month_already_paid (record_payment pre-check and
-- confirm_payment), month_not_owed and wrong_month_amount (allocation trigger). Codes unchanged.
-- ════════════════════════════════════════════════════════════════════════════════════════

create function app_private.month_error(
  p_code text, p_member uuid, p_year integer, p_month integer, p_price integer default null
) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  d jsonb;
begin
  select jsonb_strip_nulls(jsonb_build_object(
           'name', m.full_name, 'ref', m.list_code || '-' || m.number,
           'ym', p_year || '-' || lpad(p_month::text, 2, '0'), 'price', p_price))
  into d from public.members m where m.id = p_member;
  raise exception 'sondoq: % (%-%)', p_code, p_year, p_month
    using errcode = 'P0001', hint = p_code, detail = coalesce(d, '{}'::jsonb)::text;
end $$;
revoke all on function app_private.month_error(text, uuid, integer, integer, integer) from public, anon, authenticated;

-- Allocations are written once, while the payment is still pending (inside record_payment).
create or replace function app_private.tg_allocation_before_insert() returns trigger
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
      perform app_private.month_error('month_not_owed', new.member_id, new.year, new.month);
    end if;
    price := app_private.price_at(new.member_id, new.year, new.month);
    if price is null then
      raise exception 'sondoq: no price set for % in %', per.group_id, new.year using errcode = 'P0001', hint = 'no_price';
    end if;
    if new.amount <> price then
      perform app_private.month_error('wrong_month_amount', new.member_id, new.year, new.month, price);
    end if;
  elsif new.kind = 'campaign' then
    if not exists (select 1 from public.campaigns c where c.id = new.campaign_id and c.status = 'open') then
      raise exception 'sondoq: campaign is not open' using errcode = 'P0001', hint = 'campaign_closed';
    end if;
  end if;
  return new;
end $$;

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
  if p_txn_ref is not null and exists (
    select 1 from public.payments x where x.method = p_method and x.txn_ref = btrim(p_txn_ref) and x.status in ('pending', 'confirmed')) then
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
    return jsonb_build_object('id', p_id, 'replay', false) || public.confirm_payment(p_id);
  end if;
  return jsonb_build_object('id', p_id, 'status', 'pending', 'replay', false);
end $$;

-- m15 body; only the month_already_paid branch changes (names the first month already paid).
create or replace function app_private.confirm_payment(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  mine uuid := app_private.my_member_id();
  paid record;
begin
  if not app_private.can_confirm() then perform app_private.fail('not_confirmer'); end if;
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null then perform app_private.fail('not_found'); end if;
  if p.status = 'confirmed' then
    return jsonb_build_object('status', p.status, 'already', true, 'decided_by', p.decided_by, 'decided_at', p.decided_at,
      'decided_by_name', (select c.display_name from public.committee c where c.user_id = p.decided_by),
      'receipt_code', p.receipt_code);
  end if;
  if p.status <> 'pending' then perform app_private.fail('not_pending'); end if;
  if mine is not null and exists (select 1 from public.payment_allocations a where a.payment_id = p.id and a.member_id = mine) then
    perform app_private.fail('own_membership', 'a payment covering your own membership must be confirmed by someone else');
  end if;
  if exists (select 1 from public.campaigns c
             where c.id in (select a.campaign_id from public.payment_allocations a
                            where a.payment_id = p.id and a.kind = 'campaign')
               and c.status = 'closed'
             for share of c) then
    perform app_private.fail('campaign_closed');
  end if;

  perform app_private.set_action('confirm_payment');
  update public.payments set status = 'confirmed', decided_at = now(), decided_by = auth.uid() where id = p.id;

  perform set_config('sondoq.confirming', p.id::text, true);
  begin
    insert into public.payment_months (payment_id, member_id, year, month, amount)
    select a.payment_id, a.member_id, a.year, a.month, a.amount
    from public.payment_allocations a where a.payment_id = p.id and a.kind = 'months';
  exception when unique_violation then
    perform set_config('sondoq.confirming', '', true);
    select a.member_id, a.year, a.month into paid
    from public.payment_allocations a
    join public.payment_months pm on pm.member_id = a.member_id and pm.year = a.year and pm.month = a.month
                                 and pm.released_at is null
    where a.payment_id = p.id and a.kind = 'months'
    order by a.year, a.month
    limit 1;
    if paid.member_id is null then perform app_private.fail('month_already_paid'); end if;
    perform app_private.month_error('month_already_paid', paid.member_id, paid.year, paid.month);
  end;
  perform set_config('sondoq.confirming', '', true);

  if p.method <> 'paper' then perform app_private.issue_receipt(p.id); end if;

  return jsonb_build_object('status', 'confirmed', 'already', false, 'decided_by', auth.uid(), 'decided_at', now(),
    'decided_by_name', (select c.display_name from public.committee c where c.user_id = auth.uid()),
    'receipt_code', (select x.receipt_code from public.payments x where x.id = p.id));
end $$;
