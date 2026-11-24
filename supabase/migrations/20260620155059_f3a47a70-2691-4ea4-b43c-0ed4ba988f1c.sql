DROP FUNCTION IF EXISTS public.grn_approve(uuid, uuid);

CREATE OR REPLACE FUNCTION public.grn_approve(
  _tenant_id uuid,
  _grn_id    uuid
) RETURNS public.goods_receipts
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_grn        public.goods_receipts;
  v_item       record;
  v_po         public.purchase_orders;
  v_batch_id   uuid;
  v_new_status po_status;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_grn FROM public.goods_receipts
   WHERE id = _grn_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'GRN not found' USING ERRCODE='23503'; END IF;
  IF v_grn.status = 'approved' THEN
    RAISE EXCEPTION 'GRN already approved' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders
   WHERE id = v_grn.po_id AND tenant_id = _tenant_id FOR UPDATE;

  FOR v_item IN
    SELECT * FROM public.goods_receipt_items
     WHERE grn_id = _grn_id AND tenant_id = _tenant_id
  LOOP
    SELECT id INTO v_batch_id FROM public.batches
     WHERE tenant_id = _tenant_id
       AND product_id = v_item.product_id
       AND batch_no   = v_item.batch_no
     FOR UPDATE;
    IF v_batch_id IS NULL THEN
      INSERT INTO public.batches(
        tenant_id, product_id, batch_no, mfg_date, expiry_date,
        purchase_price, qty_on_hand
      ) VALUES (
        _tenant_id, v_item.product_id, v_item.batch_no,
        v_item.mfg_date, v_item.expiry_date,
        v_item.unit_cost, v_item.qty_received
      ) RETURNING id INTO v_batch_id;
    ELSE
      UPDATE public.batches
         SET qty_on_hand    = qty_on_hand + v_item.qty_received,
             purchase_price = v_item.unit_cost
       WHERE id = v_batch_id;
    END IF;

    UPDATE public.goods_receipt_items
       SET batch_id = v_batch_id
     WHERE id = v_item.id;

    INSERT INTO public.stock_movements(
      tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
      reference_table, reference_id, reference_no, user_id
    ) SELECT
      _tenant_id, v_item.product_id, v_batch_id, 'purchase', v_item.qty_received,
      qty_on_hand, 'goods_receipts', v_grn.id, v_grn.grn_no, auth.uid()
    FROM public.batches WHERE id = v_batch_id;

    UPDATE public.purchase_order_items
       SET qty_received = qty_received + v_item.qty_received
     WHERE id = v_item.po_item_id;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.purchase_order_items
     WHERE purchase_order_id = v_grn.po_id AND qty_received < qty_ordered
  ) THEN
    v_new_status := 'partially_received';
  ELSE
    v_new_status := 'received';
  END IF;
  UPDATE public.purchase_orders
     SET status = v_new_status,
         received_at = CASE WHEN v_new_status='received' THEN now() ELSE received_at END
   WHERE id = v_grn.po_id;

  IF v_grn.supplier_id IS NOT NULL AND v_grn.total_value > 0 THEN
    PERFORM public.post_ledger_entry(
      _tenant_id, 'supplier'::party_type, v_grn.supplier_id, 'purchase'::ledger_entry_type,
      0, v_grn.total_value, 'goods_receipts', v_grn.id, v_grn.grn_no,
      'GRN against PO ' || COALESCE(v_po.po_number, '')
    );
  END IF;

  UPDATE public.goods_receipts
     SET status = 'approved',
         approved_by = auth.uid(),
         approved_at = now()
   WHERE id = v_grn.id
   RETURNING * INTO v_grn;

  PERFORM public.audit_log_event(
    _tenant_id, 'grn.approved', 'goods_receipts', v_grn.id,
    NULL, jsonb_build_object('grn_no', v_grn.grn_no, 'po_id', v_grn.po_id, 'total_value', v_grn.total_value)
  );

  RETURN v_grn;
END $$;

REVOKE ALL ON FUNCTION public.grn_approve(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grn_approve(uuid,uuid) TO authenticated, service_role;
