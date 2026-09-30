-- Undo m37 (clean-up archive): drops the archive table (and whatever it holds). Run as postgres;
-- also run first by m2_down.sql.
set client_min_messages = warning;
drop table if exists app_private.cleanup_archive;
