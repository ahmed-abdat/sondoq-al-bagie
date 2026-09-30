-- Accuracy audit (owner priority #1, docs/COMMITTEE-ONLY-PLAN.md §12.1). READ-ONLY, safe on
-- production (MCP execute_sql / psql as postgres). The checks live in app_private.accuracy_audit()
-- (migration m35): every figure the app shows is recomputed from the base tables and compared.
-- One row per check (check, ok, detail). Anything not ok is a wrong number somewhere: report it,
-- never "fix" data here. Also run by run.sh (local/accuracy_audit_checks.sql) and, on the e2e
-- stack after the flows, by supabase/tests/e2e/audit.sh.
select a.check_name as check, a.ok, a.detail from app_private.accuracy_audit() a;
