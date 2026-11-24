
-- 1) Plan limits
UPDATE public.plans SET max_products = 30000  WHERE code = 'free';
UPDATE public.plans SET max_products = 50000  WHERE code = 'starter';
UPDATE public.plans SET max_products = 100000 WHERE code IN ('pro','professional');
UPDATE public.plans SET max_products = NULL   WHERE code = 'enterprise';

-- 2) Product stats RPC
CREATE OR REPLACE FUNCTION public.get_product_stats(p_tenant_id uuid)
RETURNS TABLE(total bigint, in_stock bigint, low_stock bigint, out_of_stock bigint, negative bigint, total_value numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH p AS (
    SELECT pr.id, pr.purchase_price, pr.reorder_level,
           COALESCE(SUM(b.qty_on_hand), 0) AS stock
    FROM public.products pr
    LEFT JOIN public.batches b
      ON b.product_id = pr.id
     AND b.tenant_id  = pr.tenant_id
     AND b.deleted_at IS NULL
    WHERE pr.tenant_id = p_tenant_id
      AND pr.deleted_at IS NULL
    GROUP BY pr.id, pr.purchase_price, pr.reorder_level
  )
  SELECT
    COUNT(*)::bigint                                                                     AS total,
    COUNT(*) FILTER (WHERE stock > 0 AND (reorder_level IS NULL OR stock > reorder_level))::bigint AS in_stock,
    COUNT(*) FILTER (WHERE stock > 0 AND reorder_level IS NOT NULL AND stock <= reorder_level)::bigint AS low_stock,
    COUNT(*) FILTER (WHERE stock = 0)::bigint                                            AS out_of_stock,
    COUNT(*) FILTER (WHERE stock < 0)::bigint                                            AS negative,
    COALESCE(SUM(stock * COALESCE(purchase_price, 0)), 0)                                AS total_value
  FROM p;
$$;
GRANT EXECUTE ON FUNCTION public.get_product_stats(uuid) TO authenticated;

-- 3) Tenant capacity RPC
CREATE OR REPLACE FUNCTION public.get_tenant_product_capacity(p_tenant_id uuid)
RETURNS TABLE(used bigint, max_products integer, plan_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT COUNT(*) FROM public.products
       WHERE tenant_id = p_tenant_id AND deleted_at IS NULL)::bigint AS used,
    pl.max_products,
    pl.code
  FROM public.subscriptions s
  JOIN public.plans pl ON pl.id = s.plan_id
  WHERE s.tenant_id = p_tenant_id
    AND s.status IN ('active','trialing')
  ORDER BY s.current_period_end DESC NULLS LAST
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_tenant_product_capacity(uuid) TO authenticated;
