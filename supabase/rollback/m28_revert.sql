-- Undo m28 (committee_only): back to the m27 state. Every definition below is the exact text of
-- the migration that made it (m7/m13 verify_receipt, m24/m25 member links). Run as postgres.
-- Also run first by supabase/rollback/m2_down.sql (run.sh checks it). The audit rows m28 wrote stay.
set client_min_messages = warning;

-- strangers read the public views again
grant select on public.fund_stats, public.activity_public, public.campaigns_public, public.expenses_public,
  public.terms_info, public.campaign_contributors_public, public.member_status_public, public.fund_info,
  public.fund_accounts_public, public.group_prices_public, public.member_months
to anon;
do $$
declare
  f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'app_private' and p.proname like 'public\_%' loop
    execute format('grant execute on function %s to anon', f);
  end loop;
end $$;

-- receipt check (m7 body, moved to app_private by m13, + m13 wrapper and grants)
create function app_private.verify_receipt(p_code text) returns jsonb
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
        select jsonb_agg(jsonb_build_object('list_code', x.list_code, 'number', x.number, 'full_name', x.full_name, 'months', x.months)
                  order by x.list_code, x.number)
        from (select m.list_code, m.number, m.full_name,
                     coalesce(jsonb_agg(jsonb_build_object('year', a.year, 'month', a.month) order by a.year, a.month)
                              filter (where a.kind = 'months'), '[]'::jsonb) as months
              from public.payment_allocations a join public.members m on m.id = a.member_id
              where a.payment_id = p.id
              group by m.list_code, m.number, m.full_name) x), '[]'::jsonb),
      'campaign_titles', coalesce((
        select jsonb_agg(distinct c.title) from public.payment_allocations a join public.campaigns c on c.id = a.campaign_id
        where a.payment_id = p.id), '[]'::jsonb))
    from public.payments p left join public.committee c on c.user_id = p.decided_by
    where p.receipt_code = upper(btrim(p_code)) and p.status in ('confirmed', 'cancelled')),
    jsonb_build_object('status', 'not_found'));
$$;
create function public.verify_receipt(p_code text) returns jsonb
language sql stable security invoker set search_path = '' as $$ select app_private.verify_receipt(p_code => p_code) $$;
revoke all on function app_private.verify_receipt(p_code text) from public;
grant execute on function app_private.verify_receipt(p_code text) to anon, authenticated, service_role;
revoke all on function public.verify_receipt(p_code text) from public, anon, authenticated;
grant execute on function public.verify_receipt(p_code text) to anon, authenticated, service_role;

-- member devices for push (m24 table + m25 constraint change)
create table public.member_push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  link_id    uuid not null references public.member_links (id),
  endpoint   text not null unique check (endpoint ~ '^https://'),
  p256dh     text not null,
  auth       text not null,
  failures   integer not null default 0,
  created_at timestamptz not null default now()
);
create index member_push_subscriptions_link_idx on public.member_push_subscriptions (link_id);
alter table public.member_push_subscriptions enable row level security;
revoke all on public.member_push_subscriptions from public, anon, authenticated;
grant all on public.member_push_subscriptions to service_role;
alter table public.member_push_subscriptions drop constraint member_push_subscriptions_endpoint_key;
alter table public.member_push_subscriptions
  add constraint member_push_subscriptions_link_endpoint_key unique (link_id, endpoint);
create index member_push_subscriptions_endpoint_idx on public.member_push_subscriptions (endpoint);

-- member-link helpers and RPCs (m24, save_push/sessions as changed by m25)
-- The active link for a token hash (null when unknown or revoked). Server only.
create function app_private.member_link_for(p_token_hash text) returns public.member_links
language sql stable security definer set search_path = '' as $$
  select l.* from public.member_links l where l.token_hash = lower(p_token_hash) and l.revoked_at is null;
$$;

create function app_private.require_server() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not app_private.is_server() then perform app_private.fail('not_allowed'); end if;
end $$;

/* ───────────────────────── committee: links ───────────────────────── */

-- Any active committee member. Revokes the member's current link, stores the new hash, returns its id.
create function app_private.create_member_link(p_member_id uuid, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  lid uuid;
begin
  perform app_private.require_committee();
  if p_token_hash is null or lower(p_token_hash) !~ '^[0-9a-f]{64}$' then perform app_private.fail('invalid_input'); end if;
  if not exists (select 1 from public.members where id = p_member_id) then perform app_private.fail('not_found'); end if;
  perform app_private.set_action('create_member_link');
  update public.member_links set revoked_at = now(), revoked_by = auth.uid()
  where member_id = p_member_id and revoked_at is null;
  insert into public.member_links (member_id, token_hash, created_by)
  values (p_member_id, lower(p_token_hash), auth.uid())
  returning id into lid;
  insert into public.audit_log (actor, actor_role, action, table_name, row_id, changed)
  values (auth.uid(), coalesce(app_private.my_role()::text, current_user), 'create_member_link', 'member_links',
          lid::text, null);
  return lid;
end $$;

create function app_private.revoke_member_link(p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  lid uuid;
begin
  perform app_private.require_committee();
  perform app_private.set_action('revoke_member_link');
  update public.member_links set revoked_at = now(), revoked_by = auth.uid()
  where member_id = p_member_id and revoked_at is null
  returning id into lid;
  if lid is not null then
    insert into public.audit_log (actor, actor_role, action, table_name, row_id, changed)
    values (auth.uid(), coalesce(app_private.my_role()::text, current_user), 'revoke_member_link', 'member_links',
            lid::text, null);
  end if;
end $$;

-- Committee view of active links (never the hash).
create function app_private.member_links_admin()
returns table (member_id uuid, created_at timestamptz, last_used_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.member_id, l.created_at, l.last_used_at
  from public.member_links l
  where l.revoked_at is null and app_private.is_committee();
$$;
create view public.member_links_admin with (security_invoker = true) as
  select * from app_private.member_links_admin();
revoke all on public.member_links_admin from public, anon, authenticated;
grant select on public.member_links_admin to authenticated, service_role;

-- The member summary for «أنت», or null. Touches last_used_at at most hourly.
create function app_private.member_session(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.member_links;
  r record;
begin
  perform app_private.require_server();
  l := app_private.member_link_for(p_token_hash);
  if l.id is null then return null; end if;
  if l.last_used_at is null or l.last_used_at < now() - interval '1 hour' then
    update public.member_links set last_used_at = now() where id = l.id;
  end if;
  select m.id, m.list_code, m.number, m.full_name, ro.group_code, ro.member_status, ro.months_behind, ro.amount_owed,
         coalesce(o.months, '{}') as late, coalesce(c.credit, 0) as credit
  into r
  from public.members m
  join app_private.member_rollup() ro on ro.member_id = m.id
  left join app_private.member_owed_months() o on o.member_id = m.id
  left join app_private.member_credit() c on c.member_id = m.id
  where m.id = l.member_id;
  return jsonb_build_object(
    'link_id', l.id, 'member_id', r.id, 'member_ref', r.list_code || '-' || r.number, 'list_code', r.list_code,
    'number', r.number, 'full_name', r.full_name, 'group_code', r.group_code, 'status', r.member_status,
    'months_behind', r.months_behind, 'amount_owed', r.amount_owed, 'late_months', to_jsonb(r.late),
    'credit', greatest(r.credit, 0));
end $$;

-- «دفعاتي»: payments covering the member, and payments sent through their links. Newest first, 100.
create function app_private.member_history(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.member_links;
begin
  perform app_private.require_server();
  l := app_private.member_link_for(p_token_hash);
  if l.id is null then perform app_private.fail('member_link_invalid'); end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'status', p.status, 'amount', p.amount, 'method', p.method, 'paid_on', p.paid_on,
             'created_at', p.created_at, 'decided_at', p.decided_at, 'receipt_code', p.receipt_code,
             'reject_reason', p.reject_reason, 'payer_name', p.payer_name,
             'sent_by_me', p.mine_link, 'for_me', p.for_me,
             'allocations', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'kind', a.kind, 'member_id', a.member_id,
                        'member_ref', case when m.id is not null then m.list_code || '-' || m.number end,
                        'full_name', m.full_name, 'year', a.year, 'month', a.month, 'amount', a.amount,
                        'campaign_title', c.title)
                      order by m.list_code, m.number, a.year, a.month)
               from public.payment_allocations a
               left join public.members m on m.id = a.member_id
               left join public.campaigns c on c.id = a.campaign_id
               where a.payment_id = p.id), '[]'::jsonb))
           order by p.created_at desc)
    from (
      select x.*,
             coalesce(x.submitted_via_link in (select k.id from public.member_links k where k.member_id = l.member_id), false)
               as mine_link,
             exists (select 1 from public.payment_allocations a where a.payment_id = x.id and a.member_id = l.member_id)
               as for_me
      from public.payments x
      where x.submitted_via_link in (select k.id from public.member_links k where k.member_id = l.member_id)
         or exists (select 1 from public.payment_allocations a where a.payment_id = x.id and a.member_id = l.member_id)
      order by x.created_at desc
      limit 100
    ) p), '[]'::jsonb);
end $$;

-- «دفعت لهم سابقًا»: members covered by submissions through this member's links, newest first.
create function app_private.member_recent_beneficiaries(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  l public.member_links;
begin
  perform app_private.require_server();
  l := app_private.member_link_for(p_token_hash);
  if l.id is null then perform app_private.fail('member_link_invalid'); end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('member_id', b.id, 'member_ref', b.ref, 'full_name', b.full_name) order by b.last desc)
    from (
      select m.id, m.list_code || '-' || m.number as ref, m.full_name, max(p.created_at) as last
      from public.payments p
      join public.member_links k on k.id = p.submitted_via_link and k.member_id = l.member_id
      join public.payment_allocations a on a.payment_id = p.id and a.member_id is not null
      join public.members m on m.id = a.member_id
      where p.status in ('pending', 'confirmed') and m.id <> l.member_id
      group by m.id, m.list_code, m.number, m.full_name
      order by max(p.created_at) desc
      limit 12
    ) b), '[]'::jsonb);
end $$;

/* ───────────────────────── server-only: member writes ───────────────────────── */

-- Always pending. Same checks as record_payment (m23) plus link, proof and rate limits.
create function app_private.member_submit_payment(
  p_token_hash text, p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date,
  p_allocations jsonb, p_txn_ref text default null, p_proof_path text default null, p_proof_hash text default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.member_links;
  existing public.payments;
  paid record;
  overlap boolean;
begin
  perform app_private.require_server();
  l := app_private.member_link_for(p_token_hash);
  if l.id is null then perform app_private.fail('member_link_invalid'); end if;
  perform 1 from public.member_links where id = l.id for update;   -- serialise this link's submissions

  select * into existing from public.payments where id = p_id;
  if existing.id is not null then
    if existing.submitted_via_link is distinct from l.id then perform app_private.fail('id_taken'); end if;
    return jsonb_build_object('id', existing.id, 'status', existing.status, 'replay', true, 'pending_overlap', false);
  end if;
  if p_method::text in ('paper', 'credit') then perform app_private.fail('invalid_input'); end if;
  if p_proof_path is null or p_proof_hash is null then perform app_private.fail('proof_required'); end if;
  if p_proof_path !~ ('^payments/' || p_id::text || '-[0-9a-f]{12}\.(jpg|png|webp)$') then
    perform app_private.fail('invalid_input');
  end if;
  if (select count(*) from public.payments where submitted_via_link = l.id and status = 'pending') >= 5
     or (select count(*) from public.payments where submitted_via_link = l.id and created_at > now() - interval '1 day') >= 10 then
    perform app_private.fail('member_rate_limited');
  end if;
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
  if exists (select 1 from public.payments x where x.proof_hash = lower(p_proof_hash) and x.status in ('pending', 'confirmed')) then
    perform app_private.fail('duplicate_proof');
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

  perform app_private.set_action('member_submit_payment');
  insert into public.payments (id, payer_name, method, amount, paid_on, txn_ref, proof_path, proof_hash, note,
                               submitted_via_link)
  values (p_id, btrim(p_payer_name), p_method, p_amount, p_paid_on, nullif(btrim(p_txn_ref), ''), p_proof_path,
          lower(p_proof_hash), nullif(btrim(p_note), ''), l.id);
  insert into public.payment_allocations (payment_id, kind, member_id, campaign_id, year, month, amount)
  select p_id, a.kind, a.member_id, a.campaign_id, a.year, a.month, a.amount
  from jsonb_to_recordset(p_allocations)
       a(kind public.allocation_kind, member_id uuid, campaign_id uuid, year smallint, month smallint, amount integer);
  if p_amount <> (select sum(a.amount) from public.payment_allocations a where a.payment_id = p_id) then
    perform app_private.fail('allocations_mismatch');
  end if;
  return jsonb_build_object('id', p_id, 'status', 'pending', 'replay', false, 'pending_overlap', overlap);
end $$;

create function app_private.member_delete_push(p_token_hash text, p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.member_links;
begin
  perform app_private.require_server();
  l := app_private.member_link_for(p_token_hash);
  if l.id is null then return; end if;
  delete from public.member_push_subscriptions where endpoint = btrim(p_endpoint) and link_id = l.id;
end $$;

create function public.create_member_link(p_member_id uuid, p_token_hash text) returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.create_member_link(p_member_id => p_member_id, p_token_hash => p_token_hash)
$$;
create function public.revoke_member_link(p_member_id uuid) returns void
language sql security invoker set search_path = '' as $$
  select app_private.revoke_member_link(p_member_id => p_member_id)
$$;
create function public.member_session(p_token_hash text) returns jsonb
language sql security invoker set search_path = '' as $$
  select app_private.member_session(p_token_hash => p_token_hash)
$$;
create function public.member_history(p_token_hash text) returns jsonb
language sql security invoker set search_path = '' as $$
  select app_private.member_history(p_token_hash => p_token_hash)
$$;
create function public.member_recent_beneficiaries(p_token_hash text) returns jsonb
language sql security invoker set search_path = '' as $$
  select app_private.member_recent_beneficiaries(p_token_hash => p_token_hash)
$$;
create function public.member_submit_payment(
  p_token_hash text, p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date,
  p_allocations jsonb, p_txn_ref text default null, p_proof_path text default null, p_proof_hash text default null,
  p_note text default null
) returns jsonb
language sql security invoker set search_path = '' as $$
  select app_private.member_submit_payment(
    p_token_hash => p_token_hash, p_id => p_id, p_payer_name => p_payer_name, p_method => p_method, p_amount => p_amount,
    p_paid_on => p_paid_on, p_allocations => p_allocations, p_txn_ref => p_txn_ref, p_proof_path => p_proof_path,
    p_proof_hash => p_proof_hash, p_note => p_note)
$$;
create function public.member_delete_push(p_token_hash text, p_endpoint text) returns void
language sql security invoker set search_path = '' as $$
  select app_private.member_delete_push(p_token_hash => p_token_hash, p_endpoint => p_endpoint)
$$;

-- committee RPCs: authenticated (the body checks the committee); member RPCs: service role only
revoke all on function app_private.create_member_link(uuid, text), app_private.revoke_member_link(uuid),
  public.create_member_link(uuid, text), public.revoke_member_link(uuid) from public, anon, authenticated;
grant execute on function app_private.create_member_link(uuid, text), app_private.revoke_member_link(uuid),
  public.create_member_link(uuid, text), public.revoke_member_link(uuid) to authenticated, service_role;
revoke all on function
  app_private.member_link_for(text), app_private.require_server(), app_private.member_links_admin(),
  app_private.member_session(text), app_private.member_history(text), app_private.member_recent_beneficiaries(text),
  app_private.member_submit_payment(text, uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text),
  app_private.member_delete_push(text, text),
  public.member_session(text), public.member_history(text), public.member_recent_beneficiaries(text),
  public.member_submit_payment(text, uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text),
  public.member_delete_push(text, text)
from public, anon, authenticated;
grant execute on function app_private.member_links_admin() to authenticated, service_role;
grant execute on function
  app_private.member_link_for(text), app_private.require_server(),
  app_private.member_session(text), app_private.member_history(text), app_private.member_recent_beneficiaries(text),
  app_private.member_submit_payment(text, uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text),
  app_private.member_delete_push(text, text),
  public.member_session(text), public.member_history(text), public.member_recent_beneficiaries(text),
  public.member_submit_payment(text, uuid, text, public.payment_method, integer, date, jsonb, text, text, text, text),
  public.member_delete_push(text, text)
to service_role;

create function app_private.member_sessions(p_token_hashes text[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.require_server();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'token_hash', l.token_hash, 'link_id', l.id, 'member_id', m.id,
             'member_ref', m.list_code || '-' || m.number, 'full_name', m.full_name))
    from public.member_links l join public.members m on m.id = l.member_id
    where l.revoked_at is null
      and l.token_hash = any (select lower(h) from unnest(coalesce(p_token_hashes, '{}')) h limit 10)), '[]'::jsonb);
end $$;
create function public.member_sessions(p_token_hashes text[]) returns jsonb
language sql security invoker set search_path = '' as $$
  select app_private.member_sessions(p_token_hashes => p_token_hashes)
$$;
-- Saves this device for every valid link among p_token_hashes (the device's saved profiles).
-- Returns how many profiles now notify this device.
create function app_private.member_save_push(p_token_hashes text[], p_endpoint text, p_p256dh text, p_auth text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  perform app_private.require_server();
  if btrim(coalesce(p_endpoint, '')) !~ '^https://' or btrim(coalesce(p_p256dh, '')) = '' or btrim(coalesce(p_auth, '')) = '' then
    perform app_private.fail('invalid_input');
  end if;
  insert into public.member_push_subscriptions (link_id, endpoint, p256dh, auth)
  select l.id, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth)
  from public.member_links l
  where l.revoked_at is null
    and l.token_hash = any (select lower(h) from unnest(coalesce(p_token_hashes, '{}')) h limit 10)
  on conflict (link_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, failures = 0;
  get diagnostics n = row_count;
  if n = 0 then perform app_private.fail('member_link_invalid'); end if;
  return n;
end $$;
create function public.member_save_push(p_token_hashes text[], p_endpoint text, p_p256dh text, p_auth text)
returns integer
language sql security invoker set search_path = '' as $$
  select app_private.member_save_push(p_token_hashes => p_token_hashes, p_endpoint => p_endpoint,
                                      p_p256dh => p_p256dh, p_auth => p_auth)
$$;

revoke all on function app_private.member_sessions(text[]), public.member_sessions(text[]),
  app_private.member_save_push(text[], text, text, text), public.member_save_push(text[], text, text, text)
from public, anon, authenticated;
grant execute on function app_private.member_sessions(text[]), public.member_sessions(text[]),
  app_private.member_save_push(text[], text, text, text), public.member_save_push(text[], text, text, text)
to service_role;

-- {member_ref, full_name} of a link's member for the queue (committee cannot read member_links).
create function app_private.link_member(p_link uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('member_ref', m.list_code || '-' || m.number, 'full_name', m.full_name)
  from public.member_links l join public.members m on m.id = l.member_id
  where l.id = p_link and app_private.is_committee();
$$;
revoke all on function app_private.link_member(uuid) from public, anon;
grant execute on function app_private.link_member(uuid) to authenticated, service_role;

-- m7 view + submitted_by_member ({member_ref, full_name} of the link's member) at the end.
create or replace view public.payment_queue with (security_invoker = true) as
  select p.id, p.status, p.payer_name, p.method, p.amount, p.paid_on, p.txn_ref, p.proof_path, p.note,
         p.created_at, p.created_by, rc.display_name as created_by_name,
         p.decided_at, p.decided_by, dc.display_name as decided_by_name,
         p.reject_reason, p.cancelled_at, p.cancel_reason,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'kind', a.kind, 'member_id', a.member_id, 'list_code', m.list_code, 'number', m.number, 'full_name', m.full_name,
                    'campaign_id', a.campaign_id, 'year', a.year, 'month', a.month, 'amount', a.amount)
                  order by m.list_code, m.number, a.year, a.month)
           from public.payment_allocations a left join public.members m on m.id = a.member_id
           where a.payment_id = p.id), '[]'::jsonb) as allocations,
         p.receipt_code,
         case when p.receipt_seq is not null then p.receipt_year || '-' || lpad(p.receipt_seq::text, 4, '0') end as receipt_no,
         app_private.link_member(p.submitted_via_link) as submitted_by_member
  from public.payments p
  left join public.committee rc on rc.user_id = p.created_by
  left join public.committee dc on dc.user_id = p.decided_by;

-- the link m28 revoked is active again (revoked_at is stamp-once: lift the guard for this update)
alter table public.member_links disable trigger a_guard;
update public.member_links set revoked_at = null, revoked_by = null
where id in (select row_id::uuid from public.audit_log where action = 'retire_member_links');
alter table public.member_links enable trigger a_guard;
