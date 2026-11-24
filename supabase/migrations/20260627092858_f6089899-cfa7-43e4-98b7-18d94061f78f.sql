CREATE INDEX IF NOT EXISTS idx_batches_tenant_product_active
ON public.batches (tenant_id, product_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_tenant_name_active
ON public.products (tenant_id, name)
WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_opening_stock_products(
  _tenant_id uuid,
  _filter text DEFAULT 'all',
  _search text DEFAULT '',
  _page int DEFAULT 1,
  _page_size int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _safe_page int := GREATEST(COALESCE(_page, 1), 1);
  _limit int := LEAST(GREATEST(COALESCE(_page_size, 50), 1), 500);
  _offset int;
  _q text := NULLIF(TRIM(COALESCE(_search, '')), '');
  _total bigint := 0;
  _no_opening bigint := 0;
  _no_batch bigint := 0;
  _no_cost bigint := 0;
  _all bigint := 0;
  _rows jsonb := '[]'::jsonb;
BEGIN
  _offset := (_safe_page - 1) * _limit;

  WITH batch_summary AS (
    SELECT
      b.product_id,
      COALESCE(SUM(b.qty_on_hand), 0) AS total_qty,
      TRUE AS has_batch,
      BOOL_OR(COALESCE(b.is_opening, FALSE)) AS has_opening
    FROM public.batches b
    WHERE b.tenant_id = _tenant_id
      AND b.deleted_at IS NULL
    GROUP BY b.product_id
  ),
  base AS (
    SELECT
      p.id,
      p.name,
      p.sku,
      p.barcode,
      p.purchase_price,
      p.retail_price,
      COALESCE(bs.total_qty, 0) AS total_qty,
      COALESCE(bs.has_batch, FALSE) AS has_batch,
      COALESCE(bs.has_opening, FALSE) AS has_opening
    FROM public.products p
    LEFT JOIN batch_summary bs ON bs.product_id = p.id
    WHERE p.tenant_id = _tenant_id
      AND p.deleted_at IS NULL
  ),
  searchable AS (
    SELECT *
    FROM base
    WHERE _q IS NULL
       OR LOWER(name) LIKE '%' || LOWER(_q) || '%'
       OR LOWER(COALESCE(sku, '')) LIKE '%' || LOWER(_q) || '%'
       OR LOWER(COALESCE(barcode, '')) LIKE '%' || LOWER(_q) || '%'
  ),
  filtered AS (
    SELECT *
    FROM searchable
    WHERE _filter = 'all'
       OR (_filter = 'no_opening' AND NOT has_opening)
       OR (_filter = 'no_batch' AND NOT has_batch)
       OR (_filter = 'no_cost' AND (purchase_price IS NULL OR purchase_price <= 0))
  ),
  counts AS (
    SELECT
      (SELECT COUNT(*) FROM base) AS all_count,
      (SELECT COUNT(*) FROM base WHERE NOT has_opening) AS no_opening_count,
      (SELECT COUNT(*) FROM base WHERE NOT has_batch) AS no_batch_count,
      (SELECT COUNT(*) FROM base WHERE purchase_price IS NULL OR purchase_price <= 0) AS no_cost_count,
      (SELECT COUNT(*) FROM filtered) AS filtered_count
  ),
  page_rows AS (
    SELECT *
    FROM filtered
    ORDER BY name ASC, id ASC
    OFFSET _offset
    LIMIT _limit
  ),
  row_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'sku', sku,
      'barcode', barcode,
      'purchase_price', purchase_price,
      'retail_price', retail_price,
      'total_qty', total_qty,
      'has_batch', has_batch,
      'has_opening', has_opening
    ) ORDER BY name ASC, id ASC), '[]'::jsonb) AS rows
    FROM page_rows
  )
  SELECT
    c.all_count,
    c.no_opening_count,
    c.no_batch_count,
    c.no_cost_count,
    c.filtered_count,
    r.rows
  INTO _all, _no_opening, _no_batch, _no_cost, _total, _rows
  FROM counts c
  CROSS JOIN row_json r;

  RETURN jsonb_build_object(
    'rows', COALESCE(_rows, '[]'::jsonb),
    'totalCount', COALESCE(_total, 0),
    'page', _safe_page,
    'pageSize', _limit,
    'counts', jsonb_build_object(
      'all', COALESCE(_all, 0),
      'no_opening', COALESCE(_no_opening, 0),
      'no_batch', COALESCE(_no_batch, 0),
      'no_cost', COALESCE(_no_cost, 0)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_opening_stock_products(uuid, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_opening_stock_products(uuid, text, text, integer, integer) TO authenticated, service_role;