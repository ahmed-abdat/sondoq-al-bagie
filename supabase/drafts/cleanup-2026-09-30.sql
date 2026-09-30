-- ════════════════════════════════════════════════════════════════════════════════════════
-- One-off clean-up of TEST data on production (owner decision 2026-09-30, relayed by the lead and
-- confirmed by AHMED in the Lane A session). NOT a migration: run ONCE with MCP execute_sql, after
--   1. m37 (app_private.cleanup_archive) is applied,
--   2. the first real backup exists (backups bucket + job_runs 'backup' ok).
-- One DO block = one transaction. It re-reads the live state and aborts (nothing written) when
-- anything differs from what the owner approved: exact ids, statuses, counts, balance.
-- Removes: A = the 13 payments cancelled with «تجربة» (+ allocations, month rows), B = the 2
-- cancelled expenses, the empty «تكريم» campaign, the 7 reminder rows, the revoked member link,
-- and the audit_log rows of all of these. Every removed row is copied to app_private.cleanup_archive
-- (batch 'cleanup-2026-09-30') first. Keeps: members, periods, paper payments, the 2 confirmed
-- payments of 2026-09-30 11:20/11:21 (C), settings, committee.
-- Ends with accuracy_audit() 28/28 and the fund balance unchanged, or it rolls back.
-- Proof images (12 files in `proofs`) are removed afterwards through Storage (dashboard), not here.
-- ════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  batch constant text := 'cleanup-2026-09-30';
  pay_ids constant uuid[] := array[
    '8bef9d90-9968-48f0-9dfb-35d7e2b31fdd', 'f50ca7c2-a386-4bcc-b241-41a7e7a1be27',
    'bfb5a3cc-5967-49f5-bab6-f2bfdc2c44fc', '4d80aa72-c043-4677-a690-8d13aa884c54',
    '88177c4e-2799-4038-bee3-ca4110d7fdfa', 'e1d2cdd0-9637-4a35-b68d-69c7b65d61db',
    'b6cf5d04-da0a-4f3b-98d7-70481cecfee8', 'b31d0568-3be6-4aca-8c35-eb96a2cd9a69',
    '4de3ca5b-4ced-4a7c-8623-bb8b08a56b8a', 'fb829333-4766-49e3-991a-199b3f1e4cf0',
    'f4c0f790-3156-4126-be3f-c1be57c9cb96', '8a9e5e9f-4754-4a69-92ce-edbd4cb07ba6',
    '6b2971e4-babe-409f-ab9f-5a20d4da7af4']::uuid[];
  exp_ids constant uuid[] := array['de7b5fc7-2530-4f91-9287-31e55bcdb717', '6efa357b-850d-473d-889d-ce5cfc85e8f0']::uuid[];
  camp_id constant uuid := '72ae423e-ab69-424d-87cc-7442fcfce563';
  link_id constant uuid := '3b0465c9-89d8-4fab-864a-ebe5669be090';
  tables constant text[] := array['payments', 'payment_allocations', 'payment_months', 'expenses', 'campaigns',
                                  'reminders', 'member_links', 'audit_log'];
  alloc_ids uuid[];
  rem_ids uuid[];
  row_ids text[];
  balance_before bigint;
  t text;
  n bigint;
  bad text;
begin
  -- ── 1 · the live state is exactly what was approved ──
  if (select count(*) from public.payments where id = any (pay_ids) and status = 'cancelled' and cancel_reason = 'تجربة') <> 13
  then raise exception 'abort: the 13 test payments are not all there, cancelled «تجربة»'; end if;
  select array_agg(id) into alloc_ids from public.payment_allocations where payment_id = any (pay_ids);
  if cardinality(alloc_ids) <> 152 then raise exception 'abort: % allocations, expected 152', cardinality(alloc_ids); end if;
  if (select count(*) from public.payment_months where payment_id = any (pay_ids)) <> 152
     or exists (select 1 from public.payment_months where payment_id = any (pay_ids) and released_at is null)
  then raise exception 'abort: test month rows are not the 152 released ones'; end if;
  if (select count(*) from public.expenses where id = any (exp_ids) and cancelled_at is not null) <> 2
  then raise exception 'abort: the 2 test expenses are not both there and cancelled'; end if;
  if not exists (select 1 from public.campaigns where id = camp_id and kind = 'donation' and status = 'closed')
     or exists (select 1 from public.payment_allocations where campaign_id = camp_id)
     or exists (select 1 from public.campaign_participants where campaign_id = camp_id)
     or exists (select 1 from public.expenses where campaign_id = camp_id)
     or exists (select 1 from public.transfers where from_campaign_id = camp_id)
     or exists (select 1 from public.reminders where campaign_id = camp_id)
  then raise exception 'abort: the «تكريم» campaign is not closed and empty'; end if;
  select array_agg(id) into rem_ids from public.reminders;
  if cardinality(rem_ids) <> 7 then raise exception 'abort: % reminder rows, expected 7', cardinality(rem_ids); end if;
  if (select count(*) from public.member_links) <> 1
     or not exists (select 1 from public.member_links where id = link_id and revoked_at is not null)
     or exists (select 1 from public.payments where submitted_via_link = link_id and not (id = any (pay_ids)))
  then raise exception 'abort: the member link is not the single revoked one used only by test payments'; end if;
  row_ids := array(select unnest(pay_ids)::text) || array(select unnest(alloc_ids)::text) || array(select unnest(exp_ids)::text)
             || array[camp_id::text, link_id::text] || array(select unnest(rem_ids)::text);
  if (select count(*) from public.audit_log where row_id = any (row_ids)
        and table_name in ('payments', 'payment_allocations', 'payment_months', 'expenses', 'campaigns', 'reminders', 'member_links')) <> 523
     or exists (select 1 from public.audit_log where row_id = any (row_ids)
        and table_name not in ('payments', 'payment_allocations', 'payment_months', 'expenses', 'campaigns', 'reminders', 'member_links'))
  then raise exception 'abort: audit rows of the test items are not the expected 523'; end if;
  select balance into balance_before from app_private.public_fund_summary();

  -- ── 2 · archive every row first ──
  insert into app_private.cleanup_archive (batch, table_name, row_data)
  select batch, 'audit_log', to_jsonb(l) from public.audit_log l where l.row_id = any (row_ids)
  union all select batch, 'payment_months', to_jsonb(pm) from public.payment_months pm where pm.payment_id = any (pay_ids)
  union all select batch, 'payment_allocations', to_jsonb(a) from public.payment_allocations a where a.payment_id = any (pay_ids)
  union all select batch, 'payments', to_jsonb(p) from public.payments p where p.id = any (pay_ids)
  union all select batch, 'expenses', to_jsonb(e) from public.expenses e where e.id = any (exp_ids)
  union all select batch, 'campaigns', to_jsonb(c) from public.campaigns c where c.id = camp_id
  union all select batch, 'reminders', to_jsonb(r) from public.reminders r
  union all select batch, 'member_links', to_jsonb(m) from public.member_links m where m.id = link_id
  union all select batch, 'storage.objects', jsonb_build_object('bucket_id', o.bucket_id, 'name', o.name, 'metadata', o.metadata)
            from storage.objects o where o.bucket_id = 'proofs'
              and o.name in (select p.proof_path from public.payments p where p.id = any (pay_ids));
  get diagnostics n = row_count;
  if n <> 523 + 152 + 152 + 13 + 2 + 1 + 7 + 1 + 12 then raise exception 'abort: archived % rows, expected 863', n; end if;

  -- ── 3 · delete, children first; guards and audit triggers off inside this transaction only ──
  foreach t in array tables loop execute format('alter table public.%I disable trigger user', t); end loop;
  delete from public.audit_log where row_id = any (row_ids);
  delete from public.payment_months where payment_id = any (pay_ids);
  delete from public.payment_allocations where payment_id = any (pay_ids);
  delete from public.payments where id = any (pay_ids);
  delete from public.member_links where id = link_id;
  delete from public.expenses where id = any (exp_ids);
  delete from public.campaigns where id = camp_id;
  delete from public.reminders where id = any (rem_ids);
  foreach t in array tables loop execute format('alter table public.%I enable trigger user', t); end loop;

  -- ── 4 · nothing else moved; every number still adds up ──
  if (select balance from app_private.public_fund_summary()) <> balance_before
  then raise exception 'abort: the fund balance changed'; end if;
  select string_agg(check_name, '; ') into bad from app_private.accuracy_audit() where ok is not true;
  if bad is not null or (select count(*) from app_private.accuracy_audit()) <> 28
  then raise exception 'abort: accuracy audit not 28/28: %', bad; end if;
  raise notice 'cleanup done: 863 rows archived and removed; balance % unchanged; audit 28/28', balance_before;
end $$;
