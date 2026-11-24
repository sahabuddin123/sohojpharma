CREATE OR REPLACE FUNCTION public.list_cart_batches(_tenant_id uuid, _warehouse_id uuid, _product_ids uuid[])
RETURNS TABLE(id uuid, product_id uuid, warehouse_id uuid, branch_id uuid, batch_no text, qty_on_hand numeric, expiry_date date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.is_tenant_member(auth.uid(), _tenant_id)
    OR public.is_app_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT b.id, b.product_id, b.warehouse_id, b.branch_id,
         b.batch_no, b.qty_on_hand, b.expiry_date
  FROM public.batches b
  WHERE b.tenant_id = _tenant_id
    AND (_warehouse_id IS NULL OR b.warehouse_id = _warehouse_id)
    AND b.product_id = ANY(_product_ids)
    AND b.qty_on_hand > 0
    AND b.deleted_at IS NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_cart_batches(uuid,uuid,uuid[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.list_cart_batches(uuid,uuid,uuid[]) FROM anon, public;