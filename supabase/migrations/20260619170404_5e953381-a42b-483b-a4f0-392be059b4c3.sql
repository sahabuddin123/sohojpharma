
DROP FUNCTION IF EXISTS public.warehouse_kpis(uuid, uuid);

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS from_warehouse_id uuid REFERENCES public.warehouses(id),
  ADD COLUMN IF NOT EXISTS to_warehouse_id   uuid REFERENCES public.warehouses(id),
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_wh ON public.stock_transfers(tenant_id, from_warehouse_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_wh   ON public.stock_transfers(tenant_id, to_warehouse_id, status);

CREATE OR REPLACE FUNCTION public.warehouse_kpis(_tenant_id uuid, _warehouse_id uuid)
RETURNS TABLE(
  stock_value numeric,
  total_products integer,
  low_stock_count integer,
  out_of_stock_count integer,
  expiring_count integer,
  sales_today numeric,
  sales_this_month numeric,
  purchase_this_month numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE((SELECT SUM(b.qty_on_hand * COALESCE(b.purchase_price,0))
              FROM public.batches b
              WHERE b.tenant_id=_tenant_id AND b.warehouse_id=_warehouse_id),0)::numeric,
    COALESCE((SELECT COUNT(DISTINCT b.product_id)::int FROM public.batches b
              WHERE b.tenant_id=_tenant_id AND b.warehouse_id=_warehouse_id AND b.qty_on_hand > 0),0),
    COALESCE((SELECT COUNT(DISTINCT b.product_id)::int FROM public.batches b
              JOIN public.products p ON p.id=b.product_id
              WHERE b.tenant_id=_tenant_id AND b.warehouse_id=_warehouse_id
                AND COALESCE(p.reorder_level,0) > 0
                AND b.qty_on_hand <= p.reorder_level AND b.qty_on_hand > 0),0),
    COALESCE((SELECT COUNT(DISTINCT b.product_id)::int FROM public.batches b
              WHERE b.tenant_id=_tenant_id AND b.warehouse_id=_warehouse_id AND b.qty_on_hand <= 0),0),
    COALESCE((SELECT COUNT(*)::int FROM public.batches b
              WHERE b.tenant_id=_tenant_id AND b.warehouse_id=_warehouse_id
                AND b.qty_on_hand > 0 AND b.expiry_date IS NOT NULL
                AND b.expiry_date <= (CURRENT_DATE + INTERVAL '30 days')),0),
    COALESCE((SELECT SUM(total) FROM public.sales
              WHERE tenant_id=_tenant_id AND warehouse_id=_warehouse_id
                AND created_at >= date_trunc('day', now())),0)::numeric,
    COALESCE((SELECT SUM(total) FROM public.sales
              WHERE tenant_id=_tenant_id AND warehouse_id=_warehouse_id
                AND created_at >= date_trunc('month', now())),0)::numeric,
    COALESCE((SELECT SUM(total) FROM public.purchases
              WHERE tenant_id=_tenant_id
                AND created_at >= date_trunc('month', now())),0)::numeric;
$$;

CREATE OR REPLACE FUNCTION public.can_access_warehouse(_user_id uuid, _tenant_id uuid, _warehouse_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_tenant_member(_user_id, _tenant_id);
$$;

CREATE OR REPLACE FUNCTION public.stock_transfer_request(
  _tenant_id uuid,
  _from_warehouse_id uuid,
  _to_warehouse_id uuid,
  _items jsonb,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_no text;
  v_from_branch uuid;
  v_to_branch uuid;
  v_item jsonb;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _from_warehouse_id = _to_warehouse_id THEN
    RAISE EXCEPTION 'same_warehouse' USING ERRCODE='22023';
  END IF;

  SELECT branch_id INTO v_from_branch FROM public.warehouses WHERE id=_from_warehouse_id AND tenant_id=_tenant_id;
  SELECT branch_id INTO v_to_branch   FROM public.warehouses WHERE id=_to_warehouse_id   AND tenant_id=_tenant_id;

  v_no := 'TR-' || to_char(now(), 'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

  INSERT INTO public.stock_transfers(
    tenant_id, transfer_no, from_branch_id, to_branch_id,
    from_warehouse_id, to_warehouse_id,
    status, requested_by, notes, requested_at
  ) VALUES (
    _tenant_id, v_no, v_from_branch, v_to_branch,
    _from_warehouse_id, _to_warehouse_id,
    'requested', auth.uid(), _notes, now()
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.stock_transfer_items(
      tenant_id, transfer_id, product_id, batch_id,
      qty_requested, qty_sent, qty_received, unit_cost
    ) VALUES (
      _tenant_id, v_id,
      (v_item->>'product_id')::uuid,
      NULLIF(v_item->>'batch_id','')::uuid,
      (v_item->>'qty')::numeric, 0, 0,
      COALESCE((v_item->>'unit_cost')::numeric, 0)
    );
  END LOOP;

  PERFORM public.notify_tenant_v2(
    _tenant_id, 'info', 'transfer_requested',
    'Stock Transfer Requested',
    'Transfer ' || v_no || ' requested.',
    '/inventory/transfers/' || v_id::text,
    'stock_transfer', v_id, jsonb_build_object('transfer_no', v_no)
  );

  INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
  VALUES (_tenant_id, auth.uid(), 'warehouse.transfer.requested', 'stock_transfers', v_id,
          jsonb_build_object('transfer_no', v_no, 'from_warehouse_id', _from_warehouse_id, 'to_warehouse_id', _to_warehouse_id));

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.stock_transfer_approve(_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t public.stock_transfers;
  v_item public.stock_transfer_items;
  v_qty_after numeric;
BEGIN
  SELECT * INTO v_t FROM public.stock_transfers WHERE id=_transfer_id;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_t.tenant_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF v_t.status <> 'requested' THEN RAISE EXCEPTION 'invalid_status:%', v_t.status; END IF;

  FOR v_item IN SELECT * FROM public.stock_transfer_items WHERE transfer_id=_transfer_id LOOP
    IF v_item.batch_id IS NOT NULL THEN
      UPDATE public.batches SET qty_on_hand = qty_on_hand - v_item.qty_requested, updated_at=now()
        WHERE id=v_item.batch_id AND warehouse_id=v_t.from_warehouse_id AND qty_on_hand >= v_item.qty_requested
        RETURNING qty_on_hand INTO v_qty_after;
      IF v_qty_after IS NULL THEN
        RAISE EXCEPTION 'insufficient_stock_batch:%', v_item.batch_id USING ERRCODE='23514';
      END IF;
      INSERT INTO public.stock_movements(tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
        reference_table, reference_id, reference_no, user_id, warehouse_id, notes)
      VALUES (v_t.tenant_id, v_item.product_id, v_item.batch_id, 'transfer_out', -v_item.qty_requested, v_qty_after,
        'stock_transfers', _transfer_id, v_t.transfer_no, auth.uid(), v_t.from_warehouse_id, 'Transfer approved');
    END IF;
    UPDATE public.stock_transfer_items SET qty_sent = qty_requested WHERE id=v_item.id;
  END LOOP;

  UPDATE public.stock_transfers
    SET status='in_transit', approved_by=auth.uid(), approved_at=now(), shipped_at=now()
    WHERE id=_transfer_id;

  PERFORM public.notify_tenant_v2(v_t.tenant_id, 'success', 'transfer_approved',
    'Stock Transfer Approved', 'Transfer ' || v_t.transfer_no || ' is in transit.',
    '/inventory/transfers/' || _transfer_id::text, 'stock_transfer', _transfer_id, '{}'::jsonb);

  INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
  VALUES (v_t.tenant_id, auth.uid(), 'warehouse.transfer.approved', 'stock_transfers', _transfer_id,
          jsonb_build_object('transfer_no', v_t.transfer_no));
END $$;

CREATE OR REPLACE FUNCTION public.stock_transfer_reject(_transfer_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t public.stock_transfers;
BEGIN
  SELECT * INTO v_t FROM public.stock_transfers WHERE id=_transfer_id;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_t.tenant_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF v_t.status NOT IN ('requested') THEN RAISE EXCEPTION 'invalid_status:%', v_t.status; END IF;

  UPDATE public.stock_transfers
    SET status='rejected', rejected_by=auth.uid(), rejected_at=now(), rejection_reason=_reason
    WHERE id=_transfer_id;

  PERFORM public.notify_tenant_v2(v_t.tenant_id, 'warning', 'transfer_rejected',
    'Stock Transfer Rejected', 'Transfer ' || v_t.transfer_no || ' rejected.',
    '/inventory/transfers/' || _transfer_id::text, 'stock_transfer', _transfer_id,
    jsonb_build_object('reason', _reason));

  INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
  VALUES (v_t.tenant_id, auth.uid(), 'warehouse.transfer.rejected', 'stock_transfers', _transfer_id,
          jsonb_build_object('reason', _reason));
END $$;

CREATE OR REPLACE FUNCTION public.stock_transfer_receive(_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t public.stock_transfers;
  v_item public.stock_transfer_items;
  v_dest_batch uuid;
  v_src public.batches;
  v_qty_after numeric;
BEGIN
  SELECT * INTO v_t FROM public.stock_transfers WHERE id=_transfer_id;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_t.tenant_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF v_t.status <> 'in_transit' THEN RAISE EXCEPTION 'invalid_status:%', v_t.status; END IF;

  FOR v_item IN SELECT * FROM public.stock_transfer_items WHERE transfer_id=_transfer_id LOOP
    IF v_item.batch_id IS NOT NULL THEN
      SELECT * INTO v_src FROM public.batches WHERE id=v_item.batch_id;
      SELECT id INTO v_dest_batch FROM public.batches
        WHERE tenant_id=v_t.tenant_id AND warehouse_id=v_t.to_warehouse_id
          AND product_id=v_src.product_id AND batch_no=v_src.batch_no
          AND expiry_date IS NOT DISTINCT FROM v_src.expiry_date
        LIMIT 1;
      IF v_dest_batch IS NULL THEN
        INSERT INTO public.batches(tenant_id, product_id, batch_no, mfg_date, expiry_date,
          purchase_price, mrp, qty_on_hand, warehouse_id, branch_id, supplier_id, source, status)
        VALUES (v_t.tenant_id, v_src.product_id, v_src.batch_no, v_src.mfg_date, v_src.expiry_date,
          v_src.purchase_price, v_src.mrp, v_item.qty_sent, v_t.to_warehouse_id, v_t.to_branch_id,
          v_src.supplier_id, 'transfer', 'active')
        RETURNING id INTO v_dest_batch;
        v_qty_after := v_item.qty_sent;
      ELSE
        UPDATE public.batches SET qty_on_hand = qty_on_hand + v_item.qty_sent, updated_at=now()
          WHERE id=v_dest_batch RETURNING qty_on_hand INTO v_qty_after;
      END IF;

      INSERT INTO public.stock_movements(tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
        reference_table, reference_id, reference_no, user_id, warehouse_id, notes)
      VALUES (v_t.tenant_id, v_item.product_id, v_dest_batch, 'transfer_in', v_item.qty_sent, v_qty_after,
        'stock_transfers', _transfer_id, v_t.transfer_no, auth.uid(), v_t.to_warehouse_id, 'Transfer received');

      UPDATE public.stock_transfer_items SET qty_received = qty_sent WHERE id=v_item.id;
    END IF;
  END LOOP;

  UPDATE public.stock_transfers
    SET status='received', received_by=auth.uid(), received_at=now()
    WHERE id=_transfer_id;

  PERFORM public.notify_tenant_v2(v_t.tenant_id, 'success', 'transfer_received',
    'Stock Transfer Received', 'Transfer ' || v_t.transfer_no || ' received.',
    '/inventory/transfers/' || _transfer_id::text, 'stock_transfer', _transfer_id, '{}'::jsonb);

  INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
  VALUES (v_t.tenant_id, auth.uid(), 'warehouse.transfer.received', 'stock_transfers', _transfer_id,
          jsonb_build_object('transfer_no', v_t.transfer_no));
END $$;

GRANT EXECUTE ON FUNCTION public.stock_transfer_request(uuid,uuid,uuid,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_transfer_approve(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_transfer_reject(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_transfer_receive(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.warehouse_kpis(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_warehouse(uuid,uuid,uuid) TO authenticated;
