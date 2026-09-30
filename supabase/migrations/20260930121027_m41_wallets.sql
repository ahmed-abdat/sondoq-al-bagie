-- ════════════════════════════════════════════════════════════════════════════════════════
-- M41 · wallets («المحافظ», owner 2026-09-30): one list used everywhere (payments, contributions,
-- expenses, fund accounts), managed by «المسؤول» like the activities.
-- - wallet_types (name, optional logo_path, sort_order, active, kind wallet|cash, legacy_method):
--   seeded بنكيلي، مصرفي، السداد، كليك، BIM بنك، أمانتي، باميس، نقدًا (the old payment methods).
--   «المسؤول»: add_wallet_type / update_wallet_type (name, logo) / set_wallet_type_active (stop,
--   bring back; never the last). Never deleted.
-- - The old payment_method stays as a mirror (like m38): a wallet type's legacy method, 'other' for
--   new ones. Paper and credit stay methods without a wallet.
-- - fund_accounts.wallet_type_id (required; from the method), opening_balance + opening_on (set once
--   by «المسؤول»: set_fund_account_opening). add_wallet_account(wallet type, …); add_fund_account
--   (method) still works. One active account per wallet type and number.
-- - payments.wallet_type_id + fund_account_id, expenses.wallet_type_id: b_wallet checks them (the
--   account belongs to the wallet type and is active; the wallet type is active; cash has no
--   account) and fills them (type from the method / the account; account = the only active one of
--   its type). record_payment(…, p_wallet_type_id, p_fund_account_id), record_expense(…,
--   p_wallet_type_id): new last parameters, older calls unchanged. Same transfer number twice is
--   refused per wallet type.
-- - Cash in hand: the cash wallet row has its own opening (set once by «المسؤول»: set_cash_opening).
-- - report_wallets: a row per account (balance = opening + in − out since opening_on, only when
--   an opening is set), a row per wallet type for money without an account (cash: with its balance
--   when its opening is set), and the rest (paper, unspecified expenses) by method.
-- - Logos: a public 'logos' bucket (images only, ≤ 200 KB); the server uploads them for «المسؤول».
-- Bodies = pg_get_functiondef at m40, changed where marked. Undo: supabase/rollback/m41_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

/* ───────────────────────── wallet_types ───────────────────────── */

create table public.wallet_types (
  id            smallint generated always as identity primary key,
  name          text not null check (btrim(name) <> '' and length(name) <= 40),
  logo_path     text check (logo_path is null or length(logo_path) <= 200),
  kind          text not null default 'wallet' check (kind in ('wallet', 'cash')),
  sort_order    smallint not null default 0,
  active        boolean not null default true,
  legacy_method public.payment_method unique,
  -- cash in hand only (m41): its opening, set once by «المسؤول»
  opening_balance integer check (opening_balance >= 0),
  opening_on      date,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  updated_at    timestamptz,
  updated_by    uuid references auth.users (id),
  constraint wallet_types_opening_both check ((opening_balance is null) = (opening_on is null)),
  constraint wallet_types_opening_cash check (opening_on is null or kind = 'cash')
);
create unique index wallet_types_name_key on public.wallet_types (btrim(name));
create unique index wallet_types_one_cash on public.wallet_types (kind) where kind = 'cash';
create index wallet_types_created_by_idx on public.wallet_types (created_by);
create index wallet_types_updated_by_idx on public.wallet_types (updated_by);
create trigger a_guard before update or delete on public.wallet_types for each row execute function
  app_private.tg_append_only('', 'name,logo_path,sort_order,active,updated_at,updated_by,opening_balance,opening_on');
create trigger zz_no_truncate before truncate on public.wallet_types for each statement
  execute function app_private.tg_no_truncate();
create trigger zz_audit after insert or update on public.wallet_types for each row
  execute function app_private.tg_audit();
alter table public.wallet_types enable row level security;
revoke all on public.wallet_types from public, anon, authenticated;
grant select on public.wallet_types to authenticated;
grant all on public.wallet_types to service_role;
create policy committee_read on public.wallet_types for select to authenticated
  using ((select app_private.is_committee()));

insert into public.wallet_types (name, kind, sort_order, legacy_method) values
  ('بنكيلي', 'wallet', 1, 'bankily'),
  ('مصرفي', 'wallet', 2, 'masrvi'),
  ('السداد', 'wallet', 3, 'sedad'),
  ('كليك', 'wallet', 4, 'click'),
  ('BIM بنك', 'wallet', 5, 'bim'),
  ('أمانتي', 'wallet', 6, 'amanty'),
  ('باميس', 'wallet', 7, 'bamis'),
  ('نقدًا', 'cash', 99, 'cash');

create function app_private.add_wallet_type(p_name text, p_logo_path text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  wid integer;
begin
  perform app_private.require_admin();
  if btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) > 40 then perform app_private.fail('invalid_input'); end if;
  if exists (select 1 from public.wallet_types where btrim(name) = btrim(p_name)) then perform app_private.fail('wallet_name_taken'); end if;
  perform app_private.set_action('add_wallet_type');
  insert into public.wallet_types (name, logo_path, sort_order, created_by)
  values (btrim(p_name), nullif(btrim(p_logo_path), ''),
          coalesce((select max(sort_order) from public.wallet_types where kind = 'wallet'), 0) + 1, auth.uid())
  returning id into wid;
  return wid;
end $$;

create function app_private.update_wallet_type(p_id integer, p_name text, p_logo_path text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if btrim(coalesce(p_name, '')) = '' or length(btrim(p_name)) > 40 then perform app_private.fail('invalid_input'); end if;
  if not exists (select 1 from public.wallet_types where id = p_id) then perform app_private.fail('not_found'); end if;
  if exists (select 1 from public.wallet_types where btrim(name) = btrim(p_name) and id <> p_id) then
    perform app_private.fail('wallet_name_taken');
  end if;
  perform app_private.set_action('update_wallet_type');
  update public.wallet_types set name = btrim(p_name), logo_path = nullif(btrim(p_logo_path), ''), updated_at = now(),
                                 updated_by = auth.uid()
  where id = p_id;
end $$;

create function app_private.set_wallet_type_active(p_id integer, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  if p_active is null then perform app_private.fail('invalid_input'); end if;
  if not exists (select 1 from public.wallet_types where id = p_id) then perform app_private.fail('not_found'); end if;
  if not p_active and not exists (select 1 from public.wallet_types where active and id <> p_id) then
    perform app_private.fail('last_wallet');
  end if;
  perform app_private.set_action(case when p_active then 'restore_wallet_type' else 'stop_wallet_type' end);
  update public.wallet_types set active = p_active, updated_at = now(), updated_by = auth.uid() where id = p_id;
end $$;

/* ───────────────────────── fund_accounts: wallet type + opening ───────────────────────── */

-- a new wallet's account mirrors the method as 'other' (cash, paper and credit still have no account)
alter table public.fund_accounts drop constraint fund_accounts_method_check;
alter table public.fund_accounts add constraint fund_accounts_method_check
  check (method::text not in ('cash', 'paper', 'credit'));
alter table public.fund_accounts
  add column wallet_type_id smallint references public.wallet_types (id),
  add column opening_balance integer check (opening_balance >= 0),
  add column opening_on date,
  add constraint fund_accounts_opening_both check ((opening_balance is null) = (opening_on is null));
alter table public.fund_accounts disable trigger a_guard;
update public.fund_accounts f set wallet_type_id = w.id from public.wallet_types w
where w.legacy_method = f.method and f.wallet_type_id is null;
alter table public.fund_accounts enable trigger a_guard;
alter table public.fund_accounts alter column wallet_type_id set not null;
create index fund_accounts_wallet_type_idx on public.fund_accounts (wallet_type_id);
drop index public.fund_accounts_active_uniq;
create unique index fund_accounts_active_uniq on public.fund_accounts (wallet_type_id, account_number) where active;
drop trigger a_guard on public.fund_accounts;
create trigger a_guard before update or delete on public.fund_accounts for each row execute function
  app_private.tg_append_only('', 'holder_name,note,sort_order,active,updated_at,updated_by,opening_balance,opening_on');

-- a new account: its wallet type from the method (or the method mirror from the type); no account for cash
create function app_private.tg_account_wallet() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  w public.wallet_types;
begin
  if new.wallet_type_id is null then
    select * into w from public.wallet_types where legacy_method = new.method;
  else
    select * into w from public.wallet_types where id = new.wallet_type_id;
  end if;
  if w.id is null or w.kind = 'cash' then perform app_private.fail('not_a_wallet'); end if;
  if not w.active then perform app_private.fail('wallet_inactive'); end if;
  new.wallet_type_id := w.id;
  new.method := coalesce(w.legacy_method, 'other');
  return new;
end $$;
revoke all on function app_private.tg_account_wallet() from public, anon, authenticated;
create trigger b_wallet before insert on public.fund_accounts for each row execute function app_private.tg_account_wallet();

create function app_private.add_wallet_account(p_wallet_type_id integer, p_account_number text, p_holder_name text,
                                               p_note text default null, p_sort_order integer default 0) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  aid uuid;
  num text := regexp_replace(coalesce(p_account_number, ''), '[\s-]', '', 'g');
begin
  perform app_private.require_committee();
  if exists (select 1 from public.fund_accounts a where a.wallet_type_id = p_wallet_type_id and a.account_number = num and a.active) then
    perform app_private.fail('account_exists');
  end if;
  perform app_private.set_action('add_fund_account');
  insert into public.fund_accounts (method, wallet_type_id, account_number, holder_name, note, sort_order, created_by)
  values ('other', p_wallet_type_id, num, btrim(p_holder_name), nullif(btrim(p_note), ''), p_sort_order, auth.uid())
  returning id into aid;
  return aid;
end $$;

create function app_private.set_fund_account_opening(p_id uuid, p_amount integer, p_on date) returns void
language plpgsql security definer set search_path = '' as $$
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
end $$;

-- Cash in hand: its opening balance, once.
create function app_private.set_cash_opening(p_amount integer, p_on date) returns void
language plpgsql security definer set search_path = '' as $$
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
end $$;

/* ───────────────────────── logos: public bucket, written by the server ───────────────────────── */

-- Wallet logos are not sensitive: anyone may read them; only the server (secret key) writes, for
-- «المسؤول», through a server action. No storage policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 204800, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

/* ───────────────────────── payments and expenses: the wallet ───────────────────────── */

alter table public.payments
  add column wallet_type_id smallint references public.wallet_types (id),
  add column fund_account_id uuid references public.fund_accounts (id);
create index payments_wallet_type_idx on public.payments (wallet_type_id);
create index payments_fund_account_idx on public.payments (fund_account_id);
alter table public.expenses add column wallet_type_id smallint references public.wallet_types (id);
create index expenses_wallet_type_idx on public.expenses (wallet_type_id);

-- Resolve and check the wallet of a new payment / expense. Paper and credit have none.
create function app_private.resolve_wallet(p_method public.payment_method, inout wallet_type_id smallint,
                                           inout fund_account_id uuid) returns record
language plpgsql stable security definer set search_path = '' as $$
declare
  w public.wallet_types;
  a public.fund_accounts;
begin
  if fund_account_id is not null then
    select * into a from public.fund_accounts f where f.id = fund_account_id;
    if a.id is null then perform app_private.fail('not_found'); end if;
    if not a.active then perform app_private.fail('wallet_inactive'); end if;
    if wallet_type_id is not null and wallet_type_id <> a.wallet_type_id then perform app_private.fail('wallet_mismatch'); end if;
    wallet_type_id := a.wallet_type_id;
  end if;
  if wallet_type_id is null and p_method is not null then
    select x.id into wallet_type_id from public.wallet_types x where x.legacy_method = p_method;
  end if;
  if wallet_type_id is null then return; end if;
  select * into w from public.wallet_types x where x.id = wallet_type_id;
  if w.id is null then perform app_private.fail('not_found'); end if;
  if not w.active then perform app_private.fail('wallet_inactive'); end if;
  if w.kind = 'cash' then
    if fund_account_id is not null then perform app_private.fail('wallet_mismatch'); end if;
    return;
  end if;
  if fund_account_id is null
     and (select count(*) from public.fund_accounts f where f.wallet_type_id = w.id and f.active) = 1 then
    select f.id into fund_account_id from public.fund_accounts f where f.wallet_type_id = w.id and f.active;
  end if;
end $$;
revoke all on function app_private.resolve_wallet(public.payment_method, smallint, uuid) from public, anon, authenticated;

create function app_private.tg_payment_wallet() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if new.method::text in ('paper', 'credit') then
    if new.wallet_type_id is not null or new.fund_account_id is not null then perform app_private.fail('wallet_mismatch'); end if;
    return new;
  end if;
  r := app_private.resolve_wallet(case when new.wallet_type_id is null and new.fund_account_id is null then new.method end,
                                  new.wallet_type_id, new.fund_account_id);
  new.wallet_type_id := r.wallet_type_id;
  new.fund_account_id := r.fund_account_id;
  if new.wallet_type_id is not null then
    new.method := coalesce((select w.legacy_method from public.wallet_types w where w.id = new.wallet_type_id), 'other');
  end if;
  return new;
end $$;
revoke all on function app_private.tg_payment_wallet() from public, anon, authenticated;
create trigger b_wallet before insert on public.payments for each row execute function app_private.tg_payment_wallet();

create function app_private.tg_expense_wallet() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  cash_id smallint := (select w.id from public.wallet_types w where w.kind = 'cash');
begin
  if new.paid_in_cash then
    if new.fund_account_id is not null or (new.wallet_type_id is not null and new.wallet_type_id <> cash_id) then
      perform app_private.fail('wallet_mismatch');
    end if;
    new.wallet_type_id := cash_id;
    return new;
  end if;
  if new.wallet_type_id is null and new.fund_account_id is null then return new; end if;
  r := app_private.resolve_wallet(null, new.wallet_type_id, new.fund_account_id);
  new.wallet_type_id := r.wallet_type_id;
  new.fund_account_id := r.fund_account_id;
  new.paid_in_cash := new.wallet_type_id = cash_id;
  return new;
end $$;
revoke all on function app_private.tg_expense_wallet() from public, anon, authenticated;
create trigger b_wallet before insert on public.expenses for each row execute function app_private.tg_expense_wallet();

-- existing rows: the wallet type from the method / cash / the account; the account when exactly
-- one active account has that type
alter table public.payments disable trigger a_guard;
update public.payments p set wallet_type_id = w.id from public.wallet_types w
where w.legacy_method = p.method and p.wallet_type_id is null;
update public.payments p set fund_account_id = f.id from public.fund_accounts f
where p.fund_account_id is null and f.wallet_type_id = p.wallet_type_id and f.active
  and (select count(*) from public.fund_accounts x where x.wallet_type_id = p.wallet_type_id and x.active) = 1;
alter table public.payments enable trigger a_guard;
alter table public.expenses disable trigger a_guard;
update public.expenses e set wallet_type_id = coalesce((select f.wallet_type_id from public.fund_accounts f where f.id = e.fund_account_id),
                                                       case when e.paid_in_cash then (select w.id from public.wallet_types w where w.kind = 'cash') end)
where e.wallet_type_id is null and (e.fund_account_id is not null or e.paid_in_cash);
alter table public.expenses enable trigger a_guard;

drop index public.payments_txn_ref_uniq;
create unique index payments_txn_ref_uniq on public.payments (coalesce(wallet_type_id, 0), method, app_private.norm_txn(txn_ref))
  where txn_ref is not null and status in ('pending', 'confirmed');

/* ───────────────────────── record_payment / record_expense: the wallet ───────────────────────── */

drop function public.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text);
drop function app_private.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text);
CREATE OR REPLACE FUNCTION app_private.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text DEFAULT NULL::text, p_proof_path text DEFAULT NULL::text, p_proof_hash text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_wallet_type_id integer DEFAULT NULL::integer, p_fund_account_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing public.payments;
  paid record;
  overlap boolean;
begin
  perform app_private.require_committee();
  select * into existing from public.payments where id = p_id;
  if existing.id is not null then
    if existing.created_by is distinct from auth.uid() then perform app_private.fail('id_taken'); end if;
    return jsonb_build_object('id', existing.id, 'status', existing.status, 'replay', true);
  end if;
  if p_paid_on > current_date + 1 then perform app_private.fail('future_date'); end if;
  if jsonb_typeof(p_allocations) is distinct from 'array' or jsonb_array_length(p_allocations) = 0 then
    perform app_private.fail('allocations_required');
  end if;
  -- the same transfer number twice in one wallet (m41: by wallet type, the method for older rows)
  if app_private.norm_txn(p_txn_ref) is not null and exists (
    select 1 from public.payments x
    where coalesce(x.wallet_type_id::text, x.method::text)
          = coalesce(coalesce(p_wallet_type_id,
                              (select f.wallet_type_id from public.fund_accounts f where f.id = p_fund_account_id),
                              (select w.id from public.wallet_types w where w.legacy_method = p_method))::text, p_method::text)
      and app_private.norm_txn(x.txn_ref) = app_private.norm_txn(p_txn_ref)
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
  -- the wallet (m41): b_wallet checks it, fills it from the method, the account or the only active account
  insert into public.payments (id, payer_name, method, amount, paid_on, txn_ref, proof_path, proof_hash, note, created_by,
                               wallet_type_id, fund_account_id)
  values (p_id, btrim(p_payer_name), p_method, p_amount, p_paid_on, nullif(btrim(p_txn_ref), ''), p_proof_path,
          lower(p_proof_hash), p_note, auth.uid(), p_wallet_type_id, p_fund_account_id);
  insert into public.payment_allocations (payment_id, kind, member_id, campaign_id, year, month, amount, donor_name)
  select p_id, a.kind, a.member_id, a.campaign_id, a.year, a.month, a.amount, nullif(btrim(a.donor_name), '')
  from jsonb_to_recordset(p_allocations)
       a(kind public.allocation_kind, member_id uuid, campaign_id uuid, year smallint, month smallint, amount integer,
         donor_name text);

  -- Fail now with a clear code rather than at commit.
  if p_amount <> (select sum(a.amount) from public.payment_allocations a where a.payment_id = p_id) then
    perform app_private.fail('allocations_mismatch');
  end if;

  -- every committee record is confirmed at once (owner 2026-09-30: one committee level)
  return jsonb_build_object('id', p_id, 'replay', false, 'pending_overlap', overlap) || public.confirm_payment(p_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text DEFAULT NULL::text, p_proof_path text DEFAULT NULL::text, p_proof_hash text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_wallet_type_id integer DEFAULT NULL::integer, p_fund_account_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select app_private.record_payment(p_id => p_id, p_payer_name => p_payer_name, p_method => p_method, p_amount => p_amount, p_paid_on => p_paid_on, p_allocations => p_allocations, p_txn_ref => p_txn_ref, p_proof_path => p_proof_path, p_proof_hash => p_proof_hash, p_note => p_note, p_wallet_type_id => p_wallet_type_id, p_fund_account_id => p_fund_account_id) $function$
;
drop function public.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean);
drop function app_private.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean);
CREATE OR REPLACE FUNCTION app_private.record_expense(p_id uuid, p_spent_on date, p_amount integer, p_activity_id integer DEFAULT NULL::integer, p_category public.expense_category DEFAULT NULL::public.expense_category, p_note text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_receipt_path text DEFAULT NULL::text, p_fund_account_id uuid DEFAULT NULL::uuid, p_paid_in_cash boolean DEFAULT false, p_wallet_type_id integer DEFAULT NULL::integer)
 RETURNS uuid
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
  -- the wallet (m41): b_wallet fills wallet_type_id / paid_in_cash from each other and the account
  insert into public.expenses (id, spent_on, category, activity_id, campaign_id, amount, note, receipt_path, created_by,
                               fund_account_id, paid_in_cash, wallet_type_id)
  values (p_id, p_spent_on, p_category, p_activity_id, p_campaign_id, p_amount, p_note, p_receipt_path, auth.uid(),
          p_fund_account_id, coalesce(p_paid_in_cash, false), p_wallet_type_id);
  return p_id;
end $function$
;
CREATE OR REPLACE FUNCTION public.record_expense(p_id uuid, p_spent_on date, p_amount integer, p_activity_id integer DEFAULT NULL::integer, p_category public.expense_category DEFAULT NULL::public.expense_category, p_note text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_receipt_path text DEFAULT NULL::text, p_fund_account_id uuid DEFAULT NULL::uuid, p_paid_in_cash boolean DEFAULT false, p_wallet_type_id integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select app_private.record_expense(p_id => p_id, p_spent_on => p_spent_on, p_amount => p_amount,
                                    p_activity_id => p_activity_id, p_category => p_category, p_note => p_note,
                                    p_campaign_id => p_campaign_id, p_receipt_path => p_receipt_path,
                                    p_fund_account_id => p_fund_account_id, p_paid_in_cash => p_paid_in_cash, p_wallet_type_id => p_wallet_type_id)
$function$
;

/* ───────────────────────── report_wallets: per account and wallet type ───────────────────────── */

drop function public.report_wallets(date, date);
drop function app_private.report_wallets(date, date);
create function app_private.report_wallets(p_from date, p_to date)
returns table (wallet_type_id smallint, fund_account_id uuid, method public.payment_method, in_count integer, in_amount bigint,
               out_count integer, out_amount bigint, opening_balance bigint, opening_on date, balance bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_committee();
  if p_from is null or p_to is null or p_to < p_from then perform app_private.fail('invalid_input'); end if;
  return query
  with pin as (
    select p.wallet_type_id as t, p.fund_account_id as w, p.method as m, p.amount, p.paid_on as d
    from public.payments p where p.status = 'confirmed' and p.method::text <> 'credit'
  ),
  pout as (
    select e.wallet_type_id as t, e.fund_account_id as w, null::public.payment_method as m, e.amount, e.spent_on as d
    from public.expenses e where e.cancelled_at is null
  ),
  moves as (
    select t, w, m, amount, d, 1 as dir from pin union all select t, w, m, amount, d, -1 from pout
  ),
  accounts as (
    select f.wallet_type_id as t, f.id as w, f.method as m, f.opening_balance, f.opening_on,
           (select count(*) from moves x where x.w = f.id and x.dir = 1 and x.d between p_from and p_to)::integer as ic,
           coalesce((select sum(amount) from moves x where x.w = f.id and x.dir = 1 and x.d between p_from and p_to), 0)::bigint as ia,
           (select count(*) from moves x where x.w = f.id and x.dir = -1 and x.d between p_from and p_to)::integer as oc,
           coalesce((select sum(amount) from moves x where x.w = f.id and x.dir = -1 and x.d between p_from and p_to), 0)::bigint as oa,
           case when f.opening_on is not null then
             f.opening_balance + coalesce((select sum(dir * amount) from moves x where x.w = f.id and x.d between f.opening_on and p_to), 0)
           end::bigint as bal,
           f.active
    from public.fund_accounts f
  ),
  loose as (
    select x.t, case when x.t is null then x.m end as m,
           count(*) filter (where x.dir = 1)::integer as ic, coalesce(sum(amount) filter (where x.dir = 1), 0)::bigint as ia,
           count(*) filter (where x.dir = -1)::integer as oc, coalesce(sum(amount) filter (where x.dir = -1), 0)::bigint as oa
    from moves x where x.w is null and x.d between p_from and p_to
    group by 1, 2
  )
  select a.t, a.w, a.m, a.ic, a.ia, a.oc, a.oa, a.opening_balance::bigint, a.opening_on, a.bal
  from accounts a where a.active or a.ic > 0 or a.oc > 0
  union all
  select l.t, null, coalesce(l.m, (select w.legacy_method from public.wallet_types w where w.id = l.t)), l.ic, l.ia, l.oc, l.oa,
         w.opening_balance::bigint, w.opening_on,
         case when w.opening_on is not null then
           w.opening_balance + coalesce((select sum(dir * amount) from moves x
                                         where x.t = w.id and x.w is null and x.d between w.opening_on and p_to), 0)
         end::bigint
  from loose l left join public.wallet_types w on w.id = l.t
  union all
  -- cash in hand with an opening but no movement in the period: still shows its balance
  select w.id, null, w.legacy_method, 0, 0::bigint, 0, 0::bigint, w.opening_balance::bigint, w.opening_on,
         (w.opening_balance + coalesce((select sum(dir * amount) from moves x
                                        where x.t = w.id and x.w is null and x.d between w.opening_on and p_to), 0))::bigint
  from public.wallet_types w
  where w.kind = 'cash' and w.opening_on is not null and not exists (select 1 from loose l where l.t = w.id)
  order by 1 nulls last, 2 nulls last, 3 nulls last;
end $$;

/* ───────────────────────── wrappers and grants ───────────────────────── */

create function public.add_wallet_type(p_name text, p_logo_path text default null) returns integer
language sql security invoker set search_path = '' as $$ select app_private.add_wallet_type(p_name => p_name, p_logo_path => p_logo_path) $$;
create function public.update_wallet_type(p_id integer, p_name text, p_logo_path text default null) returns void
language sql security invoker set search_path = '' as $$ select app_private.update_wallet_type(p_id => p_id, p_name => p_name, p_logo_path => p_logo_path) $$;
create function public.set_wallet_type_active(p_id integer, p_active boolean) returns void
language sql security invoker set search_path = '' as $$ select app_private.set_wallet_type_active(p_id => p_id, p_active => p_active) $$;
create function public.add_wallet_account(p_wallet_type_id integer, p_account_number text, p_holder_name text,
                                          p_note text default null, p_sort_order integer default 0) returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.add_wallet_account(p_wallet_type_id => p_wallet_type_id, p_account_number => p_account_number,
                                        p_holder_name => p_holder_name, p_note => p_note, p_sort_order => p_sort_order)
$$;
create function public.set_cash_opening(p_amount integer, p_on date) returns void
language sql security invoker set search_path = '' as $$ select app_private.set_cash_opening(p_amount => p_amount, p_on => p_on) $$;
create function public.set_fund_account_opening(p_id uuid, p_amount integer, p_on date) returns void
language sql security invoker set search_path = '' as $$ select app_private.set_fund_account_opening(p_id => p_id, p_amount => p_amount, p_on => p_on) $$;
create function public.report_wallets(p_from date, p_to date)
returns table (wallet_type_id smallint, fund_account_id uuid, method public.payment_method, in_count integer, in_amount bigint,
               out_count integer, out_amount bigint, opening_balance bigint, opening_on date, balance bigint)
language sql stable security invoker set search_path = '' as $$ select * from app_private.report_wallets(p_from => p_from, p_to => p_to) $$;

revoke all on function
  app_private.add_wallet_type(text, text), public.add_wallet_type(text, text),
  app_private.update_wallet_type(integer, text, text), public.update_wallet_type(integer, text, text),
  app_private.set_wallet_type_active(integer, boolean), public.set_wallet_type_active(integer, boolean),
  app_private.add_wallet_account(integer, text, text, text, integer), public.add_wallet_account(integer, text, text, text, integer),
  app_private.set_fund_account_opening(uuid, integer, date), public.set_fund_account_opening(uuid, integer, date),
  app_private.set_cash_opening(integer, date), public.set_cash_opening(integer, date),
  app_private.report_wallets(date, date), public.report_wallets(date, date),
  public.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text, integer, uuid), public.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean, integer), app_private.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean, integer)
from public, anon, authenticated;
revoke all on function app_private.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text, integer, uuid) from public, anon;
grant execute on function
  app_private.add_wallet_type(text, text), public.add_wallet_type(text, text),
  app_private.update_wallet_type(integer, text, text), public.update_wallet_type(integer, text, text),
  app_private.set_wallet_type_active(integer, boolean), public.set_wallet_type_active(integer, boolean),
  app_private.add_wallet_account(integer, text, text, text, integer), public.add_wallet_account(integer, text, text, text, integer),
  app_private.set_fund_account_opening(uuid, integer, date), public.set_fund_account_opening(uuid, integer, date),
  app_private.set_cash_opening(integer, date), public.set_cash_opening(integer, date),
  app_private.report_wallets(date, date), public.report_wallets(date, date),
  app_private.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text, integer, uuid), public.record_payment(uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text, integer, uuid),
  app_private.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean, integer), public.record_expense(uuid, date, integer, integer, public.expense_category, text, uuid, text, uuid, boolean, integer)
to authenticated, service_role;

-- an account that added or changed a wallet type has history
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
      or exists (select 1 from public.wallet_types where p_user in (created_by, updated_by))
      or exists (select 1 from public.settings where updated_by = p_user)
      or exists (select 1 from public.terms where created_by = p_user)
      or exists (select 1 from public.handovers where p_user in (started_by, submitted_by, accepted_by, cancelled_by))
      or exists (select 1 from public.balance_adjustments where created_by = p_user)
      or exists (select 1 from public.member_links where p_user in (created_by, revoked_by))
      or exists (select 1 from public.campaign_participants where exempted_by = p_user)
      or exists (select 1 from public.audit_log where actor = p_user);
$function$
;
