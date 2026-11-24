-- Revoke EXECUTE from anon on SECURITY DEFINER functions in public schema
REVOKE EXECUTE ON FUNCTION public.admin_list_cart_batches FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_lock_batch_cost() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_warehouses FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_product_barcodes FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_supplier_due_balance FROM anon;
REVOKE EXECUTE ON FUNCTION public.pos_checkout FROM anon;

-- Remove materialized views from Data API exposure by revoking access from API roles
REVOKE ALL ON public.mv_inventory_summary FROM anon, authenticated;
REVOKE ALL ON public.mv_clinical_dashboard FROM anon, authenticated;
REVOKE ALL ON public.mv_sales_daily FROM anon, authenticated;