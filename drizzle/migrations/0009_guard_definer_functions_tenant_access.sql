CREATE OR REPLACE FUNCTION public.assert_tenant_access(_uid uuid, _tenant uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _uid IS NULL THEN RETURN true; END IF;
  IF _tenant IS NOT NULL AND (public.is_tenant_member(_uid, _tenant) OR COALESCE(public.is_app_admin(_uid), false)) THEN
    RETURN true;
  END IF;
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END $$;
REVOKE EXECUTE ON FUNCTION public.assert_tenant_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_tenant_access(uuid, uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.assert_app_admin(_uid uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _uid IS NULL OR COALESCE(public.is_app_admin(_uid), false) THEN RETURN true; END IF;
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END $$;
REVOKE EXECUTE ON FUNCTION public.assert_app_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_app_admin(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.assert_self_or_admin(_uid uuid, _user uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _uid IS NULL OR _uid = _user OR COALESCE(public.is_app_admin(_uid), false) THEN RETURN true; END IF;
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END $$;
REVOKE EXECUTE ON FUNCTION public.assert_self_or_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_self_or_admin(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.process_subscription_expiry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_subscription_expiry() TO service_role;
REVOKE EXECUTE ON FUNCTION public.process_invoice_dunning() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_invoice_dunning() TO service_role;
REVOKE EXECUTE ON FUNCTION public.process_subscription_reactivation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_subscription_reactivation() TO service_role;
REVOKE EXECUTE ON FUNCTION public.process_subscription_grace_period() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_subscription_grace_period() TO service_role;
REVOKE EXECUTE ON FUNCTION public.queue_expiry_warnings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_expiry_warnings() TO service_role;
REVOKE EXECUTE ON FUNCTION public.activate_subscription_from_payment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription_from_payment(uuid) TO service_role;

ALTER FUNCTION public.rollback_product_import(p_batch_id uuid) RENAME TO rollback_product_import_impl;
REVOKE EXECUTE ON FUNCTION public.rollback_product_import_impl(p_batch_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_product_import_impl(p_batch_id uuid) TO service_role;
CREATE FUNCTION public.rollback_product_import(p_batch_id uuid)
 RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.rollback_product_import_impl(p_batch_id) WHERE public.assert_tenant_access(auth.uid(), (SELECT tenant_id FROM public.product_import_logs WHERE import_batch_id = p_batch_id)) $fn$;
REVOKE EXECUTE ON FUNCTION public.rollback_product_import(p_batch_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_product_import(p_batch_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.rollback_product_import_v2(_job uuid) RENAME TO rollback_product_import_v2_impl;
REVOKE EXECUTE ON FUNCTION public.rollback_product_import_v2_impl(_job uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_product_import_v2_impl(_job uuid) TO service_role;
CREATE FUNCTION public.rollback_product_import_v2(_job uuid)
 RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.rollback_product_import_v2_impl(_job) WHERE public.assert_tenant_access(auth.uid(), (SELECT tenant_id FROM public.import_jobs_v2 WHERE id = _job)) $fn$;
REVOKE EXECUTE ON FUNCTION public.rollback_product_import_v2(_job uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_product_import_v2(_job uuid) TO authenticated, service_role;

ALTER FUNCTION public.process_product_import_chunk_v2(_job uuid, _batch integer) RENAME TO process_product_import_chunk_v2_impl;
REVOKE EXECUTE ON FUNCTION public.process_product_import_chunk_v2_impl(_job uuid, _batch integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_product_import_chunk_v2_impl(_job uuid, _batch integer) TO service_role;
CREATE FUNCTION public.process_product_import_chunk_v2(_job uuid, _batch integer DEFAULT 500)
 RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.process_product_import_chunk_v2_impl(_job, _batch) WHERE public.assert_tenant_access(auth.uid(), (SELECT tenant_id FROM public.import_jobs_v2 WHERE id = _job)) $fn$;
REVOKE EXECUTE ON FUNCTION public.process_product_import_chunk_v2(_job uuid, _batch integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_product_import_chunk_v2(_job uuid, _batch integer) TO authenticated, service_role;

ALTER FUNCTION public.reconcile_register_session(_register_id uuid) RENAME TO reconcile_register_session_impl;
REVOKE EXECUTE ON FUNCTION public.reconcile_register_session_impl(_register_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_register_session_impl(_register_id uuid) TO service_role;
CREATE FUNCTION public.reconcile_register_session(_register_id uuid)
 RETURNS TABLE(register_id uuid, opening_amount numeric, cash_in numeric, cash_out numeric, expected_cash numeric, actual_cash numeric, variance numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT * FROM public.reconcile_register_session_impl(_register_id) WHERE public.assert_tenant_access(auth.uid(), (SELECT tenant_id FROM public.cash_registers WHERE id = _register_id)) $fn$;
REVOKE EXECUTE ON FUNCTION public.reconcile_register_session(_register_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_register_session(_register_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.resolve_product_revive_first(_payload jsonb) RENAME TO resolve_product_revive_first_impl;
REVOKE EXECUTE ON FUNCTION public.resolve_product_revive_first_impl(_payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_product_revive_first_impl(_payload jsonb) TO service_role;
CREATE FUNCTION public.resolve_product_revive_first(_payload jsonb)
 RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.resolve_product_revive_first_impl(_payload) WHERE public.assert_tenant_access(auth.uid(), NULLIF(_payload->>'tenant_id','')::uuid) $fn$;
REVOKE EXECUTE ON FUNCTION public.resolve_product_revive_first(_payload jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_product_revive_first(_payload jsonb) TO authenticated, service_role;

ALTER FUNCTION public.validate_password_policy(_tenant_id uuid, _password text) RENAME TO validate_password_policy_impl;
REVOKE EXECUTE ON FUNCTION public.validate_password_policy_impl(_tenant_id uuid, _password text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_password_policy_impl(_tenant_id uuid, _password text) TO service_role;
CREATE FUNCTION public.validate_password_policy(_tenant_id uuid, _password text)
 RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.validate_password_policy_impl(_tenant_id, _password) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.validate_password_policy(_tenant_id uuid, _password text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_password_policy(_tenant_id uuid, _password text) TO authenticated, service_role;

ALTER FUNCTION public.current_tenant_subscription_status(_tenant_id uuid) RENAME TO current_tenant_subscription_status_impl;
REVOKE EXECUTE ON FUNCTION public.current_tenant_subscription_status_impl(_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_subscription_status_impl(_tenant_id uuid) TO service_role;
CREATE FUNCTION public.current_tenant_subscription_status(_tenant_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.current_tenant_subscription_status_impl(_tenant_id) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.current_tenant_subscription_status(_tenant_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tenant_subscription_status(_tenant_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.resolve_product_vat(_tenant_id uuid, _product_id uuid, OUT vat_rate numeric, OUT vat_method text, OUT vat_source text) RENAME TO resolve_product_vat_impl;
REVOKE EXECUTE ON FUNCTION public.resolve_product_vat_impl(_tenant_id uuid, _product_id uuid, OUT vat_rate numeric, OUT vat_method text, OUT vat_source text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_product_vat_impl(_tenant_id uuid, _product_id uuid, OUT vat_rate numeric, OUT vat_method text, OUT vat_source text) TO service_role;
CREATE FUNCTION public.resolve_product_vat(_tenant_id uuid, _product_id uuid, OUT vat_rate numeric, OUT vat_method text, OUT vat_source text)
 RETURNS record LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT * FROM public.resolve_product_vat_impl(_tenant_id, _product_id) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.resolve_product_vat(_tenant_id uuid, _product_id uuid, OUT vat_rate numeric, OUT vat_method text, OUT vat_source text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_product_vat(_tenant_id uuid, _product_id uuid, OUT vat_rate numeric, OUT vat_method text, OUT vat_source text) TO authenticated, service_role;

ALTER FUNCTION public.get_opening_stock_products(_tenant_id uuid, _filter text, _search text, _page integer, _page_size integer) RENAME TO get_opening_stock_products_impl;
REVOKE EXECUTE ON FUNCTION public.get_opening_stock_products_impl(_tenant_id uuid, _filter text, _search text, _page integer, _page_size integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_opening_stock_products_impl(_tenant_id uuid, _filter text, _search text, _page integer, _page_size integer) TO service_role;
CREATE FUNCTION public.get_opening_stock_products(_tenant_id uuid, _filter text DEFAULT 'all'::text, _search text DEFAULT ''::text, _page integer DEFAULT 1, _page_size integer DEFAULT 50)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.get_opening_stock_products_impl(_tenant_id, _filter, _search, _page, _page_size) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.get_opening_stock_products(_tenant_id uuid, _filter text, _search text, _page integer, _page_size integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_opening_stock_products(_tenant_id uuid, _filter text, _search text, _page integer, _page_size integer) TO authenticated, service_role;

ALTER FUNCTION public.resolve_default_supplier(_tenant_id uuid) RENAME TO resolve_default_supplier_impl;
REVOKE EXECUTE ON FUNCTION public.resolve_default_supplier_impl(_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_default_supplier_impl(_tenant_id uuid) TO service_role;
CREATE FUNCTION public.resolve_default_supplier(_tenant_id uuid)
 RETURNS TABLE(id uuid, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT * FROM public.resolve_default_supplier_impl(_tenant_id) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.resolve_default_supplier(_tenant_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_default_supplier(_tenant_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.approve_purchase_return(_tenant_id uuid, _return_id uuid) RENAME TO approve_purchase_return_impl;
REVOKE EXECUTE ON FUNCTION public.approve_purchase_return_impl(_tenant_id uuid, _return_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_purchase_return_impl(_tenant_id uuid, _return_id uuid) TO service_role;
CREATE FUNCTION public.approve_purchase_return(_tenant_id uuid, _return_id uuid)
 RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.approve_purchase_return_impl(_tenant_id, _return_id) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.approve_purchase_return(_tenant_id uuid, _return_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_return(_tenant_id uuid, _return_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.scan_product_duplicates(_tenant_id uuid) RENAME TO scan_product_duplicates_impl;
REVOKE EXECUTE ON FUNCTION public.scan_product_duplicates_impl(_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scan_product_duplicates_impl(_tenant_id uuid) TO service_role;
CREATE FUNCTION public.scan_product_duplicates(_tenant_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.scan_product_duplicates_impl(_tenant_id) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.scan_product_duplicates(_tenant_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scan_product_duplicates(_tenant_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.backfill_supplier_journals(_tenant_id uuid) RENAME TO backfill_supplier_journals_impl;
REVOKE EXECUTE ON FUNCTION public.backfill_supplier_journals_impl(_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_supplier_journals_impl(_tenant_id uuid) TO service_role;
CREATE FUNCTION public.backfill_supplier_journals(_tenant_id uuid)
 RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.backfill_supplier_journals_impl(_tenant_id) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.backfill_supplier_journals(_tenant_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_supplier_journals(_tenant_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.list_purchase_requisitions(_tenant_id uuid, _search text, _status text, _supplier_id uuid, _warehouse_id uuid, _date_from date, _date_to date, _limit integer, _offset integer) RENAME TO list_purchase_requisitions_impl;
REVOKE EXECUTE ON FUNCTION public.list_purchase_requisitions_impl(_tenant_id uuid, _search text, _status text, _supplier_id uuid, _warehouse_id uuid, _date_from date, _date_to date, _limit integer, _offset integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_purchase_requisitions_impl(_tenant_id uuid, _search text, _status text, _supplier_id uuid, _warehouse_id uuid, _date_from date, _date_to date, _limit integer, _offset integer) TO service_role;
CREATE FUNCTION public.list_purchase_requisitions(_tenant_id uuid, _search text DEFAULT NULL::text, _status text DEFAULT NULL::text, _supplier_id uuid DEFAULT NULL::uuid, _warehouse_id uuid DEFAULT NULL::uuid, _date_from date DEFAULT NULL::date, _date_to date DEFAULT NULL::date, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, pr_number text, requisition_date date, expected_date date, supplier_id uuid, supplier_name text, warehouse_id uuid, warehouse_name text, status text, total_items integer, total_qty numeric, estimated_amount numeric, remarks text, created_by uuid, created_by_email text, created_at timestamp with time zone, total_count bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT * FROM public.list_purchase_requisitions_impl(_tenant_id, _search, _status, _supplier_id, _warehouse_id, _date_from, _date_to, _limit, _offset) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.list_purchase_requisitions(_tenant_id uuid, _search text, _status text, _supplier_id uuid, _warehouse_id uuid, _date_from date, _date_to date, _limit integer, _offset integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_purchase_requisitions(_tenant_id uuid, _search text, _status text, _supplier_id uuid, _warehouse_id uuid, _date_from date, _date_to date, _limit integer, _offset integer) TO authenticated, service_role;

ALTER FUNCTION public.validate_device_policy(_tenant_id uuid, _user_id uuid) RENAME TO validate_device_policy_impl;
REVOKE EXECUTE ON FUNCTION public.validate_device_policy_impl(_tenant_id uuid, _user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_device_policy_impl(_tenant_id uuid, _user_id uuid) TO service_role;
CREATE FUNCTION public.validate_device_policy(_tenant_id uuid, _user_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.validate_device_policy_impl(_tenant_id, _user_id) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.validate_device_policy(_tenant_id uuid, _user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_device_policy(_tenant_id uuid, _user_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.reject_purchase_return(_tenant_id uuid, _return_id uuid, _reason text) RENAME TO reject_purchase_return_impl;
REVOKE EXECUTE ON FUNCTION public.reject_purchase_return_impl(_tenant_id uuid, _return_id uuid, _reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_purchase_return_impl(_tenant_id uuid, _return_id uuid, _reason text) TO service_role;
CREATE FUNCTION public.reject_purchase_return(_tenant_id uuid, _return_id uuid, _reason text)
 RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.reject_purchase_return_impl(_tenant_id, _return_id, _reason) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.reject_purchase_return(_tenant_id uuid, _return_id uuid, _reason text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_purchase_return(_tenant_id uuid, _return_id uuid, _reason text) TO authenticated, service_role;

ALTER FUNCTION public.get_inventory_overview(_tenant_id uuid) RENAME TO get_inventory_overview_impl;
REVOKE EXECUTE ON FUNCTION public.get_inventory_overview_impl(_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_overview_impl(_tenant_id uuid) TO service_role;
CREATE FUNCTION public.get_inventory_overview(_tenant_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT public.get_inventory_overview_impl(_tenant_id) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.get_inventory_overview(_tenant_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_overview(_tenant_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.user_branch_ids(_user uuid, _tenant uuid) RENAME TO user_branch_ids_impl;
REVOKE EXECUTE ON FUNCTION public.user_branch_ids_impl(_user uuid, _tenant uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_branch_ids_impl(_user uuid, _tenant uuid) TO service_role;
CREATE FUNCTION public.user_branch_ids(_user uuid, _tenant uuid)
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT * FROM public.user_branch_ids_impl(_user, _tenant) WHERE public.assert_tenant_access(auth.uid(), _tenant) AND public.assert_self_or_admin(auth.uid(), _user) $fn$;
REVOKE EXECUTE ON FUNCTION public.user_branch_ids(_user uuid, _tenant uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_branch_ids(_user uuid, _tenant uuid) TO authenticated, service_role;

ALTER FUNCTION public.get_active_subscription(_tenant_id uuid) RENAME TO get_active_subscription_impl;
REVOKE EXECUTE ON FUNCTION public.get_active_subscription_impl(_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_subscription_impl(_tenant_id uuid) TO service_role;
CREATE FUNCTION public.get_active_subscription(_tenant_id uuid)
 RETURNS subscriptions LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT * FROM public.get_active_subscription_impl(_tenant_id) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.get_active_subscription(_tenant_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_subscription(_tenant_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.get_tenant_product_capacity(p_tenant_id uuid) RENAME TO get_tenant_product_capacity_impl;
REVOKE EXECUTE ON FUNCTION public.get_tenant_product_capacity_impl(p_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_product_capacity_impl(p_tenant_id uuid) TO service_role;
CREATE FUNCTION public.get_tenant_product_capacity(p_tenant_id uuid)
 RETURNS TABLE(used bigint, max_products integer, plan_code text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT * FROM public.get_tenant_product_capacity_impl(p_tenant_id) WHERE public.assert_tenant_access(auth.uid(), p_tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.get_tenant_product_capacity(p_tenant_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_product_capacity(p_tenant_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.reconcile_cash_drawer(_tenant_id uuid) RENAME TO reconcile_cash_drawer_impl;
REVOKE EXECUTE ON FUNCTION public.reconcile_cash_drawer_impl(_tenant_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_cash_drawer_impl(_tenant_id uuid) TO service_role;
CREATE FUNCTION public.reconcile_cash_drawer(_tenant_id uuid)
 RETURNS TABLE(register_id uuid, expected numeric, actual numeric, variance numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT * FROM public.reconcile_cash_drawer_impl(_tenant_id) WHERE public.assert_tenant_access(auth.uid(), _tenant_id) $fn$;
REVOKE EXECUTE ON FUNCTION public.reconcile_cash_drawer(_tenant_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_cash_drawer(_tenant_id uuid) TO authenticated, service_role;

ALTER FUNCTION public.search_global_medicines(_tenant uuid, _q text, _limit integer) RENAME TO search_global_medicines_impl;
REVOKE EXECUTE ON FUNCTION public.search_global_medicines_impl(_tenant uuid, _q text, _limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_global_medicines_impl(_tenant uuid, _q text, _limit integer) TO service_role;
CREATE FUNCTION public.search_global_medicines(_tenant uuid, _q text, _limit integer DEFAULT 25)
 RETURNS TABLE(source text, id uuid, brand_name text, generic_name text, manufacturer text, strength text, dosage_form text, already_in_catalog boolean, already_in_stock boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT * FROM public.search_global_medicines_impl(_tenant, _q, _limit) WHERE public.assert_tenant_access(auth.uid(), _tenant) $fn$;
REVOKE EXECUTE ON FUNCTION public.search_global_medicines(_tenant uuid, _q text, _limit integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_global_medicines(_tenant uuid, _q text, _limit integer) TO authenticated, service_role;

ALTER FUNCTION public.tenant_subscription_status(_tenant uuid) RENAME TO tenant_subscription_status_impl;
REVOKE EXECUTE ON FUNCTION public.tenant_subscription_status_impl(_tenant uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_subscription_status_impl(_tenant uuid) TO service_role;
CREATE FUNCTION public.tenant_subscription_status(_tenant uuid)
 RETURNS TABLE(status text, plan_id uuid, plan_code text, expires_at timestamp with time zone, grace_until timestamp with time zone, is_unlimited boolean, sms_enabled boolean, api_enabled boolean, max_branches integer, max_warehouses integer, max_users integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT * FROM public.tenant_subscription_status_impl(_tenant) WHERE public.assert_tenant_access(auth.uid(), _tenant) $fn$;
REVOKE EXECUTE ON FUNCTION public.tenant_subscription_status(_tenant uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_subscription_status(_tenant uuid) TO authenticated, service_role;

ALTER FUNCTION public.admin_plan_analytics() RENAME TO admin_plan_analytics_impl;
REVOKE EXECUTE ON FUNCTION public.admin_plan_analytics_impl() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_plan_analytics_impl() TO service_role;
CREATE FUNCTION public.admin_plan_analytics()
 RETURNS TABLE(plan_id uuid, plan_name text, plan_code text, active_count bigint, trial_count bigint, expired_count bigint, suspended_count bigint, mrr numeric, revenue_last_30d numeric) LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $fn$ SELECT * FROM public.admin_plan_analytics_impl() WHERE public.assert_app_admin(auth.uid()) $fn$;
REVOKE EXECUTE ON FUNCTION public.admin_plan_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_plan_analytics() TO authenticated, service_role;