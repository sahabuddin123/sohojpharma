
CREATE OR REPLACE FUNCTION public.get_inventory_overview(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH prod_stock AS (
    SELECT
      p.id,
      p.name,
      p.sku,
      p.reorder_level,
      COALESCE(SUM(b.qty_on_hand), 0)::numeric AS stock,
      COALESCE(SUM(b.qty_on_hand * COALESCE(b.purchase_price, 0)), 0)::numeric AS value,
      COUNT(b.id) FILTER (WHERE b.deleted_at IS NULL) AS batch_count,
      BOOL_OR(COALESCE(b.is_opening, false)) AS has_opening
    FROM public.products p
    LEFT JOIN public.batches b
      ON b.product_id = p.id AND b.tenant_id = _tenant_id AND b.deleted_at IS NULL
    WHERE p.tenant_id = _tenant_id AND p.deleted_at IS NULL
    GROUP BY p.id
  ),
  kpi AS (
    SELECT
      COALESCE(SUM(stock), 0)::numeric AS total_stock,
      COALESCE(SUM(value), 0)::numeric AS total_value,
      COUNT(*) FILTER (WHERE stock > 0 AND reorder_level IS NOT NULL AND stock <= reorder_level) AS low_count,
      COUNT(*) FILTER (WHERE stock <= 0) AS out_count,
      COUNT(*) FILTER (WHERE batch_count = 0) AS no_batch_count,
      COUNT(*) FILTER (WHERE NOT COALESCE(has_opening, false)) AS no_opening_count
    FROM prod_stock
  ),
  expired AS (
    SELECT COUNT(*)::int AS expired_count
    FROM public.batches b
    WHERE b.tenant_id = _tenant_id AND b.deleted_at IS NULL
      AND b.qty_on_hand > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE
  ),
  low_list AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'sku', sku,
      'stock', stock, 'reorder_level', reorder_level
    )) AS rows
    FROM (
      SELECT * FROM prod_stock
      WHERE stock > 0 AND reorder_level IS NOT NULL AND stock <= reorder_level
      ORDER BY stock ASC LIMIT 200
    ) x
  ),
  out_list AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'sku', sku, 'reorder_level', reorder_level
    )) AS rows
    FROM (
      SELECT * FROM prod_stock WHERE stock <= 0
      ORDER BY name ASC LIMIT 200
    ) x
  ),
  expiring AS (
    SELECT jsonb_agg(jsonb_build_object(
      'name', p.name,
      'batch', COALESCE(b.batch_no, '-'),
      'days', (b.expiry_date - CURRENT_DATE)
    )) AS rows
    FROM public.batches b
    JOIN public.products p ON p.id = b.product_id
    WHERE b.tenant_id = _tenant_id AND b.deleted_at IS NULL
      AND b.qty_on_hand > 0 AND b.expiry_date IS NOT NULL
      AND b.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
    ORDER BY b.expiry_date ASC
    LIMIT 500
  )
  SELECT jsonb_build_object(
    'kpi', jsonb_build_object(
      'totalStock', (SELECT total_stock FROM kpi),
      'totalValue', (SELECT total_value FROM kpi),
      'lowCount', (SELECT low_count FROM kpi),
      'outCount', (SELECT out_count FROM kpi),
      'noBatchCount', (SELECT no_batch_count FROM kpi),
      'noOpeningCount', (SELECT no_opening_count FROM kpi),
      'expiredCount', (SELECT expired_count FROM expired)
    ),
    'lowStock', COALESCE((SELECT rows FROM low_list), '[]'::jsonb),
    'outStock', COALESCE((SELECT rows FROM out_list), '[]'::jsonb),
    'expiring', COALESCE((SELECT rows FROM expiring), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inventory_overview(uuid) TO authenticated, service_role;
