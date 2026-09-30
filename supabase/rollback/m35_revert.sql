-- Undo m35 (accuracy_audit function): back to the m34 state. Run as postgres; also run first by m2_down.sql.
set client_min_messages = warning;
drop function if exists public.accuracy_audit(), app_private.accuracy_audit();
