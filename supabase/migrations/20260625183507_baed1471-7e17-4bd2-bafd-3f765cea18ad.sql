REVOKE EXECUTE ON FUNCTION public.admin_list_cart_batches(uuid, uuid, uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_lock_batch_cost() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_warehouses(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_supplier_due_balance(uuid, numeric) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pos_checkout(uuid, uuid, uuid, text, numeric, text, uuid, jsonb, jsonb, uuid, uuid) FROM anon, PUBLIC;