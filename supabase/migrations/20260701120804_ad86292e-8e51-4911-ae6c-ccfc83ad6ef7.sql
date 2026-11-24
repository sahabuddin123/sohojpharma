
CREATE OR REPLACE FUNCTION public.count_products_with_stock(_tenant_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT product_id)::bigint
  FROM public.batches
  WHERE tenant_id = _tenant_id
    AND qty_on_hand > 0;
$$;

REVOKE EXECUTE ON FUNCTION public.count_products_with_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_products_with_stock(uuid) TO authenticated, service_role;
