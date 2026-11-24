
CREATE OR REPLACE FUNCTION public.list_actionable_batches(_tenant_id uuid, _search text DEFAULT NULL, _limit int DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rows jsonb;
  _q text;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _q := NULLIF(lower(trim(coalesce(_search,''))), '');

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _rows
  FROM (
    SELECT
      b.id, b.batch_no, b.expiry_date, b.qty_on_hand, b.purchase_price,
      b.status, b.branch_id, b.supplier_id, b.product_id,
      jsonb_build_object(
        'name', p.name,
        'sku', p.sku,
        'strength', p.strength,
        'medicine_type', p.medicine_type,
        'volume', p.volume,
        'pack_size', p.pack_size
      ) AS products
    FROM public.batches b
    LEFT JOIN public.products p ON p.id = b.product_id
    WHERE b.tenant_id = _tenant_id
      AND b.deleted_at IS NULL
      AND (
        _q IS NULL
        OR lower(b.batch_no) LIKE '%'||_q||'%'
        OR lower(coalesce(p.name,'')) LIKE '%'||_q||'%'
        OR lower(coalesce(p.sku,'')) LIKE '%'||_q||'%'
      )
    ORDER BY b.expiry_date ASC NULLS LAST
    LIMIT GREATEST(1, LEAST(_limit, 1000))
  ) t;

  RETURN _rows;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_actionable_batches(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_actionable_batches(uuid, text, int) TO authenticated, service_role;
