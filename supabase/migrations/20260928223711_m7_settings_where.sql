-- Fix: pg_safeupdate (loaded in PostgREST sessions on Supabase) rejects UPDATE/DELETE without a
-- WHERE clause, so update_settings failed from the app ("UPDATE requires a WHERE clause"). The
-- settings table has one row whose primary key `id` is always true: target it explicitly.
create or replace function public.update_settings(
  p_opening_balance integer default null, p_opening_balance_on date default null,
  p_grace_days integer default null, p_show_amount_owed boolean default null,
  p_whatsapp_contact text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform app_private.require_admin();
  perform app_private.set_action('update_settings');
  update public.settings set
    opening_balance    = coalesce(p_opening_balance, opening_balance),
    opening_balance_on = coalesce(p_opening_balance_on, opening_balance_on),
    grace_days         = coalesce(p_grace_days, grace_days),
    show_amount_owed   = coalesce(p_show_amount_owed, show_amount_owed),
    whatsapp_contact   = case when p_whatsapp_contact is null then whatsapp_contact
                              else nullif(regexp_replace(p_whatsapp_contact, '[\s-]', '', 'g'), '') end,
    updated_at = now(), updated_by = auth.uid()
  where id;   -- the singleton row (PostgREST sessions load pg_safeupdate: no UPDATE without WHERE)
end $$;
