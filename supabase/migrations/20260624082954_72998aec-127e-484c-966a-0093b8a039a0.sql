CREATE OR REPLACE FUNCTION public.commit_opening_stock(_tenant_id uuid, _items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item        jsonb;
  v_product_id  uuid;
  v_qty         numeric;
  v_cost        numeric;
  v_mrp         numeric;
  v_batch_no    text;
  v_mfg         date;
  v_expiry      date;
  v_supplier    uuid;
  v_warehouse   uuid;
  v_branch      uuid;
  v_batch_id    uuid;
  v_journal_id  uuid;
  v_batch_ids   uuid[] := ARRAY[]::uuid[];
  v_journal_ids uuid[] := ARRAY[]::uuid[];
  v_total_qty   numeric := 0;
  v_total_val   numeric := 0;
  v_count       int := 0;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'no items provided' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := COALESCE((v_item->>'qty')::numeric, 0);
    v_cost       := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_mrp        := NULLIF(v_item->>'mrp','')::numeric;
    v_batch_no   := NULLIF(v_item->>'batch_no','');
    v_mfg        := NULLIF(v_item->>'mfg_date','')::date;
    v_expiry     := NULLIF(v_item->>'expiry_date','')::date;
    v_supplier   := NULLIF(v_item->>'supplier_id','')::uuid;
    v_warehouse  := NULLIF(v_item->>'warehouse_id','')::uuid;
    v_branch     := NULLIF(v_item->>'branch_id','')::uuid;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'product_id required' USING ERRCODE = '22023';
    END IF;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'qty must be > 0 for product %', v_product_id USING ERRCODE = '22023';
    END IF;
    IF v_cost < 0 THEN
      RAISE EXCEPTION 'cost must be >= 0 for product %', v_product_id USING ERRCODE = '22023';
    END IF;
    IF v_batch_no IS NULL OR length(v_batch_no) = 0 THEN
      RAISE EXCEPTION 'batch_no required for product %', v_product_id USING ERRCODE = '22023';
    END IF;
    IF v_expiry IS NULL THEN
      RAISE EXCEPTION 'expiry_date required for product %', v_product_id USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.products
                    WHERE id = v_product_id AND tenant_id = _tenant_id) THEN
      RAISE EXCEPTION 'product % not in tenant', v_product_id USING ERRCODE = '23503';
    END IF;

    -- Derive warehouse if not supplied: pick tenant's default/first active warehouse
    IF v_warehouse IS NULL THEN
      SELECT id INTO v_warehouse
        FROM public.warehouses
       WHERE tenant_id = _tenant_id
         AND COALESCE(is_active, true) = true
       ORDER BY COALESCE(is_default, false) DESC, created_at ASC
       LIMIT 1;
    END IF;

    IF v_warehouse IS NULL THEN
      RAISE EXCEPTION 'no warehouse available for tenant %', _tenant_id USING ERRCODE = '22023';
    END IF;

    -- Always derive branch from the warehouse to satisfy batches.branch_id NOT NULL
    SELECT branch_id INTO v_branch
      FROM public.warehouses
     WHERE id = v_warehouse AND tenant_id = _tenant_id;

    IF v_branch IS NULL THEN
      RAISE EXCEPTION 'warehouse % has no branch assigned', v_warehouse USING ERRCODE = '23502';
    END IF;

    IF EXISTS (SELECT 1 FROM public.batches
                WHERE tenant_id = _tenant_id AND product_id = v_product_id
                  AND is_opening = true AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'opening stock already exists for product %', v_product_id
        USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.batches(
      tenant_id, branch_id, product_id, batch_no, mfg_date, expiry_date,
      purchase_price, qty_on_hand, status, is_opening, mrp,
      supplier_id, warehouse_id, source, created_by
    ) VALUES (
      _tenant_id, v_branch, v_product_id, v_batch_no, v_mfg, v_expiry,
      v_cost, v_qty, 'active', true, v_mrp,
      v_supplier, v_warehouse, 'opening_stock', auth.uid()
    ) RETURNING id INTO v_batch_id;

    INSERT INTO public.stock_movements(
      tenant_id, product_id, batch_id, movement_type, qty_change,
      qty_after, reference_table, reference_id, reference_no, user_id, notes
    ) VALUES (
      _tenant_id, v_product_id, v_batch_id, 'opening', v_qty,
      v_qty, 'batches', v_batch_id, v_batch_no, auth.uid(),
      'Opening stock initialization'
    );

    v_journal_id := public.post_opening_stock_journal(_tenant_id, v_batch_id);

    PERFORM public.audit_log_event(_tenant_id, 'opening_stock.created',
      'batches', v_batch_id, NULL,
      jsonb_build_object(
        'product_id', v_product_id, 'qty', v_qty, 'cost', v_cost,
        'value', v_qty * v_cost, 'batch_no', v_batch_no,
        'warehouse_id', v_warehouse, 'branch_id', v_branch,
        'journal_id', v_journal_id));

    v_batch_ids   := array_append(v_batch_ids, v_batch_id);
    IF v_journal_id IS NOT NULL THEN
      v_journal_ids := array_append(v_journal_ids, v_journal_id);
    END IF;
    v_total_qty := v_total_qty + v_qty;
    v_total_val := v_total_val + (v_qty * v_cost);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_ids',   to_jsonb(v_batch_ids),
    'journal_ids', to_jsonb(v_journal_ids),
    'total_qty',   v_total_qty,
    'total_value', v_total_val,
    'count',       v_count
  );
END $function$;

REVOKE EXECUTE ON FUNCTION public.commit_opening_stock(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_opening_stock(uuid, jsonb) TO authenticated;