-- M13 · Security advisor clean-up (lints 0028/0029), no behaviour change. Every SECURITY DEFINER
-- RPC moves to app_private (not exposed by the API; body, owner, search_path and grants kept),
-- and public keeps a thin SECURITY INVOKER wrapper with the same name, parameters, defaults and
-- return type, so PostgREST /rest/v1/rpc/<name> and the app are unchanged. Callers still need
-- EXECUTE on both (authenticated; anon only for verify_receipt), and the definer function keeps
-- re-checking the committee role inside. Wrappers run with the caller's role, so is_server() and
-- auth.uid() see exactly what they saw before.

alter function public.accept_handover(p_id uuid, p_new_term_title text) set schema app_private;
create function public.accept_handover(p_id uuid, p_new_term_title text DEFAULT NULL::text) returns smallint
language sql security invoker set search_path = '' as $$ select app_private.accept_handover(p_id => p_id, p_new_term_title => p_new_term_title) $$;

alter function public.add_fund_account(p_method public.payment_method, p_account_number text, p_holder_name text, p_note text, p_sort_order integer) set schema app_private;
create function public.add_fund_account(p_method public.payment_method, p_account_number text, p_holder_name text, p_note text DEFAULT NULL::text, p_sort_order integer DEFAULT 0) returns uuid
language sql security invoker set search_path = '' as $$ select app_private.add_fund_account(p_method => p_method, p_account_number => p_account_number, p_holder_name => p_holder_name, p_note => p_note, p_sort_order => p_sort_order) $$;

alter function public.add_member(p_number integer, p_full_name text, p_group_code text, p_from_month date, p_phone text, p_note text, p_status public.membership_status, p_list_code text) set schema app_private;
create function public.add_member(p_number integer, p_full_name text, p_group_code text, p_from_month date, p_phone text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_status public.membership_status DEFAULT 'active'::public.membership_status, p_list_code text DEFAULT NULL::text) returns uuid
language sql security invoker set search_path = '' as $$ select app_private.add_member(p_number => p_number, p_full_name => p_full_name, p_group_code => p_group_code, p_from_month => p_from_month, p_phone => p_phone, p_note => p_note, p_status => p_status, p_list_code => p_list_code) $$;

alter function public.cancel_expense(p_expense_id uuid, p_reason text) set schema app_private;
create function public.cancel_expense(p_expense_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app_private.cancel_expense(p_expense_id => p_expense_id, p_reason => p_reason) $$;

alter function public.cancel_handover(p_id uuid, p_reason text) set schema app_private;
create function public.cancel_handover(p_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app_private.cancel_handover(p_id => p_id, p_reason => p_reason) $$;

alter function public.cancel_payment(p_payment_id uuid, p_reason text) set schema app_private;
create function public.cancel_payment(p_payment_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app_private.cancel_payment(p_payment_id => p_payment_id, p_reason => p_reason) $$;

alter function public.change_member_group(p_member_id uuid, p_from_month date, p_group_code text, p_reason text) set schema app_private;
create function public.change_member_group(p_member_id uuid, p_from_month date, p_group_code text, p_reason text DEFAULT 'تغيير المجموعة'::text) returns uuid
language sql security invoker set search_path = '' as $$ select app_private.change_member_group(p_member_id => p_member_id, p_from_month => p_from_month, p_group_code => p_group_code, p_reason => p_reason) $$;

alter function public.change_member_status(p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text) set schema app_private;
create function public.change_member_status(p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text DEFAULT NULL::text) returns uuid
language sql security invoker set search_path = '' as $$ select app_private.change_member_status(p_member_id => p_member_id, p_from_month => p_from_month, p_status => p_status, p_reason => p_reason, p_group_code => p_group_code) $$;

alter function public.close_campaign(p_id uuid, p_surplus_action public.surplus_action) set schema app_private;
create function public.close_campaign(p_id uuid, p_surplus_action public.surplus_action) returns integer
language sql security invoker set search_path = '' as $$ select app_private.close_campaign(p_id => p_id, p_surplus_action => p_surplus_action) $$;

alter function public.confirm_payment(p_payment_id uuid) set schema app_private;
create function public.confirm_payment(p_payment_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select app_private.confirm_payment(p_payment_id => p_payment_id) $$;

alter function public.create_campaign(p_id uuid, p_title text, p_amount_mode public.campaign_mode, p_purpose text, p_target_amount integer, p_deadline date, p_participants jsonb) set schema app_private;
create function public.create_campaign(p_id uuid, p_title text, p_amount_mode public.campaign_mode DEFAULT 'open'::public.campaign_mode, p_purpose text DEFAULT NULL::text, p_target_amount integer DEFAULT NULL::integer, p_deadline date DEFAULT NULL::date, p_participants jsonb DEFAULT NULL::jsonb) returns uuid
language sql security invoker set search_path = '' as $$ select app_private.create_campaign(p_id => p_id, p_title => p_title, p_amount_mode => p_amount_mode, p_purpose => p_purpose, p_target_amount => p_target_amount, p_deadline => p_deadline, p_participants => p_participants) $$;

alter function public.delete_committee_member(p_user_id uuid) set schema app_private;
create function public.delete_committee_member(p_user_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app_private.delete_committee_member(p_user_id => p_user_id) $$;

alter function public.delete_push_subscription(p_endpoint text) set schema app_private;
create function public.delete_push_subscription(p_endpoint text) returns void
language sql security invoker set search_path = '' as $$ select app_private.delete_push_subscription(p_endpoint => p_endpoint) $$;

alter function public.log_reminder(p_kind public.reminder_kind, p_member_id uuid, p_campaign_id uuid, p_payment_id uuid) set schema app_private;
create function public.log_reminder(p_kind public.reminder_kind, p_member_id uuid DEFAULT NULL::uuid, p_campaign_id uuid DEFAULT NULL::uuid, p_payment_id uuid DEFAULT NULL::uuid) returns uuid
language sql security invoker set search_path = '' as $$ select app_private.log_reminder(p_kind => p_kind, p_member_id => p_member_id, p_campaign_id => p_campaign_id, p_payment_id => p_payment_id) $$;

alter function public.next_member_number(p_list_code text) set schema app_private;
create function public.next_member_number(p_list_code text) returns integer
language sql stable security invoker set search_path = '' as $$ select app_private.next_member_number(p_list_code => p_list_code) $$;

alter function public.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text, p_campaign_id uuid, p_receipt_path text) set schema app_private;
create function public.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text DEFAULT NULL::text, p_campaign_id uuid DEFAULT NULL::uuid, p_receipt_path text DEFAULT NULL::text) returns uuid
language sql security invoker set search_path = '' as $$ select app_private.record_expense(p_id => p_id, p_spent_on => p_spent_on, p_category => p_category, p_amount => p_amount, p_note => p_note, p_campaign_id => p_campaign_id, p_receipt_path => p_receipt_path) $$;

alter function public.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text, p_proof_path text, p_proof_hash text, p_note text) set schema app_private;
create function public.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text DEFAULT NULL::text, p_proof_path text DEFAULT NULL::text, p_proof_hash text DEFAULT NULL::text, p_note text DEFAULT NULL::text) returns jsonb
language sql security invoker set search_path = '' as $$ select app_private.record_payment(p_id => p_id, p_payer_name => p_payer_name, p_method => p_method, p_amount => p_amount, p_paid_on => p_paid_on, p_allocations => p_allocations, p_txn_ref => p_txn_ref, p_proof_path => p_proof_path, p_proof_hash => p_proof_hash, p_note => p_note) $$;

alter function public.reject_payment(p_payment_id uuid, p_reason text) set schema app_private;
create function public.reject_payment(p_payment_id uuid, p_reason text) returns void
language sql security invoker set search_path = '' as $$ select app_private.reject_payment(p_payment_id => p_payment_id, p_reason => p_reason) $$;

alter function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) set schema app_private;
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL::text) returns void
language sql security invoker set search_path = '' as $$ select app_private.save_push_subscription(p_endpoint => p_endpoint, p_p256dh => p_p256dh, p_auth => p_auth, p_user_agent => p_user_agent) $$;

alter function public.set_committee_active(p_user_id uuid, p_active boolean) set schema app_private;
create function public.set_committee_active(p_user_id uuid, p_active boolean) returns void
language sql security invoker set search_path = '' as $$ select app_private.set_committee_active(p_user_id => p_user_id, p_active => p_active) $$;

alter function public.set_committee_member(p_user_id uuid, p_display_name text, p_role public.committee_role, p_member_id uuid, p_active boolean) set schema app_private;
create function public.set_committee_member(p_user_id uuid, p_display_name text, p_role public.committee_role, p_member_id uuid DEFAULT NULL::uuid, p_active boolean DEFAULT true) returns void
language sql security invoker set search_path = '' as $$ select app_private.set_committee_member(p_user_id => p_user_id, p_display_name => p_display_name, p_role => p_role, p_member_id => p_member_id, p_active => p_active) $$;

alter function public.set_group_price(p_group_code text, p_year integer, p_monthly_amount integer) set schema app_private;
create function public.set_group_price(p_group_code text, p_year integer, p_monthly_amount integer) returns void
language sql security invoker set search_path = '' as $$ select app_private.set_group_price(p_group_code => p_group_code, p_year => p_year, p_monthly_amount => p_monthly_amount) $$;

alter function public.start_handover(p_id uuid, p_note text) set schema app_private;
create function public.start_handover(p_id uuid, p_note text DEFAULT NULL::text) returns uuid
language sql security invoker set search_path = '' as $$ select app_private.start_handover(p_id => p_id, p_note => p_note) $$;

alter function public.submit_handover(p_id uuid) set schema app_private;
create function public.submit_handover(p_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app_private.submit_handover(p_id => p_id) $$;

alter function public.undo_payment(p_payment_id uuid) set schema app_private;
create function public.undo_payment(p_payment_id uuid) returns void
language sql security invoker set search_path = '' as $$ select app_private.undo_payment(p_payment_id => p_payment_id) $$;

alter function public.update_campaign(p_id uuid, p_title text, p_purpose text, p_target_amount integer, p_deadline date) set schema app_private;
create function public.update_campaign(p_id uuid, p_title text, p_purpose text, p_target_amount integer, p_deadline date) returns void
language sql security invoker set search_path = '' as $$ select app_private.update_campaign(p_id => p_id, p_title => p_title, p_purpose => p_purpose, p_target_amount => p_target_amount, p_deadline => p_deadline) $$;

alter function public.update_fund_account(p_id uuid, p_holder_name text, p_note text, p_sort_order integer, p_active boolean) set schema app_private;
create function public.update_fund_account(p_id uuid, p_holder_name text, p_note text, p_sort_order integer, p_active boolean) returns void
language sql security invoker set search_path = '' as $$ select app_private.update_fund_account(p_id => p_id, p_holder_name => p_holder_name, p_note => p_note, p_sort_order => p_sort_order, p_active => p_active) $$;

alter function public.update_handover_draft(p_id uuid, p_counted_lines jsonb, p_carry_over uuid[], p_note text) set schema app_private;
create function public.update_handover_draft(p_id uuid, p_counted_lines jsonb, p_carry_over uuid[] DEFAULT '{}'::uuid[], p_note text DEFAULT NULL::text) returns void
language sql security invoker set search_path = '' as $$ select app_private.update_handover_draft(p_id => p_id, p_counted_lines => p_counted_lines, p_carry_over => p_carry_over, p_note => p_note) $$;

alter function public.update_member(p_member_id uuid, p_full_name text, p_phone text, p_note text, p_number integer) set schema app_private;
create function public.update_member(p_member_id uuid, p_full_name text, p_phone text, p_note text, p_number integer DEFAULT NULL::integer) returns void
language sql security invoker set search_path = '' as $$ select app_private.update_member(p_member_id => p_member_id, p_full_name => p_full_name, p_phone => p_phone, p_note => p_note, p_number => p_number) $$;

alter function public.update_my_profile(p_display_name text, p_member_id uuid) set schema app_private;
create function public.update_my_profile(p_display_name text, p_member_id uuid DEFAULT NULL::uuid) returns void
language sql security invoker set search_path = '' as $$ select app_private.update_my_profile(p_display_name => p_display_name, p_member_id => p_member_id) $$;

alter function public.update_settings(p_opening_balance integer, p_opening_balance_on date, p_grace_days integer, p_show_amount_owed boolean, p_whatsapp_contact text) set schema app_private;
create function public.update_settings(p_opening_balance integer DEFAULT NULL::integer, p_opening_balance_on date DEFAULT NULL::date, p_grace_days integer DEFAULT NULL::integer, p_show_amount_owed boolean DEFAULT NULL::boolean, p_whatsapp_contact text DEFAULT NULL::text) returns void
language sql security invoker set search_path = '' as $$ select app_private.update_settings(p_opening_balance => p_opening_balance, p_opening_balance_on => p_opening_balance_on, p_grace_days => p_grace_days, p_show_amount_owed => p_show_amount_owed, p_whatsapp_contact => p_whatsapp_contact) $$;

alter function public.verify_receipt(p_code text) set schema app_private;
create function public.verify_receipt(p_code text) returns jsonb
language sql stable security invoker set search_path = '' as $$ select app_private.verify_receipt(p_code => p_code) $$;

-- Grants: the moved functions keep theirs; restated so the intent is explicit. Wrappers get the same.
revoke all on function app_private.accept_handover(p_id uuid, p_new_term_title text) from public, anon;
grant execute on function app_private.accept_handover(p_id uuid, p_new_term_title text) to authenticated, service_role;
revoke all on function public.accept_handover(p_id uuid, p_new_term_title text) from public, anon, authenticated;
grant execute on function public.accept_handover(p_id uuid, p_new_term_title text) to authenticated, service_role;
revoke all on function app_private.add_fund_account(p_method public.payment_method, p_account_number text, p_holder_name text, p_note text, p_sort_order integer) from public, anon;
grant execute on function app_private.add_fund_account(p_method public.payment_method, p_account_number text, p_holder_name text, p_note text, p_sort_order integer) to authenticated, service_role;
revoke all on function public.add_fund_account(p_method public.payment_method, p_account_number text, p_holder_name text, p_note text, p_sort_order integer) from public, anon, authenticated;
grant execute on function public.add_fund_account(p_method public.payment_method, p_account_number text, p_holder_name text, p_note text, p_sort_order integer) to authenticated, service_role;
revoke all on function app_private.add_member(p_number integer, p_full_name text, p_group_code text, p_from_month date, p_phone text, p_note text, p_status public.membership_status, p_list_code text) from public, anon;
grant execute on function app_private.add_member(p_number integer, p_full_name text, p_group_code text, p_from_month date, p_phone text, p_note text, p_status public.membership_status, p_list_code text) to authenticated, service_role;
revoke all on function public.add_member(p_number integer, p_full_name text, p_group_code text, p_from_month date, p_phone text, p_note text, p_status public.membership_status, p_list_code text) from public, anon, authenticated;
grant execute on function public.add_member(p_number integer, p_full_name text, p_group_code text, p_from_month date, p_phone text, p_note text, p_status public.membership_status, p_list_code text) to authenticated, service_role;
revoke all on function app_private.cancel_expense(p_expense_id uuid, p_reason text) from public, anon;
grant execute on function app_private.cancel_expense(p_expense_id uuid, p_reason text) to authenticated, service_role;
revoke all on function public.cancel_expense(p_expense_id uuid, p_reason text) from public, anon, authenticated;
grant execute on function public.cancel_expense(p_expense_id uuid, p_reason text) to authenticated, service_role;
revoke all on function app_private.cancel_handover(p_id uuid, p_reason text) from public, anon;
grant execute on function app_private.cancel_handover(p_id uuid, p_reason text) to authenticated, service_role;
revoke all on function public.cancel_handover(p_id uuid, p_reason text) from public, anon, authenticated;
grant execute on function public.cancel_handover(p_id uuid, p_reason text) to authenticated, service_role;
revoke all on function app_private.cancel_payment(p_payment_id uuid, p_reason text) from public, anon;
grant execute on function app_private.cancel_payment(p_payment_id uuid, p_reason text) to authenticated, service_role;
revoke all on function public.cancel_payment(p_payment_id uuid, p_reason text) from public, anon, authenticated;
grant execute on function public.cancel_payment(p_payment_id uuid, p_reason text) to authenticated, service_role;
revoke all on function app_private.change_member_group(p_member_id uuid, p_from_month date, p_group_code text, p_reason text) from public, anon;
grant execute on function app_private.change_member_group(p_member_id uuid, p_from_month date, p_group_code text, p_reason text) to authenticated, service_role;
revoke all on function public.change_member_group(p_member_id uuid, p_from_month date, p_group_code text, p_reason text) from public, anon, authenticated;
grant execute on function public.change_member_group(p_member_id uuid, p_from_month date, p_group_code text, p_reason text) to authenticated, service_role;
revoke all on function app_private.change_member_status(p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text) from public, anon;
grant execute on function app_private.change_member_status(p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text) to authenticated, service_role;
revoke all on function public.change_member_status(p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text) from public, anon, authenticated;
grant execute on function public.change_member_status(p_member_id uuid, p_from_month date, p_status public.membership_status, p_reason text, p_group_code text) to authenticated, service_role;
revoke all on function app_private.close_campaign(p_id uuid, p_surplus_action public.surplus_action) from public, anon;
grant execute on function app_private.close_campaign(p_id uuid, p_surplus_action public.surplus_action) to authenticated, service_role;
revoke all on function public.close_campaign(p_id uuid, p_surplus_action public.surplus_action) from public, anon, authenticated;
grant execute on function public.close_campaign(p_id uuid, p_surplus_action public.surplus_action) to authenticated, service_role;
revoke all on function app_private.confirm_payment(p_payment_id uuid) from public, anon;
grant execute on function app_private.confirm_payment(p_payment_id uuid) to authenticated, service_role;
revoke all on function public.confirm_payment(p_payment_id uuid) from public, anon, authenticated;
grant execute on function public.confirm_payment(p_payment_id uuid) to authenticated, service_role;
revoke all on function app_private.create_campaign(p_id uuid, p_title text, p_amount_mode public.campaign_mode, p_purpose text, p_target_amount integer, p_deadline date, p_participants jsonb) from public, anon;
grant execute on function app_private.create_campaign(p_id uuid, p_title text, p_amount_mode public.campaign_mode, p_purpose text, p_target_amount integer, p_deadline date, p_participants jsonb) to authenticated, service_role;
revoke all on function public.create_campaign(p_id uuid, p_title text, p_amount_mode public.campaign_mode, p_purpose text, p_target_amount integer, p_deadline date, p_participants jsonb) from public, anon, authenticated;
grant execute on function public.create_campaign(p_id uuid, p_title text, p_amount_mode public.campaign_mode, p_purpose text, p_target_amount integer, p_deadline date, p_participants jsonb) to authenticated, service_role;
revoke all on function app_private.delete_committee_member(p_user_id uuid) from public, anon;
grant execute on function app_private.delete_committee_member(p_user_id uuid) to authenticated, service_role;
revoke all on function public.delete_committee_member(p_user_id uuid) from public, anon, authenticated;
grant execute on function public.delete_committee_member(p_user_id uuid) to authenticated, service_role;
revoke all on function app_private.delete_push_subscription(p_endpoint text) from public, anon;
grant execute on function app_private.delete_push_subscription(p_endpoint text) to authenticated, service_role;
revoke all on function public.delete_push_subscription(p_endpoint text) from public, anon, authenticated;
grant execute on function public.delete_push_subscription(p_endpoint text) to authenticated, service_role;
revoke all on function app_private.log_reminder(p_kind public.reminder_kind, p_member_id uuid, p_campaign_id uuid, p_payment_id uuid) from public, anon;
grant execute on function app_private.log_reminder(p_kind public.reminder_kind, p_member_id uuid, p_campaign_id uuid, p_payment_id uuid) to authenticated, service_role;
revoke all on function public.log_reminder(p_kind public.reminder_kind, p_member_id uuid, p_campaign_id uuid, p_payment_id uuid) from public, anon, authenticated;
grant execute on function public.log_reminder(p_kind public.reminder_kind, p_member_id uuid, p_campaign_id uuid, p_payment_id uuid) to authenticated, service_role;
revoke all on function app_private.next_member_number(p_list_code text) from public, anon;
grant execute on function app_private.next_member_number(p_list_code text) to authenticated, service_role;
revoke all on function public.next_member_number(p_list_code text) from public, anon, authenticated;
grant execute on function public.next_member_number(p_list_code text) to authenticated, service_role;
revoke all on function app_private.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text, p_campaign_id uuid, p_receipt_path text) from public, anon;
grant execute on function app_private.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text, p_campaign_id uuid, p_receipt_path text) to authenticated, service_role;
revoke all on function public.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text, p_campaign_id uuid, p_receipt_path text) from public, anon, authenticated;
grant execute on function public.record_expense(p_id uuid, p_spent_on date, p_category public.expense_category, p_amount integer, p_note text, p_campaign_id uuid, p_receipt_path text) to authenticated, service_role;
revoke all on function app_private.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text, p_proof_path text, p_proof_hash text, p_note text) from public, anon;
grant execute on function app_private.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text, p_proof_path text, p_proof_hash text, p_note text) to authenticated, service_role;
revoke all on function public.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text, p_proof_path text, p_proof_hash text, p_note text) from public, anon, authenticated;
grant execute on function public.record_payment(p_id uuid, p_payer_name text, p_method public.payment_method, p_amount integer, p_paid_on date, p_allocations jsonb, p_txn_ref text, p_proof_path text, p_proof_hash text, p_note text) to authenticated, service_role;
revoke all on function app_private.reject_payment(p_payment_id uuid, p_reason text) from public, anon;
grant execute on function app_private.reject_payment(p_payment_id uuid, p_reason text) to authenticated, service_role;
revoke all on function public.reject_payment(p_payment_id uuid, p_reason text) from public, anon, authenticated;
grant execute on function public.reject_payment(p_payment_id uuid, p_reason text) to authenticated, service_role;
revoke all on function app_private.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) from public, anon;
grant execute on function app_private.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) to authenticated, service_role;
revoke all on function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) from public, anon, authenticated;
grant execute on function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) to authenticated, service_role;
revoke all on function app_private.set_committee_active(p_user_id uuid, p_active boolean) from public, anon;
grant execute on function app_private.set_committee_active(p_user_id uuid, p_active boolean) to authenticated, service_role;
revoke all on function public.set_committee_active(p_user_id uuid, p_active boolean) from public, anon, authenticated;
grant execute on function public.set_committee_active(p_user_id uuid, p_active boolean) to authenticated, service_role;
revoke all on function app_private.set_committee_member(p_user_id uuid, p_display_name text, p_role public.committee_role, p_member_id uuid, p_active boolean) from public, anon;
grant execute on function app_private.set_committee_member(p_user_id uuid, p_display_name text, p_role public.committee_role, p_member_id uuid, p_active boolean) to authenticated, service_role;
revoke all on function public.set_committee_member(p_user_id uuid, p_display_name text, p_role public.committee_role, p_member_id uuid, p_active boolean) from public, anon, authenticated;
grant execute on function public.set_committee_member(p_user_id uuid, p_display_name text, p_role public.committee_role, p_member_id uuid, p_active boolean) to authenticated, service_role;
revoke all on function app_private.set_group_price(p_group_code text, p_year integer, p_monthly_amount integer) from public, anon;
grant execute on function app_private.set_group_price(p_group_code text, p_year integer, p_monthly_amount integer) to authenticated, service_role;
revoke all on function public.set_group_price(p_group_code text, p_year integer, p_monthly_amount integer) from public, anon, authenticated;
grant execute on function public.set_group_price(p_group_code text, p_year integer, p_monthly_amount integer) to authenticated, service_role;
revoke all on function app_private.start_handover(p_id uuid, p_note text) from public, anon;
grant execute on function app_private.start_handover(p_id uuid, p_note text) to authenticated, service_role;
revoke all on function public.start_handover(p_id uuid, p_note text) from public, anon, authenticated;
grant execute on function public.start_handover(p_id uuid, p_note text) to authenticated, service_role;
revoke all on function app_private.submit_handover(p_id uuid) from public, anon;
grant execute on function app_private.submit_handover(p_id uuid) to authenticated, service_role;
revoke all on function public.submit_handover(p_id uuid) from public, anon, authenticated;
grant execute on function public.submit_handover(p_id uuid) to authenticated, service_role;
revoke all on function app_private.undo_payment(p_payment_id uuid) from public, anon;
grant execute on function app_private.undo_payment(p_payment_id uuid) to authenticated, service_role;
revoke all on function public.undo_payment(p_payment_id uuid) from public, anon, authenticated;
grant execute on function public.undo_payment(p_payment_id uuid) to authenticated, service_role;
revoke all on function app_private.update_campaign(p_id uuid, p_title text, p_purpose text, p_target_amount integer, p_deadline date) from public, anon;
grant execute on function app_private.update_campaign(p_id uuid, p_title text, p_purpose text, p_target_amount integer, p_deadline date) to authenticated, service_role;
revoke all on function public.update_campaign(p_id uuid, p_title text, p_purpose text, p_target_amount integer, p_deadline date) from public, anon, authenticated;
grant execute on function public.update_campaign(p_id uuid, p_title text, p_purpose text, p_target_amount integer, p_deadline date) to authenticated, service_role;
revoke all on function app_private.update_fund_account(p_id uuid, p_holder_name text, p_note text, p_sort_order integer, p_active boolean) from public, anon;
grant execute on function app_private.update_fund_account(p_id uuid, p_holder_name text, p_note text, p_sort_order integer, p_active boolean) to authenticated, service_role;
revoke all on function public.update_fund_account(p_id uuid, p_holder_name text, p_note text, p_sort_order integer, p_active boolean) from public, anon, authenticated;
grant execute on function public.update_fund_account(p_id uuid, p_holder_name text, p_note text, p_sort_order integer, p_active boolean) to authenticated, service_role;
revoke all on function app_private.update_handover_draft(p_id uuid, p_counted_lines jsonb, p_carry_over uuid[], p_note text) from public, anon;
grant execute on function app_private.update_handover_draft(p_id uuid, p_counted_lines jsonb, p_carry_over uuid[], p_note text) to authenticated, service_role;
revoke all on function public.update_handover_draft(p_id uuid, p_counted_lines jsonb, p_carry_over uuid[], p_note text) from public, anon, authenticated;
grant execute on function public.update_handover_draft(p_id uuid, p_counted_lines jsonb, p_carry_over uuid[], p_note text) to authenticated, service_role;
revoke all on function app_private.update_member(p_member_id uuid, p_full_name text, p_phone text, p_note text, p_number integer) from public, anon;
grant execute on function app_private.update_member(p_member_id uuid, p_full_name text, p_phone text, p_note text, p_number integer) to authenticated, service_role;
revoke all on function public.update_member(p_member_id uuid, p_full_name text, p_phone text, p_note text, p_number integer) from public, anon, authenticated;
grant execute on function public.update_member(p_member_id uuid, p_full_name text, p_phone text, p_note text, p_number integer) to authenticated, service_role;
revoke all on function app_private.update_my_profile(p_display_name text, p_member_id uuid) from public, anon;
grant execute on function app_private.update_my_profile(p_display_name text, p_member_id uuid) to authenticated, service_role;
revoke all on function public.update_my_profile(p_display_name text, p_member_id uuid) from public, anon, authenticated;
grant execute on function public.update_my_profile(p_display_name text, p_member_id uuid) to authenticated, service_role;
revoke all on function app_private.update_settings(p_opening_balance integer, p_opening_balance_on date, p_grace_days integer, p_show_amount_owed boolean, p_whatsapp_contact text) from public, anon;
grant execute on function app_private.update_settings(p_opening_balance integer, p_opening_balance_on date, p_grace_days integer, p_show_amount_owed boolean, p_whatsapp_contact text) to authenticated, service_role;
revoke all on function public.update_settings(p_opening_balance integer, p_opening_balance_on date, p_grace_days integer, p_show_amount_owed boolean, p_whatsapp_contact text) from public, anon, authenticated;
grant execute on function public.update_settings(p_opening_balance integer, p_opening_balance_on date, p_grace_days integer, p_show_amount_owed boolean, p_whatsapp_contact text) to authenticated, service_role;
revoke all on function app_private.verify_receipt(p_code text) from public;
grant execute on function app_private.verify_receipt(p_code text) to anon, authenticated, service_role;
revoke all on function public.verify_receipt(p_code text) from public, anon, authenticated;
grant execute on function public.verify_receipt(p_code text) to anon, authenticated, service_role;
