-- Undo m36 (audit job): job_runs takes 'backup' only again. The 'audit' row (the last daily check,
-- no member data) is removed first. Run as postgres; also run first by m2_down.sql.
set client_min_messages = warning;
delete from public.job_runs where job = 'audit';
alter table public.job_runs drop constraint if exists job_runs_job_check;
alter table public.job_runs add constraint job_runs_job_check check (job in ('backup'));
