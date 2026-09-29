-- ════════════════════════════════════════════════════════════════════════════════════════
-- M16 · backup from one snapshot, and its last result visible to the committee (audit D1/D2).
--
-- D1: the weekly backup read each table page by page without ORDER BY and without one snapshot, so
--     a table over 1000 rows (audit_log already) could come back with rows skipped or repeated.
--     `backup_snapshot(tables)` returns every listed table in one statement: a STABLE function sees
--     the snapshot of the calling query, so all tables are read at the same instant. Service role
--     only (the backup route); SECURITY INVOKER, so it reads with the caller's own rights.
-- D2: a failed backup was only a server log line. `job_runs` keeps the last run of each job
--     (written by the route with the secret key); the committee reads it. Operational state, not
--     fund data: plain upserts, no append-only guard, not in the backup file.
-- ════════════════════════════════════════════════════════════════════════════════════════

create function public.backup_snapshot(p_tables text[]) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  t text;
  rows jsonb;
  result jsonb := '{}'::jsonb;
begin
  if not app_private.is_server() then perform app_private.fail('not_allowed'); end if;
  foreach t in array coalesce(p_tables, '{}') loop
    if not exists (select 1 from pg_catalog.pg_tables where schemaname = 'public' and tablename = t) then
      perform app_private.fail('invalid_input');
    end if;
    execute format('select coalesce(jsonb_agg(x), ''[]''::jsonb) from public.%I x', t) into rows;
    result := result || jsonb_build_object(t, rows);
  end loop;
  return result;
end $$;
revoke all on function public.backup_snapshot(text[]) from public, anon, authenticated;
grant execute on function public.backup_snapshot(text[]) to service_role;

create table public.job_runs (
  job         text primary key check (job in ('backup')),
  last_run_at timestamptz not null,
  ok          boolean not null,
  detail      text,          -- file path when ok, a short error otherwise
  last_ok_at  timestamptz
);
alter table public.job_runs enable row level security;
create policy committee_read on public.job_runs for select to authenticated
  using ((select app_private.is_committee()));
revoke all on public.job_runs from public, anon, authenticated;
grant select on public.job_runs to authenticated;
grant all on public.job_runs to service_role;
