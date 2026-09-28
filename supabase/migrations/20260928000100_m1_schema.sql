-- ════════════════════════════════════════════════════════════════════════════════════════
-- Sondoq al-Baqie M1 · 1/5 · tables
--
-- Money is an integer in old ouguiya (MRO) everywhere. Arrears and totals are never stored:
-- they are computed in 3/5 (views). Nothing is hard-deleted (see 2/5): payments, expenses and
-- periods are cancelled with a reason, and every change lands in audit_log.
-- A month is written as (year, month 1-12); a membership period uses first-of-month dates.
-- ════════════════════════════════════════════════════════════════════════════════════════

create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;   -- helpers only; never exposed over the API

create type public.committee_role   as enum ('admin', 'treasurer', 'deputy', 'committee');
create type public.membership_status    as enum ('active', 'exempt', 'away', 'left', 'deceased');
create type public.payment_method   as enum ('bankily', 'masrvi', 'sedad', 'cash', 'other', 'paper');
create type public.payment_status   as enum ('pending', 'confirmed', 'rejected', 'cancelled');
create type public.allocation_kind  as enum ('months', 'campaign', 'credit');
create type public.campaign_mode    as enum ('fixed', 'per_group', 'custom', 'open');
create type public.campaign_status  as enum ('open', 'closed');
create type public.surplus_action   as enum ('to_fund', 'keep');
create type public.expense_category as enum ('teaching', 'honoring', 'sports', 'other');
create type public.reminder_kind    as enum ('individual', 'group', 'receipt', 'campaign');

/* ───────────────────────── settings (single row) ───────────────────────── */

create table public.settings (
  id                 boolean primary key default true check (id),
  opening_balance    integer not null default 0,           -- MRO held before the first recorded payment
  opening_balance_on date not null default '2026-01-01',
  grace_days         smallint not null default 10 check (grace_days between 0 and 27),
  show_amount_owed   boolean not null default false,       -- public page shows owed amounts only when ON
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id)
);
insert into public.settings default values;

/* ───────────────────────── groups, prices, members ───────────────────────── */

create table public.groups (
  id         smallint generated always as identity primary key,
  code       text not null unique check (code ~ '^[A-Z]$'),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Price per group per year, so a price change never rewrites past years.
create table public.group_prices (
  group_id       smallint not null references public.groups (id),
  year           smallint not null check (year between 2020 and 2100),
  monthly_amount integer not null check (monthly_amount > 0),
  created_at     timestamptz not null default now(),
  primary key (group_id, year)
);

create table public.members (
  id         uuid primary key default gen_random_uuid(),
  number     integer not null unique check (number > 0),   -- number on the paper sheet
  full_name  text not null check (btrim(full_name) <> ''),
  phone      text check (phone ~ '^\+?[0-9]{8,15}$'),     -- committee only; never in public views
  note       text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

-- Status and group over time. Only 'active' months are owed. Periods never overlap.
create table public.membership_periods (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members (id),
  group_id      smallint not null references public.groups (id),
  status        public.membership_status not null,
  from_month    date not null check (extract(day from from_month) = 1),
  to_month      date check (extract(day from to_month) = 1 and to_month >= from_month),   -- inclusive; null = open
  reason        text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  cancelled_at  timestamptz,
  cancelled_by  uuid references auth.users (id),
  cancel_reason text,
  constraint membership_periods_no_overlap exclude using gist (
    member_id with =,
    daterange(from_month, coalesce(to_month, 'infinity'::date), '[]') with &&
  ) where (cancelled_at is null),
  constraint membership_periods_cancel_reason check (cancelled_at is null or btrim(coalesce(cancel_reason, '')) <> '')
);
create index membership_periods_group_idx on public.membership_periods (group_id);
create index membership_periods_member_idx on public.membership_periods (member_id, from_month);

/* ───────────────────────── committee ───────────────────────── */

-- Committee accounts are created by the admin (public sign-up is off). member_id links the
-- account to a member so nobody confirms a payment that covers their own membership.
create table public.committee (
  user_id      uuid primary key references auth.users (id),
  display_name text not null check (btrim(display_name) <> ''),
  role         public.committee_role not null,
  member_id    uuid unique references public.members (id),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

/* ───────────────────────── campaigns ───────────────────────── */

create table public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (btrim(title) <> ''),
  purpose        text,
  target_amount  integer check (target_amount > 0),
  deadline       date,
  amount_mode    public.campaign_mode not null,
  status         public.campaign_status not null default 'open',
  surplus_action public.surplus_action,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users (id),
  closed_at      timestamptz,
  closed_by      uuid references auth.users (id)
);

create table public.campaign_participants (
  campaign_id     uuid not null references public.campaigns (id),
  member_id       uuid not null references public.members (id),
  expected_amount integer check (expected_amount > 0),   -- null when amount_mode = 'open'
  created_at      timestamptz not null default now(),
  primary key (campaign_id, member_id)
);
create index campaign_participants_member_idx on public.campaign_participants (member_id);

/* ───────────────────────── payments ───────────────────────── */

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  payer_name    text not null check (btrim(payer_name) <> ''),
  method        public.payment_method not null,
  amount        integer not null check (amount > 0),
  paid_on       date not null,
  txn_ref       text check (btrim(txn_ref) <> ''),        -- wallet transaction number
  proof_path    text,                                    -- object in the private 'proofs' bucket
  proof_hash    text check (proof_hash ~ '^[0-9a-f]{64}$'),
  note          text,
  status        public.payment_status not null default 'pending',
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  decided_at    timestamptz,
  decided_by    uuid references auth.users (id),
  reject_reason text,
  cancelled_at  timestamptz,
  cancelled_by  uuid references auth.users (id),
  cancel_reason text,
  constraint payments_reject_reason check (status <> 'rejected' or btrim(coalesce(reject_reason, '')) <> ''),
  constraint payments_cancel_reason check (status <> 'cancelled' or btrim(coalesce(cancel_reason, '')) <> '')
);
-- The same wallet screenshot cannot be recorded twice while the first is still live.
create unique index payments_txn_ref_uniq on public.payments (method, txn_ref)
  where txn_ref is not null and status in ('pending', 'confirmed');
create unique index payments_proof_hash_uniq on public.payments (proof_hash)
  where proof_hash is not null and status in ('pending', 'confirmed');
create index payments_status_idx on public.payments (status, created_at desc);
create index payments_created_by_idx on public.payments (created_by);
create index payments_decided_by_idx on public.payments (decided_by);
create index payments_cancelled_by_idx on public.payments (cancelled_by);

-- How one transfer is split. The allocations always sum to payments.amount (checked at commit).
--   months:   one row per (member, year, month), amount = that month's group price
--   campaign: contribution to a campaign (member_id null for an outside donor)
--   credit:   extra money kept as the member's credit
create table public.payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.payments (id),
  kind        public.allocation_kind not null,
  member_id   uuid references public.members (id),
  campaign_id uuid references public.campaigns (id),
  year        smallint check (year between 2020 and 2100),
  month       smallint check (month between 1 and 12),
  amount      integer not null check (amount > 0),
  constraint payment_allocations_shape check (case kind
    when 'months'   then member_id is not null and year is not null and month is not null and campaign_id is null
    when 'campaign' then campaign_id is not null and year is null and month is null
    when 'credit'   then member_id is not null and campaign_id is null and year is null and month is null
  end)
);
create unique index payment_allocations_month_uniq on public.payment_allocations (payment_id, member_id, year, month)
  where kind = 'months';
create index payment_allocations_payment_idx on public.payment_allocations (payment_id);
create index payment_allocations_member_idx on public.payment_allocations (member_id);
create index payment_allocations_campaign_idx on public.payment_allocations (campaign_id);

-- Paid months. Written ONLY by confirm_payment(); a month can be paid once (first confirmation
-- wins). Cancelling a confirmed payment stamps released_at, which frees the month.
create table public.payment_months (
  payment_id  uuid not null references public.payments (id),
  member_id   uuid not null references public.members (id),
  year        smallint not null,
  month       smallint not null check (month between 1 and 12),
  amount      integer not null check (amount > 0),
  created_at  timestamptz not null default now(),
  released_at timestamptz,
  primary key (payment_id, member_id, year, month)
);
create unique index payment_months_paid_once on public.payment_months (member_id, year, month)
  where released_at is null;
create index payment_months_period_idx on public.payment_months (year, month) where released_at is null;

/* ───────────────────────── money out ───────────────────────── */

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  spent_on      date not null,
  category      public.expense_category not null,
  campaign_id   uuid references public.campaigns (id),   -- null = paid from the main fund
  amount        integer not null check (amount > 0),
  note          text,
  receipt_path  text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id),
  cancelled_at  timestamptz,
  cancelled_by  uuid references auth.users (id),
  cancel_reason text,
  constraint expenses_cancel_reason check (cancelled_at is null or btrim(coalesce(cancel_reason, '')) <> '')
);
create index expenses_spent_on_idx on public.expenses (spent_on desc);
create index expenses_campaign_idx on public.expenses (campaign_id);
create index expenses_created_by_idx on public.expenses (created_by);
create index expenses_cancelled_by_idx on public.expenses (cancelled_by);

-- Campaign surplus moved to the main fund when a campaign closes.
create table public.transfers (
  id               uuid primary key default gen_random_uuid(),
  from_campaign_id uuid not null references public.campaigns (id),
  amount           integer not null check (amount > 0),
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id)
);
create index transfers_campaign_idx on public.transfers (from_campaign_id);
create index transfers_created_by_idx on public.transfers (created_by);

/* ───────────────────────── reminders + audit ───────────────────────── */

create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  kind        public.reminder_kind not null,
  member_id   uuid references public.members (id),       -- null for a group message
  campaign_id uuid references public.campaigns (id),
  payment_id  uuid references public.payments (id),      -- for 'receipt'
  channel     text not null default 'whatsapp',
  sent_at     timestamptz not null default now(),
  sent_by     uuid references auth.users (id)
);
create index reminders_member_idx on public.reminders (member_id, sent_at desc);
create index reminders_campaign_idx on public.reminders (campaign_id);
create index reminders_payment_idx on public.reminders (payment_id);
create index reminders_sent_by_idx on public.reminders (sent_by);

-- Who changed what and when. Column NAMES only, never values (phones stay out of the log).
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  actor_role text,
  action     text not null,
  table_name text not null,
  row_id     text,
  changed    text[]
);
create index audit_log_row_idx on public.audit_log (table_name, row_id);
create index audit_log_at_idx on public.audit_log (at desc);

-- FK indexes the tables above do not already cover
create index members_created_by_idx on public.members (created_by);
create index membership_periods_created_by_idx on public.membership_periods (created_by);
create index membership_periods_cancelled_by_idx on public.membership_periods (cancelled_by);
create index campaigns_created_by_idx on public.campaigns (created_by);
create index campaigns_closed_by_idx on public.campaigns (closed_by);
create index settings_updated_by_idx on public.settings (updated_by);
