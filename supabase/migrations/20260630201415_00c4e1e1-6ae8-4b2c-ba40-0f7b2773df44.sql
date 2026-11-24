
CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm
  ON public.products USING gin (barcode extensions.gin_trgm_ops) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm
  ON public.products USING gin (sku extensions.gin_trgm_ops) WHERE sku IS NOT NULL;

CREATE OR REPLACE FUNCTION public.list_products_for_management(
  p_tenant_id uuid,
  p_search text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_status_filter text DEFAULT NULL,  -- 'in' | 'low' | 'out' | 'neg' | NULL
  p_with_count boolean DEFAULT true
)
RETURNS TABLE(
  id uuid, name text, sku text, barcode text,
  retail_price numeric, purchase_price numeric,
  is_active boolean, reorder_level integer,
  medicine_type text, strength text, volume text,
  country_of_origin text, status text, qty_per_box numeric,
  branch_id uuid, generic_name text, manufacturer_name text,
  stock numeric, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_offset integer := GREATEST(p_page - 1, 0) * GREATEST(p_page_size, 1);
  v_limit  integer := LEAST(GREATEST(p_page_size, 1), 200);
  v_search text := NULLIF(btrim(coalesce(p_search,'')), '');
  v_total  bigint := NULL;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), p_tenant_id) THEN
    RETURN;
  END IF;

  -- Optional: cached total count, only computed when asked.
  IF p_with_count THEN
    SELECT count(*) INTO v_total
    FROM public.products pr
    WHERE pr.tenant_id = p_tenant_id
      AND pr.deleted_at IS NULL
      AND (p_barcode IS NULL OR pr.barcode = p_barcode)
      AND (
        v_search IS NULL
        OR pr.name   ILIKE '%' || v_search || '%'
        OR pr.sku    ILIKE '%' || v_search || '%'
        OR pr.barcode ILIKE '%' || v_search || '%'
      );
  END IF;

  RETURN QUERY
  WITH page AS (
    SELECT pr.*
    FROM public.products pr
    WHERE pr.tenant_id = p_tenant_id
      AND pr.deleted_at IS NULL
      AND (p_barcode IS NULL OR pr.barcode = p_barcode)
      AND (
        v_search IS NULL
        OR pr.name    ILIKE '%' || v_search || '%'
        OR pr.sku     ILIKE '%' || v_search || '%'
        OR pr.barcode ILIKE '%' || v_search || '%'
      )
    ORDER BY pr.name
    OFFSET v_offset
    LIMIT  CASE WHEN p_status_filter IS NULL THEN v_limit ELSE v_limit * 4 END
  ), enriched AS (
    SELECT
      pr.id, pr.name, pr.sku, pr.barcode, pr.retail_price, pr.purchase_price,
      pr.is_active, pr.reorder_level, pr.medicine_type, pr.strength, pr.volume,
      pr.country_of_origin, pr.status, pr.qty_per_box, pr.branch_id,
      g.name AS generic_name,
      m.name AS manufacturer_name,
      COALESCE(s.stock, 0)::numeric AS stock
    FROM page pr
    LEFT JOIN public.generics g
      ON g.id = pr.generic_id AND g.tenant_id = pr.tenant_id AND g.deleted_at IS NULL
    LEFT JOIN public.manufacturers m
      ON m.id = pr.manufacturer_id AND m.tenant_id = pr.tenant_id AND m.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(b.qty_on_hand), 0) AS stock
      FROM public.batches b
      WHERE b.product_id = pr.id
        AND b.tenant_id  = pr.tenant_id
        AND b.deleted_at IS NULL
    ) s ON true
  )
  SELECT
    e.id, e.name, e.sku, e.barcode, e.retail_price, e.purchase_price,
    e.is_active, e.reorder_level, e.medicine_type, e.strength, e.volume,
    e.country_of_origin, e.status, e.qty_per_box, e.branch_id,
    e.generic_name, e.manufacturer_name, e.stock, v_total AS total_count
  FROM enriched e
  WHERE p_status_filter IS NULL
     OR (p_status_filter = 'neg' AND e.stock < 0)
     OR (p_status_filter = 'out' AND e.stock = 0)
     OR (p_status_filter = 'low' AND e.stock > 0 AND e.reorder_level IS NOT NULL AND e.stock <= e.reorder_level)
     OR (p_status_filter = 'in'  AND e.stock > 0 AND (e.reorder_level IS NULL OR e.stock > e.reorder_level))
  ORDER BY e.name
  LIMIT v_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION public.list_products_for_management(uuid, text, text, integer, integer, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_products_for_management(uuid, text, text, integer, integer, text, boolean) TO authenticated, service_role;
