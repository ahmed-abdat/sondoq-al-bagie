-- ════════════════════════════════════════════════════════════════════════════════════════
-- M2 · fund accounts, committee WhatsApp contact, payment queue, undo
--
-- fund_accounts: the wallet numbers members send money to (the admin keeps them current).
-- Never deleted: an old number is deactivated and a new row added. Receipt OCR checks the
-- recipient against the active rows.
-- ════════════════════════════════════════════════════════════════════════════════════════

create table public.fund_accounts (
  id             uuid primary key default gen_random_uuid(),
  method         public.payment_method not null check (method::text not in ('cash', 'paper', 'other')),
  account_number text not null check (account_number ~ '^[0-9A-Za-z+]{4,30}$'),
  holder_name    text not null check (btrim(holder_name) <> ''),   -- as the wallet app shows it
  note           text,
  sort_order     smallint not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  updated_at     timestamptz,
  updated_by     uuid references auth.users (id)
);
create unique index fund_accounts_active_uniq on public.fund_accounts (method, account_number) where active;
create index fund_accounts_created_by_idx on public.fund_accounts (created_by);
create index fund_accounts_updated_by_idx on public.fund_accounts (updated_by);

create trigger a_guard before update or delete on public.fund_accounts for each row execute function
  app_private.tg_append_only('', 'holder_name,note,sort_order,active,updated_at,updated_by');
create trigger zz_no_truncate before truncate on public.fund_accounts for each statement
  execute function app_private.tg_no_truncate();
create trigger zz_audit after insert or update on public.fund_accounts for each row
  execute function app_private.tg_audit();

alter table public.fund_accounts enable row level security;
revoke all on public.fund_accounts from public, anon, authenticated;
grant select on public.fund_accounts to authenticated;
grant all on public.fund_accounts to service_role;
create policy committee_read on public.fund_accounts for select to authenticated
  using ((select app_private.is_committee()));

/* ───────────────────────── settings: committee WhatsApp contact ───────────────────────── */

-- Where members send their transfer screenshots (shown on the public page).
alter table public.settings add column whatsapp_contact text check (whatsapp_contact ~ '^\+?[0-9]{8,15}$');
drop trigger a_guard on public.settings;
create trigger a_guard before update or delete on public.settings for each row execute function
  app_private.tg_append_only('', 'opening_balance,opening_balance_on,grace_days,show_amount_owed,whatsapp_contact,updated_at,updated_by');

/* ───────────────────────── public views ───────────────────────── */

create function app_private.public_fund_accounts()
returns table (id uuid, method public.payment_method, account_number text, holder_name text, sort_order smallint)
language sql stable security definer set search_path = '' as $$
  select a.id, a.method, a.account_number, a.holder_name, a.sort_order
  from public.fund_accounts a where a.active order by a.sort_order, a.created_at;
$$;

create function app_private.public_fund_info()
returns table (whatsapp_contact text, grace_days smallint, show_amount_owed boolean)
language sql stable security definer set search_path = '' as $$
  select s.whatsapp_contact, s.grace_days, s.show_amount_owed from public.settings s;
$$;

create view public.fund_accounts_public with (security_invoker = true) as
  select * from app_private.public_fund_accounts();
create view public.fund_info with (security_invoker = true) as
  select * from app_private.public_fund_info();

-- A cancelled payment is not news: the feed shows confirmed payments only (was confirmed + cancelled).
create or replace function app_private.public_activity_feed()
returns table (at timestamptz, kind text, member_names text, months integer, amount integer, category public.expense_category)
language sql stable security definer set search_path = '' as $$
  (select p.decided_at, 'payment_confirmed',
          (select string_agg(distinct m.full_name, '، ') from public.payment_allocations a
           join public.members m on m.id = a.member_id where a.payment_id = p.id),
          (select count(*) from public.payment_allocations a where a.payment_id = p.id and a.kind = 'months')::integer,
          null::integer, null::public.expense_category
   from public.payments p
   where p.status = 'confirmed' and p.decided_at is not null and p.method <> 'paper'
   order by p.decided_at desc limit 30)
  union all
  (select e.created_at, 'expense', null, null, e.amount, e.category
   from public.expenses e where e.cancelled_at is null order by e.created_at desc limit 20)
  union all
  (select c.created_at, 'campaign_opened', null, null, c.target_amount, null
   from public.campaigns c order by c.created_at desc limit 10)
  order by 1 desc limit 50;
$$;

/* ───────────────────────── committee: payment queue ───────────────────────── */

-- Payments with who recorded/decided them and their split, for the pending queue and history.
-- SECURITY INVOKER: RLS on the base tables → active committee only.
create view public.payment_queue with (security_invoker = true) as
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
           where a.payment_id = p.id), '[]'::jsonb) as allocations
  from public.payments p
  left join public.committee rc on rc.user_id = p.created_by
  left join public.committee dc on dc.user_id = p.decided_by;

revoke all on public.fund_accounts_public, public.fund_info, public.payment_queue from public, anon, authenticated;
grant select on public.fund_accounts_public, public.fund_info to anon, authenticated;
grant select on public.payment_queue to authenticated;
grant select on public.fund_accounts_public, public.fund_info, public.payment_queue to service_role;

/* ───────────────────────── RPCs ───────────────────────── */

-- Undo right after recording: only the recorder, only within 30 s (the app shows a 5 s button;
-- the rest is slack for slow networks). Releases the months like a cancel.
create function public.undo_payment(p_payment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  perform app_private.require_committee();
  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null then perform app_private.fail('not_found'); end if;
  if p.status = 'cancelled' then return; end if;
  if p.created_by is distinct from auth.uid() or p.created_at < now() - interval '30 seconds' then
    perform app_private.fail('undo_expired');
  end if;
  if p.status = 'rejected' then perform app_private.fail('not_pending'); end if;
  perform app_private.set_action('undo_payment');
  update public.payments set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'undo'
  where id = p.id;
  update public.payment_months set released_at = now() where payment_id = p.id and released_at is null;
end $$;

create function public.add_fund_account(
  p_method public.payment_method, p_account_number text, p_holder_name text,
  p_note text default null, p_sort_order integer default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  aid uuid;
  num text := regexp_replace(coalesce(p_account_number, ''), '[\s-]', '', 'g');
begin
  perform app_private.require_admin();
  if p_method::text in ('cash', 'paper', 'other') then perform app_private.fail('not_a_wallet'); end if;
  if exists (select 1 from public.fund_accounts a where a.method = p_method and a.account_number = num and a.active) then
    perform app_private.fail('account_exists');
  end if;
  perform app_private.set_action('add_fund_account');
  insert into public.fund_accounts (method, account_number, holder_name, note, sort_order, created_by)
  values (p_method, num, btrim(p_holder_name), nullif(btrim(p_note), ''), p_sort_order, auth.uid())
  returning id into aid;
  return aid;
end $$;

-- Number and wallet never change (deactivate this row and add a new one instead).
create function public.update_fund_account(
  p_id uuid, p_holder_name text, p_note text, p_sort_order integer, p_active boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a public.fund_accounts;
begin
  perform app_private.require_admin();
  select * into a from public.fund_accounts where id = p_id for update;
  if a.id is null then perform app_private.fail('not_found'); end if;
  if p_active and not a.active and exists (
    select 1 from public.fund_accounts x where x.method = a.method and x.account_number = a.account_number and x.active) then
    perform app_private.fail('account_exists');
  end if;
  perform app_private.set_action(case when a.active and not p_active then 'deactivate_fund_account' else 'update_fund_account' end);
  update public.fund_accounts
  set holder_name = btrim(p_holder_name), note = nullif(btrim(p_note), ''), sort_order = p_sort_order, active = p_active,
      updated_at = now(), updated_by = auth.uid()
  where id = p_id;
end $$;

drop function public.update_settings(integer, date, integer, boolean);
-- p_whatsapp_contact: '' clears it, null leaves it unchanged.
create function public.update_settings(
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
    updated_at = now(), updated_by = auth.uid();
end $$;

revoke all on function public.undo_payment(uuid),
  public.add_fund_account(public.payment_method, text, text, text, integer),
  public.update_fund_account(uuid, text, text, integer, boolean),
  public.update_settings(integer, date, integer, boolean, text),
  app_private.public_fund_accounts(), app_private.public_fund_info()
from public, anon, authenticated;
grant execute on function public.undo_payment(uuid),
  public.add_fund_account(public.payment_method, text, text, text, integer),
  public.update_fund_account(uuid, text, text, integer, boolean),
  public.update_settings(integer, date, integer, boolean, text)
to authenticated, service_role;
grant execute on function app_private.public_fund_accounts(), app_private.public_fund_info()
to anon, authenticated, service_role;
