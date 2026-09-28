-- ════════════════════════════════════════════════════════════════════════════════════════
-- Sondoq al-Baqie M1 · 4/5 · grants, row-level security, proofs bucket, realtime
--
-- anon           → only the public views (no phones, no proofs, no base tables)
-- committee      → reads every table through RLS (active row in public.committee)
-- writes         → nobody writes tables directly; every change goes through an RPC (5/5)
-- ════════════════════════════════════════════════════════════════════════════════════════

/* ───────────────────────── privileges ───────────────────────── */

-- Supabase grants everything in public to anon/authenticated by default: take it all back.
revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;
revoke all on schema app_private from public;

grant usage on schema app_private to anon, authenticated, service_role;   -- functions only
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- committee reads (rows filtered by RLS below); no insert/update/delete for any API role
grant select on public.settings, public.groups, public.group_prices, public.members, public.membership_periods,
                public.committee, public.campaigns, public.campaign_participants, public.payments,
                public.payment_allocations, public.payment_months, public.expenses, public.transfers,
                public.reminders, public.audit_log
  to authenticated;

-- public views: anon and committee
grant select on public.member_status, public.member_months, public.fund_summary, public.monthly_collection,
                public.expense_totals, public.recent_expenses, public.campaign_progress, public.activity_feed
  to anon, authenticated;
grant select on public.arrears to authenticated;

grant execute on function
  app_private.public_member_status(), app_private.public_member_months(), app_private.public_fund_summary(),
  app_private.public_monthly_collection(), app_private.public_expense_totals(), app_private.public_recent_expenses(),
  app_private.public_campaign_progress(), app_private.public_activity_feed()
to anon, authenticated;

grant execute on function
  app_private.my_role(), app_private.is_committee(), app_private.is_admin(), app_private.can_confirm(),
  app_private.my_member_id(), app_private.member_owed_months(), app_private.member_rollup(), app_private.member_credit()
to authenticated;

grant execute on all functions in schema app_private to service_role;

/* ───────────────────────── RLS ───────────────────────── */

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    -- `(select fn())` → evaluated once per statement (initPlan), not once per row
    execute format('create policy committee_read on public.%I for select to authenticated using ((select app_private.is_committee()))', t);
  end loop;
end $$;

-- RLS is not FORCEd: SECURITY DEFINER RPCs and view functions run as the owner with their own checks.

/* ───────────────────────── private bucket for payment proofs and expense receipts ───────────────────────── */
-- Paths: payments/<payment_id>.<ext>  ·  expenses/<expense_id>.<ext>
-- The phone compresses to ≤ 300 KB before upload; 400 KB is the hard cap. No SVG/GIF/HEIC.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 409600, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "proofs: committee reads" on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and (select app_private.is_committee()));
create policy "proofs: committee uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (select app_private.is_committee())
              and (storage.foldername(name))[1] in ('payments', 'expenses'));
-- Intentionally absent: update/delete on 'proofs'. Proofs are never replaced or removed by the app.

/* ───────────────────────── realtime ───────────────────────── */
-- Live updates for the committee's pending queue (Realtime applies the RLS policy above).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.payments;
  end if;
end $$;
