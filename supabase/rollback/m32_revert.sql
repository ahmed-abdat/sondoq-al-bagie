-- Undo m32 (stats): the analytics functions go. Run as postgres; also run first by m2_down.sql.
set client_min_messages = warning;
drop function if exists public.report_fee_stats(integer), app_private.report_fee_stats(integer),
  public.report_levy_stats(uuid), app_private.report_levy_stats(uuid),
  public.report_donation_stats(uuid), app_private.report_donation_stats(uuid),
  app_private.current_group(uuid);
