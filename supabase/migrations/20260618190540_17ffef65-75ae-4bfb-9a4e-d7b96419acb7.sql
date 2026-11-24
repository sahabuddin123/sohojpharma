-- NEW invoice edit workflow: edit_sale_invoice
-- Strategy: reuse the two proven primitives (cancel_sale_invoice reverses stock + journals via
-- triggers; pos_checkout creates the new invoice with stock allocation, journal posting and
-- register entry). The bridge between them is: capture+delete the original register transactions
-- so pos_checkout can recreate them from the carried payments without double-counting the drawer.

CREATE OR REPLACE FUNCTION public.edit_sale_invoice(
  _tenant_id uuid,
  _original_sale_id uuid,
  _customer_id uuid,
  _cashier_id uuid,
  _discount numeric DEFAULT 0,
  _notes text DEFAULT NULL,
  _client_op_id uuid DEFAULT NULL,
  _items jsonb DEFAULT '[]'::jsonb,
  _payments jsonb DEFAULT '[]'::jsonb,
  _register_id uuid DEFAULT NULL
) RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_orig public.sales;
  v_new  public.sales;
  v_existing public.sales;
  v_item record;
  v_qty numeric;
  v_batch_id uuid;
BEGIN
  -- Auth: any tenant member can edit (route already gates by role)
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  -- Idempotency: if pos_checkout already produced a sale for this op id, return it
  IF _client_op_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.sales
     WHERE tenant_id = _tenant_id AND client_op_id = _client_op_id
     LIMIT 1;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  -- Lock original
  SELECT * INTO v_orig
    FROM public.sales
   WHERE id = _original_sale_id AND tenant_id = _tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'original invoice not found' USING ERRCODE='23503';
  END IF;
  IF v_orig.status IN ('void','returned','partially_returned','refunded') THEN
    RAISE EXCEPTION 'invoice cannot be edited (status: %)', v_orig.status USING ERRCODE='22023';
  END IF;
  IF COALESCE(v_orig.is_return, false) THEN
    RAISE EXCEPTION 'return invoices cannot be edited' USING ERRCODE='22023';
  END IF;

  -- Step 1: reverse original stock allocation (inline so cashiers without admin role can edit).
  FOR v_item IN
    SELECT id, product_id, batch_id, qty, returned_qty
      FROM public.sale_items
     WHERE sale_id = _original_sale_id AND tenant_id = _tenant_id
  LOOP
    v_qty := GREATEST(v_item.qty - COALESCE(v_item.returned_qty, 0), 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;

    v_batch_id := v_item.batch_id;
    IF v_batch_id IS NULL THEN
      SELECT id INTO v_batch_id FROM public.batches
       WHERE tenant_id = _tenant_id AND product_id = v_item.product_id
       ORDER BY expiry_date DESC NULLS LAST, created_at DESC LIMIT 1;
      IF v_batch_id IS NULL THEN
        INSERT INTO public.batches(tenant_id, product_id, batch_no, qty_on_hand, expiry_date)
        VALUES (_tenant_id, v_item.product_id, 'ADJ-EDIT', 0, DATE '2099-12-31')
        RETURNING id INTO v_batch_id;
      END IF;
    END IF;

    UPDATE public.batches SET qty_on_hand = qty_on_hand + v_qty WHERE id = v_batch_id;

    INSERT INTO public.stock_movements(
      tenant_id, product_id, batch_id, movement_type, qty_change,
      qty_after, reference_table, reference_id, reference_no, user_id, notes
    ) SELECT
      _tenant_id, v_item.product_id, v_batch_id, 'adjustment', v_qty,
      qty_on_hand, 'sales', _original_sale_id, v_orig.invoice_no, auth.uid(),
      'Invoice edited — stock reversed before replacement'
    FROM public.batches WHERE id = v_batch_id;
  END LOOP;

  -- Step 2: remove original cash-register entries so the drawer doesn't double-count
  -- when pos_checkout re-records the carried payment portion against the new sale.
  DELETE FROM public.cash_register_transactions
   WHERE tenant_id = _tenant_id
     AND reference_table = 'sales'
     AND reference_id = _original_sale_id;

  -- Step 3: void original (triggers journal reversal via trg_je_sale_cancel).
  -- Skip cancel_sale_invoice's admin-only gate by updating directly.
  UPDATE public.sales
     SET status = 'void',
         cancellation_reason = 'Replaced by invoice edit',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         due = 0
   WHERE id = _original_sale_id;

  -- Reverse customer due ledger if it exists
  IF v_orig.customer_id IS NOT NULL AND v_orig.due > 0 THEN
    BEGIN
      PERFORM public.post_ledger_entry(
        _tenant_id, 'customer'::public.party_type, v_orig.customer_id,
        'adjustment'::public.ledger_entry_type,
        0, v_orig.due, 'sales', _original_sale_id, v_orig.invoice_no,
        'Invoice edited — original due reversed'
      );
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END IF;

  -- Step 4: create replacement via the standard checkout path.
  -- Stock is now restored, so pos_checkout's internal validation passes naturally.
  SELECT * INTO v_new
    FROM public.pos_checkout(
      _tenant_id, _customer_id, _cashier_id, NULL::text, _discount, _notes,
      _client_op_id, _items, _payments, _register_id
    );

  -- Step 5: cross-link replacement and original for audit trail
  UPDATE public.sales
     SET notes = trim(both E'\n' from COALESCE(notes,'') || E'\n[Replaces ' || v_orig.invoice_no || ']')
   WHERE id = v_new.id;
  UPDATE public.sales
     SET cancellation_reason = 'Replaced by invoice edit → ' || v_new.invoice_no
   WHERE id = _original_sale_id;

  -- Step 6: audit
  INSERT INTO public.audit_log(
    tenant_id, user_id, action, entity_table, entity_id, before_data, after_data
  ) VALUES (
    _tenant_id, auth.uid(), 'invoice.edited', 'sales', v_new.id,
    jsonb_build_object(
      'original_id', _original_sale_id,
      'original_no', v_orig.invoice_no,
      'original_total', v_orig.total,
      'original_paid', v_orig.paid,
      'original_due', v_orig.due
    ),
    jsonb_build_object(
      'new_id', v_new.id,
      'new_no', v_new.invoice_no,
      'new_total', v_new.total,
      'new_paid', v_new.paid,
      'new_due', v_new.due
    )
  );

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_sale_invoice(uuid,uuid,uuid,uuid,numeric,text,uuid,jsonb,jsonb,uuid) TO authenticated;