DROP FUNCTION IF EXISTS public.list_inventory_in_stock_products(uuid, text, integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.list_inventory_in_stock_products(
  p_tenant_id uuid,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_sort_by text DEFAULT 'name',
  p_sort_dir text DEFAULT 'asc'
)
RETURNS TABLE(rows jsonb, total_count bigint, current_page integer, total_pages integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(btrim(coalesce(p_search, '')), '');
  v_search_like text := '%' || NULLIF(btrim(coalesce(p_search, '')), '') || '%';
  v_page integer := GREATEST(coalesce(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(coalesce(p_page_size, 50), 25), 500);
  v_offset integer := (GREATEST(coalesce(p_page, 1), 1) - 1) * LEAST(GREATEST(coalesce(p_page_size, 50), 25), 500);
  v_sort_by text := CASE
    WHEN p_sort_by IN ('name', 'sku', 'stock', 'purchase_price', 'retail_price', 'mrp', 'manufacturer', 'generic') THEN p_sort_by
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
      COALESCE(SUM(b.qty_on_hand), 0)::numeric AS stock,
      COALESCE(MAX(b.mrp), 0)::numeric AS batch_mrp
    FROM public.batches b
    WHERE b.tenant_id = p_tenant_id
      AND b.deleted_at IS NULL
      AND b.qty_on_hand > 0
    GROUP BY b.product_id
  ), filtered AS (
    SELECT
      p.id,
      p.name,
      p.name_bn,
      p.sku,
      p.barcode,
      p.retail_price,
      p.purchase_price,
      COALESCE(p.mrp, s.batch_mrp) AS mrp,
      s.stock,
      g.name AS generic_name,
      m.name AS manufacturer_name,
      c.name AS category_name,
      COALESCE(mt.name, p.medicine_type) AS medicine_type_name
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
    LEFT JOIN public.categories c
      ON c.id = p.category_id
     AND c.tenant_id = p.tenant_id
     AND c.deleted_at IS NULL
    LEFT JOIN public.medicine_types mt
      ON mt.id = p.medicine_type_id
     AND mt.tenant_id = p.tenant_id
     AND mt.deleted_at IS NULL
    WHERE v_search IS NULL
       OR p.name ILIKE v_search_like
       OR p.name_bn ILIKE v_search_like
       OR p.sku ILIKE v_search_like
       OR p.barcode ILIKE v_search_like
       OR g.name ILIKE v_search_like
       OR m.name ILIKE v_search_like
       OR c.name ILIKE v_search_like
       OR mt.name ILIKE v_search_like
       OR p.medicine_type ILIKE v_search_like
       OR EXISTS (
            SELECT 1
            FROM public.batches bx
            WHERE bx.tenant_id = p_tenant_id
              AND bx.product_id = p.id
              AND bx.deleted_at IS NULL
              AND bx.qty_on_hand > 0
              AND bx.batch_no ILIKE v_search_like
          )
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
      CASE WHEN v_sort_by = 'mrp' AND v_sort_dir = 'asc' THEN f.mrp END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'mrp' AND v_sort_dir = 'desc' THEN f.mrp END DESC NULLS LAST,
      f.name ASC,
      f.id ASC
    OFFSET v_offset
    LIMIT v_page_size
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'name_bn', p.name_bn,
      'sku', p.sku,
      'barcode', p.barcode,
      'retail_price', p.retail_price,
      'purchase_price', p.purchase_price,
      'mrp', p.mrp,
      'stock', p.stock,
      'generic_name', p.generic_name,
      'manufacturer_name', p.manufacturer_name,
      'category_name', p.category_name,
      'medicine_type_name', p.medicine_type_name
    ) ORDER BY
      CASE WHEN v_sort_by = 'name' AND v_sort_dir = 'asc' THEN p.name END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'name' AND v_sort_dir = 'desc' THEN p.name END DESC NULLS LAST,
      CASE WHEN v_sort_by = 'sku' AND v_sort_dir = 'asc' THEN p.sku END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'sku' AND v_sort_dir = 'desc' THEN p.sku END DESC NULLS LAST,
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
      CASE WHEN v_sort_by = 'mrp' AND v_sort_dir = 'asc' THEN p.mrp END ASC NULLS LAST,
      CASE WHEN v_sort_by = 'mrp' AND v_sort_dir = 'desc' THEN p.mrp END DESC NULLS LAST,
      p.name ASC,
      p.id ASC
    ), '[]'::jsonb) AS rows,
    counted.total_count,
    v_page AS current_page,
    GREATEST(1, CEIL(counted.total_count::numeric / v_page_size)::integer) AS total_pages
  FROM counted
  LEFT JOIN page_rows p ON TRUE
  GROUP BY counted.total_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_inventory_in_stock_products(uuid, text, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_inventory_in_stock_products(uuid, text, integer, integer, text, text) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_batches_inventory_stock_product
  ON public.batches (tenant_id, product_id, qty_on_hand)
  WHERE deleted_at IS NULL AND qty_on_hand > 0;

CREATE INDEX IF NOT EXISTS idx_batches_inventory_batch_no_trgm
  ON public.batches USING gin (batch_no extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL AND qty_on_hand > 0;

CREATE INDEX IF NOT EXISTS idx_products_inventory_name_bn_trgm
  ON public.products USING gin (name_bn extensions.gin_trgm_ops)
  WHERE name_bn IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_inventory_barcode_trgm
  ON public.products USING gin (barcode extensions.gin_trgm_ops)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_inventory_sku_trgm
  ON public.products USING gin (sku extensions.gin_trgm_ops)
  WHERE sku IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_inventory_mrp
  ON public.products (tenant_id, mrp)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_inventory_retail_price
  ON public.products (tenant_id, retail_price)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_inventory_purchase_price
  ON public.products (tenant_id, purchase_price)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_medicine_types_inventory_name_trgm
  ON public.medicine_types USING gin (name extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_categories_inventory_name_trgm
  ON public.categories USING gin (name extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;