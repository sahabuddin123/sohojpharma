
-- Paginated, searchable, sortable batch listing for Batch Control
CREATE OR REPLACE FUNCTION public.list_batch_control_batches(
  _tenant_id uuid,
  _search text DEFAULT NULL,
  _sort text DEFAULT 'nearest_expiry',
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
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
    WHERE b.tenant_id = _tenant_id
      AND b.deleted_at IS NULL
      AND (
        _q IS NULL
        OR lower(b.batch_no) LIKE '%'||_q||'%'
        OR lower(coalesce(p.name,'')) LIKE '%'||_q||'%'
        OR lower(coalesce(p.sku,'')) LIKE '%'||_q||'%'
        OR lower(coalesce(p.barcode,'')) LIKE '%'||_q||'%'
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
        'sale_price', p.sale_price
      ) AS products,
      w.name AS warehouse_name,
      s.name AS supplier_name
    FROM public.batches b
    LEFT JOIN public.products p ON p.id = b.product_id
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
      )
    ORDER BY
      CASE WHEN _sort = 'nearest_expiry' THEN b.expiry_date END ASC NULLS LAST,
      CASE WHEN _sort = 'latest_expiry'  THEN b.expiry_date END DESC NULLS LAST,
      CASE WHEN _sort = 'stock_desc'     THEN b.qty_on_hand END DESC NULLS LAST,
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
$$;

REVOKE ALL ON FUNCTION public.list_batch_control_batches(uuid,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_batch_control_batches(uuid,text,text,integer,integer) TO authenticated, service_role;

-- Single-batch expiry update with audit log
CREATE OR REPLACE FUNCTION public.update_batch_expiry(
  _tenant_id uuid,
  _batch_id uuid,
  _new_expiry date,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _old_expiry date;
  _mfg date;
  _tid uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_tenant_member(_uid, _tenant_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _new_expiry IS NULL THEN RAISE EXCEPTION 'expiry required'; END IF;
  IF _new_expiry < CURRENT_DATE THEN RAISE EXCEPTION 'expiry cannot be in the past'; END IF;

  SELECT expiry_date, mfg_date, tenant_id INTO _old_expiry, _mfg, _tid
  FROM public.batches WHERE id = _batch_id AND deleted_at IS NULL;
  IF _tid IS NULL THEN RAISE EXCEPTION 'batch not found'; END IF;
  IF _tid <> _tenant_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _mfg IS NOT NULL AND _new_expiry <= _mfg THEN
    RAISE EXCEPTION 'expiry must be after manufacture date';
  END IF;

  UPDATE public.batches
     SET expiry_date = _new_expiry, updated_at = now(), updated_by = _uid
   WHERE id = _batch_id;

  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_table, entity_id, before_data, after_data)
  VALUES (
    _tenant_id, _uid, 'batch_expiry_updated', 'batches', _batch_id,
    jsonb_build_object('expiry_date', _old_expiry),
    jsonb_build_object('expiry_date', _new_expiry, 'reason', _reason)
  );

  RETURN jsonb_build_object('id', _batch_id, 'old_expiry', _old_expiry, 'new_expiry', _new_expiry);
END;
$$;

REVOKE ALL ON FUNCTION public.update_batch_expiry(uuid,uuid,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_batch_expiry(uuid,uuid,date,text) TO authenticated, service_role;

-- Supporting indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_batches_tenant_active_expiry
  ON public.batches (tenant_id, expiry_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_batches_tenant_active_created
  ON public.batches (tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_batches_tenant_active_stock
  ON public.batches (tenant_id, qty_on_hand DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_batches_batch_no_lower
  ON public.batches (lower(batch_no)) WHERE deleted_at IS NULL;
