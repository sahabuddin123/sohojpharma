
CREATE OR REPLACE FUNCTION public.list_batch_control_batches(
  _tenant_id uuid,
  _search text DEFAULT NULL::text,
  _sort text DEFAULT 'nearest_expiry'::text,
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _q text;
  _off int;
  _lim int;
  _total bigint;
  _rows jsonb;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _q := NULLIF(lower(trim(coalesce(_search,''))), '');
  _lim := GREATEST(1, LEAST(coalesce(_page_size,50), 500));
  _off := GREATEST(0, (GREATEST(1, coalesce(_page,1)) - 1) * _lim);

  WITH filtered AS (
    SELECT b.id
    FROM public.batches b
    LEFT JOIN public.products p ON p.id = b.product_id
    LEFT JOIN public.generics g ON g.id = p.generic_id
    LEFT JOIN public.manufacturers m ON m.id = p.manufacturer_id
    WHERE b.tenant_id = _tenant_id
      AND b.deleted_at IS NULL
      AND (
        _q IS NULL
        OR lower(b.batch_no) LIKE '%'||_q||'%'
        OR lower(coalesce(p.name,'')) LIKE '%'||_q||'%'
        OR lower(coalesce(p.sku,'')) LIKE '%'||_q||'%'
        OR lower(coalesce(p.barcode,'')) LIKE '%'||_q||'%'
        OR lower(coalesce(g.name,'')) LIKE '%'||_q||'%'
        OR lower(coalesce(m.name,'')) LIKE '%'||_q||'%'
      )
  )
  SELECT count(*) INTO _total FROM filtered;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _rows
  FROM (
    SELECT
      b.id, b.batch_no, b.expiry_date, b.mfg_date, b.qty_on_hand,
      b.purchase_price, b.mrp, b.status, b.branch_id, b.supplier_id,
      b.warehouse_id, b.product_id, b.created_at, b.updated_at,
      jsonb_build_object(
        'name', p.name, 'sku', p.sku, 'barcode', p.barcode,
        'strength', p.strength, 'medicine_type', p.medicine_type,
        'volume', p.volume, 'pack_size', p.pack_size,
        'sale_price', p.sale_price,
        'generic_name', g.name,
        'manufacturer_name', m.name
      ) AS products,
      w.name AS warehouse_name,
      s.name AS supplier_name
    FROM public.batches b
    LEFT JOIN public.products p ON p.id = b.product_id
    LEFT JOIN public.generics g ON g.id = p.generic_id
    LEFT JOIN public.manufacturers m ON m.id = p.manufacturer_id
    LEFT JOIN public.warehouses w ON w.id = b.warehouse_id
    LEFT JOIN public.suppliers s ON s.id = b.supplier_id
    WHERE b.tenant_id = _tenant_id
      AND b.deleted_at IS NULL
      AND (
        _q IS NULL
        OR lower(b.batch_no) LIKE '%'||_q||'%'
        OR lower(coalesce(p.name,'')) LIKE '%'||_q||'%'
        OR lower(coalesce(p.sku,'')) LIKE '%'||_q||'%'
        OR lower(coalesce(p.barcode,'')) LIKE '%'||_q||'%'
        OR lower(coalesce(g.name,'')) LIKE '%'||_q||'%'
        OR lower(coalesce(m.name,'')) LIKE '%'||_q||'%'
      )
    ORDER BY
      CASE WHEN _sort = 'nearest_expiry' THEN b.expiry_date END ASC NULLS LAST,
      CASE WHEN _sort = 'latest_expiry'  THEN b.expiry_date END DESC NULLS LAST,
      CASE WHEN _sort = 'stock_desc'     THEN b.qty_on_hand END DESC NULLS LAST,
      CASE WHEN _sort = 'stock_asc'      THEN b.qty_on_hand END ASC NULLS LAST,
      CASE WHEN _sort = 'newest'         THEN b.created_at END DESC NULLS LAST,
      CASE WHEN _sort = 'oldest'         THEN b.created_at END ASC NULLS LAST,
      b.id ASC
    LIMIT _lim OFFSET _off
  ) t;

  RETURN jsonb_build_object(
    'rows', _rows,
    'total_count', _total,
    'page', GREATEST(1, coalesce(_page,1)),
    'page_size', _lim,
    'total_pages', CASE WHEN _total = 0 THEN 0 ELSE CEIL(_total::numeric / _lim)::int END
  );
END;
$function$;
