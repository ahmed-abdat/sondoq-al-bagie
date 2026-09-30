-- ════════════════════════════════════════════════════════════════════════════════════════
-- M37 · archive for the owner-approved clean-up of test data (2026-09-30). Every row removed by
-- supabase/drafts/cleanup-2026-09-30.sql is copied here first (whole row as JSON), so nothing is
-- lost: server only, no API access, kept until the owner says otherwise.
-- Undo: supabase/rollback/m37_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

create table app_private.cleanup_archive (
  id          bigint generated always as identity primary key,
  batch       text not null,
  archived_at timestamptz not null default now(),
  table_name  text not null,
  row_data    jsonb not null
);
revoke all on app_private.cleanup_archive from public, anon, authenticated;
grant select on app_private.cleanup_archive to service_role;
