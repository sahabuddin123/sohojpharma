CREATE OR REPLACE FUNCTION public.list_inventory_in_stock_products(
  p_tenant_id uuid,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_sort_by text DEFAULT 'name',
  p_sort_dir text DEFAULT 'asc'
)
RETURNS TABLE(rows jsonb, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(btrim(coalesce(p_search, '')), '');
  v_page integer := GREATEST(coalesce(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(coalesce(p_page_size, 50), 10), 200);
  v_offset integer := (GREATEST(coalesce(p_page, 1), 1) - 1) * LEAST(GREATEST(coalesce(p_page_size, 50), 10), 200);
  v_sort_by text := CASE
    WHEN p_sort_by IN ('name', 'sku', 'barcode', 'manufacturer', 'generic', 'stock', 'purchase_price', 'retail_price') THEN p_sort_by
    ELSE 'name'
  END;
  v_sort_dir text := CASE WHEN lower(coalesce(p_sort_dir, 'asc')) = 'desc' THEN 'desc' ELSE 'asc' END;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH stock AS (
    SELECT
      b.product_id,
      COALESCE(SUM(b.qty_on_hand), 0)::numeric AS stock
    FROM public.batches b
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND b.qty_on_hand > 0
    GROUP BY b.product_id
  ), filtered AS (
    SELECT
      p.id,
      p.name,
      p.sku,
      p.barcode,
      p.retail_price,
      p.purchase_price,
      s.stock,
      g.name AS generic_name,
      m.name AS manufacturer_name
    FROM stock s
    JOIN public.products p
      ON p.id = s.product_id
     AND p.tenant_id = p_tenant_id
     AND p.deleted_at IS NULL
    LEFT JOIN public.generics g
      ON g.id = p.generic_id
     AND g.tenant_id = p.tenant_id
     AND g.deleted_at IS NULL
    LEFT JOIN public.manufacturers m
      ON m.id = p.manufacturer_id
     AND m.tenant_id = p.tenant_id
     AND m.deleted_at IS NULL
    WHERE v_search IS NULL
       OR p.name ILIKE '%' || v_search || '%'
       OR p.sku ILIKE '%' || v_search || '%'
       OR p.barcode ILIKE '%' || v_search || '%'
       OR g.name ILIKE '%' || v_search || '%'
       OR m.name ILIKE '%' || v_search || '%'
  ), counted AS (
    SELECT COUNT(*)::bigint AS total_count FROM filtered
  ), page_rows AS (
    SELECT f.*
    FROM filtered f
    ORDER BY
      CASE WHEN v_sort_by = 'name' AND v_sort_dir = 'asc' THEN f.name END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'name' AND v_sort_dir = 'desc' THEN f.name END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'sku' AND v_sort_dir = 'asc' THEN f.sku END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'sku' AND v_sort_dir = 'desc' THEN f.sku END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'barcode' AND v_sort_dir = 'asc' THEN f.barcode END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'barcode' AND v_sort_dir = 'desc' THEN f.barcode END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'manufacturer' AND v_sort_dir = 'asc' THEN f.manufacturer_name END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'manufacturer' AND v_sort_dir = 'desc' THEN f.manufacturer_name END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'generic' AND v_sort_dir = 'asc' THEN f.generic_name END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'generic' AND v_sort_dir = 'desc' THEN f.generic_name END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'stock' AND v_sort_dir = 'asc' THEN f.stock END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'stock' AND v_sort_dir = 'desc' THEN f.stock END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'purchase_price' AND v_sort_dir = 'asc' THEN f.purchase_price END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'purchase_price' AND v_sort_dir = 'desc' THEN f.purchase_price END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'retail_price' AND v_sort_dir = 'asc' THEN f.retail_price END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'retail_price' AND v_sort_dir = 'desc' THEN f.retail_price END DESC NULLS LAST,
      f.name ASC,
      f.id ASC
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'sku', p.sku,
      'barcode', p.barcode,
      'retail_price', p.retail_price,
      'purchase_price', p.purchase_price,
      'stock', p.stock,
      'generic_name', p.generic_name,
      'manufacturer_name', p.manufacturer_name
    ) ORDER BY
      CASE WHEN v_sort_by = 'name' AND v_sort_dir = 'asc' THEN p.name END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'name' AND v_sort_dir = 'desc' THEN p.name END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'sku' AND v_sort_dir = 'asc' THEN p.sku END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'sku' AND v_sort_dir = 'desc' THEN p.sku END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'barcode' AND v_sort_dir = 'asc' THEN p.barcode END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'barcode' AND v_sort_dir = 'desc' THEN p.barcode END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'manufacturer' AND v_sort_dir = 'asc' THEN p.manufacturer_name END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'manufacturer' AND v_sort_dir = 'desc' THEN p.manufacturer_name END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'generic' AND v_sort_dir = 'asc' THEN p.generic_name END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'generic' AND v_sort_dir = 'desc' THEN p.generic_name END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'stock' AND v_sort_dir = 'asc' THEN p.stock END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'stock' AND v_sort_dir = 'desc' THEN p.stock END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'purchase_price' AND v_sort_dir = 'asc' THEN p.purchase_price END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'purchase_price' AND v_sort_dir = 'desc' THEN p.purchase_price END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'retail_price' AND v_sort_dir = 'asc' THEN p.retail_price END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'retail_price' AND v_sort_dir = 'desc' THEN p.retail_price END DESC NULLS LAST,
      p.name ASC,
      p.id ASC
    ), '[]'::jsonb) AS rows,
    (SELECT c.total_count FROM counted c) AS total_count
  FROM page_rows p;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_inventory_in_stock_products(uuid, text, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_inventory_in_stock_products(uuid, text, integer, integer, text, text) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_batches_tenant_product_in_stock
  ON public.batches (tenant_id, product_id)
  WHERE deleted_at IS NULL AND qty_on_hand > 0;

CREATE INDEX IF NOT EXISTS idx_products_tenant_name_active
  ON public.products (tenant_id, name, id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_manufacturers_tenant_name_active
  ON public.manufacturers (tenant_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_generics_tenant_name_active
  ON public.generics (tenant_id, name)
  WHERE deleted_at IS NULL;