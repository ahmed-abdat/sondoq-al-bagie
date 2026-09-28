-- Owner decision: the admin may confirm and reject payments too (admin, treasurer, deputy).
-- Every other rule stays: nobody confirms a payment that covers their own membership
-- (committee.member_id), and a payment recorded by a confirmer is confirmed at once unless it
-- covers their own membership. Handover acceptance keeps its own two-person rule.
create or replace function app_private.can_confirm() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app_private.my_role() in ('admin', 'treasurer', 'deputy'), false) or app_private.is_server();
$$;
