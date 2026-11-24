CREATE OR REPLACE FUNCTION public.cancel_sale_invoice(
  _tenant_id uuid,
  _sale_id uuid,
  _reason text,
  _reverse_stock boolean DEFAULT true
)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale     public.sales;
  v_item     record;
  v_qty      numeric;
  v_batch_id uuid;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT public.is_branch_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'only owner / manager can cancel invoices' USING ERRCODE='42501';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'cancellation reason required' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_sale FROM public.sales
    WHERE id = _sale_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found' USING ERRCODE='23503'; END IF;
  IF v_sale.status = 'void' THEN
    RAISE EXCEPTION 'invoice already cancelled' USING ERRCODE='22023';
  END IF;
  IF v_sale.status IN ('returned','partially_returned') THEN
    RAISE EXCEPTION 'returned invoices cannot be cancelled — issue a return instead' USING ERRCODE='22023';
  END IF;

  IF COALESCE(_reverse_stock, true) THEN
    FOR v_item IN
      SELECT id, product_id, batch_id, qty, returned_qty
        FROM public.sale_items
       WHERE sale_id = _sale_id AND tenant_id = _tenant_id
    LOOP
      v_qty := GREATEST(v_item.qty - COALESCE(v_item.returned_qty,0), 0);
      IF v_qty <= 0 THEN CONTINUE; END IF;

      v_batch_id := v_item.batch_id;
      -- Fall back: if the sale item has no batch, pick (or create) one for this product
      IF v_batch_id IS NULL THEN
        SELECT id INTO v_batch_id
          FROM public.batches
         WHERE tenant_id = _tenant_id AND product_id = v_item.product_id
         ORDER BY expiry_date NULLS LAST, created_at DESC
         LIMIT 1;
        IF v_batch_id IS NULL THEN
          INSERT INTO public.batches(tenant_id, product_id, batch_no, qty_on_hand)
          VALUES (_tenant_id, v_item.product_id, 'ADJ-CANCEL', 0)
          RETURNING id INTO v_batch_id;
        END IF;
      END IF;

      UPDATE public.batches
         SET qty_on_hand = qty_on_hand + v_qty
       WHERE id = v_batch_id;

      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id, notes
      ) SELECT
        _tenant_id, v_item.product_id, v_batch_id, 'adjustment', v_qty,
        qty_on_hand, 'sales', _sale_id, v_sale.invoice_no, auth.uid(),
        'Invoice cancelled — ' || _reason
      FROM public.batches WHERE id = v_batch_id;
    END LOOP;
  END IF;

  IF v_sale.customer_id IS NOT NULL AND v_sale.due > 0 THEN
    BEGIN
      PERFORM public.post_ledger_entry(
        _tenant_id, 'customer'::public.party_type, v_sale.customer_id,
        'adjustment'::public.ledger_entry_type,
        0, v_sale.due, 'sales', _sale_id, v_sale.invoice_no,
        'Cancellation reversal — ' || _reason
      );
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END IF;

  UPDATE public.sales
     SET status = 'void',
         cancellation_reason = _reason,
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         due = 0
   WHERE id = _sale_id
   RETURNING * INTO v_sale;

  INSERT INTO public.audit_log(
    tenant_id, user_id, action, entity_table, entity_id, before_data, after_data
  ) VALUES (
    _tenant_id, auth.uid(), 'invoice.cancelled', 'sales', _sale_id,
    jsonb_build_object('status', 'completed'),
    jsonb_build_object('status','void','reason',_reason,'reverse_stock',_reverse_stock)
  );

  RETURN v_sale;
END;
$$;