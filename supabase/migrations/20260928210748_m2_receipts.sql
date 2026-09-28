-- ════════════════════════════════════════════════════════════════════════════════════════
-- M2 · receipts: every confirmed payment (except the paper import) gets a receipt number,
-- gapless per year (2026-0001, 2026-0002 …), and an unguessable verification code
-- (BQ-XXXX-NNNN) printed on the shared receipt. Anyone can check a code at /r/<code>:
-- verify_receipt() returns only what the receipt already shows, plus valid/cancelled.
-- ════════════════════════════════════════════════════════════════════════════════════════

create table public.receipt_counters (
  year smallint primary key,
  last integer not null
);
alter table public.receipt_counters enable row level security;
revoke all on public.receipt_counters from public, anon, authenticated;
grant all on public.receipt_counters to service_role;
create policy committee_read on public.receipt_counters for select to authenticated
  using ((select app_private.is_committee()));
create trigger zz_no_truncate before truncate on public.receipt_counters for each statement
  execute function app_private.tg_no_truncate();

alter table public.payments
  add column receipt_year smallint,
  add column receipt_seq  integer,
  add column receipt_code text check (receipt_code ~ '^BQ-[A-Z]{4}-[0-9]{4}$'),
  add constraint payments_receipt_shape check ((receipt_year is null) = (receipt_seq is null)
                                               and (receipt_year is null) = (receipt_code is null));
create unique index payments_receipt_no_uniq on public.payments (receipt_year, receipt_seq) where receipt_seq is not null;
create unique index payments_receipt_code_uniq on public.payments (receipt_code) where receipt_code is not null;

drop trigger a_guard on public.payments;
create trigger a_guard before update or delete on public.payments for each row execute function
  app_private.tg_append_only('decided_at,decided_by,reject_reason,cancelled_at,cancelled_by,cancel_reason,receipt_year,receipt_seq,receipt_code',
                             'status');

-- BQ- + 4 letters (no I/O) + - + 4 digits, from pgcrypto random bytes.
create function app_private.new_receipt_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  b bytea;
  code text;
begin
  loop
    b := extensions.gen_random_bytes(8);
    code := 'BQ-'
      || substr(letters, get_byte(b, 0) % 24 + 1, 1) || substr(letters, get_byte(b, 1) % 24 + 1, 1)
      || substr(letters, get_byte(b, 2) % 24 + 1, 1) || substr(letters, get_byte(b, 3) % 24 + 1, 1)
      || '-' || lpad(((get_byte(b, 4) * 256 + get_byte(b, 5)) * 256 + get_byte(b, 6)) % 10000 || '', 4, '0');
    exit when not exists (select 1 from public.payments p where p.receipt_code = code);
  end loop;
  return code;
end $$;

-- Stamps the receipt on a payment that has just been confirmed. Row lock on the year's counter
-- keeps numbers gapless (a rolled-back confirmation rolls its number back too).
create function app_private.issue_receipt(p_payment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  y smallint := extract(year from now() at time zone 'Africa/Nouakchott')::smallint;
  n integer;
begin
  insert into public.receipt_counters as rc (year, last) values (y, 1)
  on conflict (year) do update set last = rc.last + 1
  returning last into n;
  update public.payments set receipt_year = y, receipt_seq = n, receipt_code = app_private.new_receipt_code()
  where id = p_payment_id;
end $$;

-- Same as 5/5 plus the receipt at the end (paper imports get none).
create or replace function public.confirm_payment(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
  mine uuid := app_private.my_member_id();
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

  perform app_private.set_action('confirm_payment');
  update public.payments set status = 'confirmed', decided_at = now(), decided_by = auth.uid() where id = p.id;

  perform set_config('sondoq.confirming', p.id::text, true);
  begin
    insert into public.payment_months (payment_id, member_id, year, month, amount)
    select a.payment_id, a.member_id, a.year, a.month, a.amount
    from public.payment_allocations a where a.payment_id = p.id and a.kind = 'months';
  exception when unique_violation then
    perform set_config('sondoq.confirming', '', true);
    perform app_private.fail('month_already_paid');
  end;
  perform set_config('sondoq.confirming', '', true);

  if p.method <> 'paper' then perform app_private.issue_receipt(p.id); end if;

  return jsonb_build_object('status', 'confirmed', 'already', false, 'decided_by', auth.uid(), 'decided_at', now(),
    'decided_by_name', (select c.display_name from public.committee c where c.user_id = auth.uid()),
    'receipt_code', (select x.receipt_code from public.payments x where x.id = p.id));
end $$;

-- Public check of a receipt code. Only the fields printed on the receipt; never phones/proofs.
create function public.verify_receipt(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object(
      'status', case when p.status = 'confirmed' then 'valid' else 'cancelled' end,
      'code', p.receipt_code,
      'receipt_no', p.receipt_year || '-' || lpad(p.receipt_seq::text, 4, '0'),
      'payer_name', p.payer_name,
      'amount', p.amount,
      'method', p.method,
      'paid_on', p.paid_on,
      'confirmed_at', p.decided_at,
      'confirmed_by_name', c.display_name,
      'confirmed_by_role', c.role,
      'txn_ref_last4', case when p.txn_ref is not null then right(p.txn_ref, 4) end,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('number', x.number, 'full_name', x.full_name, 'months', x.months) order by x.number)
        from (select m.number, m.full_name,
                     coalesce(jsonb_agg(jsonb_build_object('year', a.year, 'month', a.month) order by a.year, a.month)
                              filter (where a.kind = 'months'), '[]'::jsonb) as months
              from public.payment_allocations a join public.members m on m.id = a.member_id
              where a.payment_id = p.id
              group by m.number, m.full_name) x), '[]'::jsonb),
      'campaign_titles', coalesce((
        select jsonb_agg(distinct c.title) from public.payment_allocations a join public.campaigns c on c.id = a.campaign_id
        where a.payment_id = p.id), '[]'::jsonb))
    from public.payments p left join public.committee c on c.user_id = p.decided_by
    where p.receipt_code = upper(btrim(p_code)) and p.status in ('confirmed', 'cancelled')),
    jsonb_build_object('status', 'not_found'));
$$;

-- The committee queue shows the receipt (appended columns keep the view replaceable).
create or replace view public.payment_queue with (security_invoker = true) as
  select p.id, p.status, p.payer_name, p.method, p.amount, p.paid_on, p.txn_ref, p.proof_path, p.note,
         p.created_at, p.created_by, rc.display_name as created_by_name,
         p.decided_at, p.decided_by, dc.display_name as decided_by_name,
         p.reject_reason, p.cancelled_at, p.cancel_reason,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'kind', a.kind, 'member_id', a.member_id, 'number', m.number, 'full_name', m.full_name,
                    'campaign_id', a.campaign_id, 'year', a.year, 'month', a.month, 'amount', a.amount)
                  order by m.number, a.year, a.month)
           from public.payment_allocations a left join public.members m on m.id = a.member_id
           where a.payment_id = p.id), '[]'::jsonb) as allocations,
         p.receipt_code,
         case when p.receipt_seq is not null then p.receipt_year || '-' || lpad(p.receipt_seq::text, 4, '0') end as receipt_no
  from public.payments p
  left join public.committee rc on rc.user_id = p.created_by
  left join public.committee dc on dc.user_id = p.decided_by;

/* ───────────────────────── public feed: operations and contributions ───────────────────────── */

-- «آخر العمليات»: confirmed payments now carry id, amount, method and receipt code.
drop view public.activity_feed;
drop function app_private.public_activity_feed();
create function app_private.public_activity_feed()
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
  order by 1 desc limit 50;
$$;
create view public.activity_feed with (security_invoker = true) as
  select * from app_private.public_activity_feed();

-- «آخر المساهمات»: confirmed contributions per campaign (member name, or the payer for an outside donor).
create function app_private.public_campaign_contributions()
returns table (campaign_id uuid, at timestamptz, contributor_name text, amount bigint, payment_id uuid)
language sql stable security definer set search_path = '' as $$
  select a.campaign_id, p.decided_at, coalesce(m.full_name, p.payer_name), sum(a.amount), p.id
  from public.payment_allocations a
  join public.payments p on p.id = a.payment_id and p.status = 'confirmed'
  left join public.members m on m.id = a.member_id
  where a.kind = 'campaign'
  group by a.campaign_id, p.decided_at, coalesce(m.full_name, p.payer_name), p.id;
$$;
create view public.campaign_contributions with (security_invoker = true) as
  select * from app_private.public_campaign_contributions();

revoke all on public.activity_feed, public.campaign_contributions from public, anon, authenticated;
grant select on public.activity_feed, public.campaign_contributions to anon, authenticated, service_role;
revoke all on function app_private.public_activity_feed(), app_private.public_campaign_contributions()
  from public, anon, authenticated;
grant execute on function app_private.public_activity_feed(), app_private.public_campaign_contributions()
  to anon, authenticated, service_role;

revoke all on function app_private.new_receipt_code(), app_private.issue_receipt(uuid), public.verify_receipt(text)
  from public, anon, authenticated;
grant execute on function public.verify_receipt(text) to anon, authenticated, service_role;
grant execute on function app_private.new_receipt_code(), app_private.issue_receipt(uuid) to service_role;
