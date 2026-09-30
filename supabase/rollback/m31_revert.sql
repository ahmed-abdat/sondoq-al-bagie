-- Undo m31 (reports): the report functions go. Run as postgres; also run first by m2_down.sql.
set client_min_messages = warning;
drop function if exists public.report_period(date, date), app_private.report_period(date, date),
  public.report_wallets(date, date), app_private.report_wallets(date, date),
  public.report_committee_work(date, date), app_private.report_committee_work(date, date);
