
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
  _offset int := GREATEST((COALESCE(_page,1) - 1) * COALESCE(_page_size,50), 0);
  _limit int := LEAST(GREATEST(COALESCE(_page_size,50), 1), 500);
  _q text := NULLIF(TRIM(COALESCE(_search,'')), '');
  _total bigint;
  _no_opening bigint;
  _no_batch bigint;
  _no_cost bigint;
  _all bigint;
  _rows jsonb;
BEGIN
  WITH base AS (
    SELECT p.id, p.name, p.sku, p.barcode, p.purchase_price, p.retail_price,
      COALESCE((SELECT SUM(b.qty_on_hand) FROM batches b WHERE b.product_id = p.id AND b.deleted_at IS NULL), 0) AS total_qty,
      EXISTS (SELECT 1 FROM batches b WHERE b.product_id = p.id AND b.deleted_at IS NULL) AS has_batch,
      EXISTS (SELECT 1 FROM batches b WHERE b.product_id = p.id AND b.deleted_at IS NULL AND b.is_opening) AS has_opening
    FROM products p
    WHERE p.tenant_id = _tenant_id AND p.deleted_at IS NULL
  ),
  filtered AS (
    SELECT * FROM base
    WHERE (_q IS NULL
       OR LOWER(name) LIKE '%'||LOWER(_q)||'%'
       OR LOWER(COALESCE(sku,'')) LIKE '%'||LOWER(_q)||'%'
       OR LOWER(COALESCE(barcode,'')) LIKE '%'||LOWER(_q)||'%')
      AND (
        _filter = 'all'
        OR (_filter = 'no_opening' AND NOT has_opening)
        OR (_filter = 'no_batch' AND NOT has_batch)
        OR (_filter = 'no_cost' AND (purchase_price IS NULL OR purchase_price <= 0))
      )
  )
  SELECT COUNT(*) INTO _total FROM filtered;

  SELECT
    COUNT(*) FILTER (WHERE TRUE),
    COUNT(*) FILTER (WHERE NOT has_opening),
    COUNT(*) FILTER (WHERE NOT has_batch),
    COUNT(*) FILTER (WHERE purchase_price IS NULL OR purchase_price <= 0)
  INTO _all, _no_opening, _no_batch, _no_cost
  FROM (
    SELECT has_opening, has_batch, purchase_price FROM (
      SELECT
        EXISTS (SELECT 1 FROM batches b WHERE b.product_id = p.id AND b.deleted_at IS NULL AND b.is_opening) AS has_opening,
        EXISTS (SELECT 1 FROM batches b WHERE b.product_id = p.id AND b.deleted_at IS NULL) AS has_batch,
        p.purchase_price
      FROM products p
      WHERE p.tenant_id = _tenant_id AND p.deleted_at IS NULL
    ) x
  ) y;

  WITH base AS (
    SELECT p.id, p.name, p.sku, p.barcode, p.purchase_price, p.retail_price,
      COALESCE((SELECT SUM(b.qty_on_hand) FROM batches b WHERE b.product_id = p.id AND b.deleted_at IS NULL), 0) AS total_qty,
      EXISTS (SELECT 1 FROM batches b WHERE b.product_id = p.id AND b.deleted_at IS NULL) AS has_batch,
      EXISTS (SELECT 1 FROM batches b WHERE b.product_id = p.id AND b.deleted_at IS NULL AND b.is_opening) AS has_opening
    FROM products p
    WHERE p.tenant_id = _tenant_id AND p.deleted_at IS NULL
  ),
  filtered AS (
    SELECT * FROM base
    WHERE (_q IS NULL
       OR LOWER(name) LIKE '%'||LOWER(_q)||'%'
       OR LOWER(COALESCE(sku,'')) LIKE '%'||LOWER(_q)||'%'
       OR LOWER(COALESCE(barcode,'')) LIKE '%'||LOWER(_q)||'%')
      AND (
        _filter = 'all'
        OR (_filter = 'no_opening' AND NOT has_opening)
        OR (_filter = 'no_batch' AND NOT has_batch)
        OR (_filter = 'no_cost' AND (purchase_price IS NULL OR purchase_price <= 0))
      )
    ORDER BY name
    OFFSET _offset LIMIT _limit
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'sku', sku, 'barcode', barcode,
    'purchase_price', purchase_price, 'retail_price', retail_price,
    'total_qty', total_qty, 'has_batch', has_batch, 'has_opening', has_opening
  )), '[]'::jsonb)
  INTO _rows FROM filtered;

  RETURN jsonb_build_object(
    'rows', _rows,
    'totalCount', _total,
    'page', COALESCE(_page,1),
    'pageSize', _limit,
    'counts', jsonb_build_object(
      'all', _all,
      'no_opening', _no_opening,
      'no_batch', _no_batch,
      'no_cost', _no_cost
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_opening_stock_products(uuid, text, text, int, int) TO authenticated, service_role;
