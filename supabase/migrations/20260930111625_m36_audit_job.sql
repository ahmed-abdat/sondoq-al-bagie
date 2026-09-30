-- ════════════════════════════════════════════════════════════════════════════════════════
-- M36 · the daily accuracy check (/api/audit, Vercel cron) records its last run in job_runs,
-- like the weekly backup: job 'audit' (ok = every accuracy_audit() check passed; detail = the
-- failed check names, counts only). The committee reads it; only the server writes.
-- Undo: supabase/rollback/m36_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════

alter table public.job_runs drop constraint job_runs_job_check;
alter table public.job_runs add constraint job_runs_job_check check (job in ('backup', 'audit'));
