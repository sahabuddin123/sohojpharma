CREATE OR REPLACE FUNCTION public.replace_sale_invoice(
  _tenant_id uuid,
  _original_sale_id uuid,
  _customer_id uuid,
  _cashier_id uuid,
  _discount numeric DEFAULT 0,
  _notes text DEFAULT NULL::text,
  _client_op_id uuid DEFAULT NULL::uuid,
  _items jsonb DEFAULT '[]'::jsonb,
  _payments jsonb DEFAULT '[]'::jsonb,
  _register_id uuid DEFAULT NULL::uuid
) RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original public.sales;
  v_replacement public.sales;
  v_existing_payment_count integer := 0;
  v_existing_paid numeric := 0;
  v_missing_paid numeric := 0;
  v_effective_payments jsonb := '[]'::jsonb;
  v_expected_total numeric := 0;
  v_effective_paid numeric := 0;
  v_due_placeholder numeric := 0;
  v_first_method text;
  v_pay_count integer := 0;
  v_tenant_allow_override boolean := false;
  v_requested record;
  v_original_qty numeric := 0;
  v_current_stock numeric := 0;
  v_available_stock numeric := 0;
  v_orig_item record;
  v_restore_batch_id uuid;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
  END IF;

  IF _original_sale_id IS NULL THEN
    RAISE EXCEPTION 'original invoice id is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_original
    FROM public.sales
   WHERE id = _original_sale_id AND tenant_id = _tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'original invoice not found' USING ERRCODE = '23503';
  END IF;
  IF v_original.status = 'void' THEN
    RAISE EXCEPTION 'original invoice already cancelled' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_original.is_return, false) THEN
    RAISE EXCEPTION 'returned invoice cannot be edited' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'cart is empty' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(allow_stock_override, false)
    INTO v_tenant_allow_override
    FROM public.tenants
   WHERE id = _tenant_id;

  -- Edit-mode stock validation must count stock already consumed by the original invoice.
  -- This prevents unchanged edited lines from failing when current stock is zero.
  FOR v_requested IN
    SELECT
      (item->>'product_id')::uuid AS product_id,
      SUM(COALESCE((item->>'qty')::numeric, 0)) AS requested_qty,
      BOOL_OR(COALESCE((item->>'allow_stock_override')::boolean, false)) AS line_allows_override
    FROM jsonb_array_elements(_items) AS item
    GROUP BY (item->>'product_id')::uuid
  LOOP
    IF v_requested.requested_qty IS NULL OR v_requested.requested_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty for product %', v_requested.product_id USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(SUM(qty_on_hand), 0)
      INTO v_current_stock
      FROM public.batches
     WHERE tenant_id = _tenant_id
       AND product_id = v_requested.product_id;

    SELECT COALESCE(SUM(GREATEST(qty - COALESCE(returned_qty, 0), 0)), 0)
      INTO v_original_qty
      FROM public.sale_items
     WHERE tenant_id = _tenant_id
       AND sale_id = _original_sale_id
       AND product_id = v_requested.product_id;

    v_available_stock := COALESCE(v_current_stock, 0) + COALESCE(v_original_qty, 0);

    IF v_requested.requested_qty > v_available_stock + 0.0001
       AND NOT (COALESCE(v_tenant_allow_override, false) AND COALESCE(v_requested.line_allows_override, false)) THEN
      RAISE EXCEPTION 'insufficient stock for product % during invoice edit: requested %, available % (current % + original invoice %)',
        v_requested.product_id,
        v_requested.requested_qty,
        v_available_stock,
        COALESCE(v_current_stock, 0),
        COALESCE(v_original_qty, 0)
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- Physically restore the original invoice stock inside this transaction before checkout.
  -- If any later step fails, PostgreSQL rolls this restore back and the original sale is unchanged.
  FOR v_orig_item IN
    SELECT
      si.product_id,
      si.batch_id,
      SUM(GREATEST(si.qty - COALESCE(si.returned_qty, 0), 0)) AS qty,
      COALESCE(NULLIF(MAX(si.unit_cost), 0), NULLIF(MAX(p.purchase_price), 0), 0) AS unit_cost
    FROM public.sale_items si
    LEFT JOIN public.products p
      ON p.id = si.product_id
     AND p.tenant_id = si.tenant_id
    WHERE si.tenant_id = _tenant_id
      AND si.sale_id = _original_sale_id
    GROUP BY si.product_id, si.batch_id
  LOOP
    IF COALESCE(v_orig_item.qty, 0) <= 0 THEN
      CONTINUE;
    END IF;

    v_restore_batch_id := v_orig_item.batch_id;

    IF v_restore_batch_id IS NULL THEN
      INSERT INTO public.batches(
        tenant_id, product_id, batch_no, expiry_date,
        purchase_price, qty_on_hand, created_by, source
      ) VALUES (
        _tenant_id,
        v_orig_item.product_id,
        'POS-EDIT-' || left(v_orig_item.product_id::text, 8),
        DATE '2099-12-31',
        COALESCE(v_orig_item.unit_cost, 0),
        0,
        _cashier_id,
        'pos_edit_restore'
      )
      ON CONFLICT (tenant_id, product_id, batch_no)
      DO UPDATE SET updated_at = now()
      RETURNING id INTO v_restore_batch_id;
    END IF;

    UPDATE public.batches
       SET qty_on_hand = qty_on_hand + v_orig_item.qty,
           updated_at = now(),
           updated_by = _cashier_id
     WHERE id = v_restore_batch_id
       AND tenant_id = _tenant_id;

    INSERT INTO public.stock_movements(
      tenant_id, product_id, batch_id, movement_type, qty_change,
      qty_after, reference_table, reference_id, reference_no, user_id, notes
    )
    SELECT
      _tenant_id,
      v_orig_item.product_id,
      v_restore_batch_id,
      'adjustment'::public.movement_type,
      v_orig_item.qty,
      b.qty_on_hand,
      'sales',
      _original_sale_id,
      v_original.invoice_no,
      _cashier_id,
      'POS edit temporary stock restore before replacement checkout'
    FROM public.batches b
    WHERE b.id = v_restore_batch_id;
  END LOOP;

  -- Carry forward original paid amount. Due is recalculated after replacement total is known.
  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_existing_payment_count, v_existing_paid
    FROM public.sale_payments
   WHERE tenant_id = _tenant_id
     AND sale_id = _original_sale_id
     AND method::text <> 'due'
     AND amount > 0;

  SELECT COALESCE(
           jsonb_agg(jsonb_build_object(
             'method', method::text,
             'amount', amount,
             'reference', reference,
             'mobile_no', mobile_no
           ) ORDER BY created_at, id),
           '[]'::jsonb
         )
    INTO v_effective_payments
    FROM public.sale_payments
   WHERE tenant_id = _tenant_id
     AND sale_id = _original_sale_id
     AND method::text <> 'due'
     AND amount > 0;

  v_missing_paid := GREATEST(COALESCE(v_original.paid, 0) - COALESCE(v_existing_paid, 0), 0);
  IF v_missing_paid > 0.009 THEN
    v_effective_payments := v_effective_payments || jsonb_build_array(jsonb_build_object(
      'method', 'cash',
      'amount', ROUND(v_missing_paid, 2),
      'reference', 'legacy-paid-carry-forward'
    ));
  END IF;

  SELECT COALESCE(SUM(
           COALESCE((item->>'qty')::numeric, 0) * COALESCE((item->>'unit_price')::numeric, 0)
           - COALESCE((item->>'discount')::numeric, 0)
           + COALESCE((item->>'vat')::numeric, 0)
         ), 0) - COALESCE(_discount, 0)
    INTO v_expected_total
    FROM jsonb_array_elements(_items) AS item;

  v_expected_total := GREATEST(ROUND(v_expected_total, 2), 0);
  v_effective_paid := COALESCE(v_existing_paid, 0) + COALESCE(v_missing_paid, 0);
  v_due_placeholder := GREATEST(v_expected_total - v_effective_paid, 0);

  IF _customer_id IS NULL AND v_due_placeholder > 0.009 THEN
    v_effective_payments := v_effective_payments || jsonb_build_array(jsonb_build_object(
      'method', 'cash',
      'amount', ROUND(v_due_placeholder, 2),
      'reference', '__pos_edit_due_placeholder__'
    ));
  END IF;

  v_replacement := public.pos_checkout(
    _tenant_id,
    _customer_id,
    _cashier_id,
    NULL,
    COALESCE(_discount, 0),
    _notes,
    _client_op_id,
    _items,
    v_effective_payments,
    _register_id
  );

  -- Void the original only after replacement checkout succeeds. Stock is not reversed here
  -- because it was restored explicitly before checkout in the same transaction.
  PERFORM public.cancel_sale_invoice(
    _tenant_id,
    _original_sale_id,
    'Replaced via POS edit',
    false
  );

  DELETE FROM public.sale_payments
   WHERE tenant_id = _tenant_id
     AND sale_id = v_replacement.id
     AND reference = '__pos_edit_due_placeholder__';

  IF v_existing_payment_count > 0 THEN
    DELETE FROM public.sale_payments
     WHERE tenant_id = _tenant_id
       AND sale_id = v_replacement.id;

    DELETE FROM public.cash_register_transactions
     WHERE tenant_id = _tenant_id
       AND reference_table = 'sales'
       AND reference_id = v_replacement.id
       AND transaction_type = 'sale';

    UPDATE public.sale_payments
       SET sale_id = v_replacement.id
     WHERE tenant_id = _tenant_id
       AND sale_id = _original_sale_id
       AND method::text <> 'due'
       AND amount > 0;

    UPDATE public.cash_register_transactions
       SET reference_id = v_replacement.id,
           reference_no = v_replacement.invoice_no,
           notes = 'Sale ' || v_replacement.invoice_no || ' (payment carried from ' || v_original.invoice_no || ')'
     WHERE tenant_id = _tenant_id
       AND reference_table = 'sales'
       AND reference_id = _original_sale_id
       AND transaction_type = 'sale';

    IF v_missing_paid > 0.009 THEN
      INSERT INTO public.sale_payments(
        tenant_id, sale_id, method, amount, reference, created_by
      ) VALUES (
        _tenant_id, v_replacement.id, 'cash', ROUND(v_missing_paid, 2),
        'legacy-paid-carry-forward', _cashier_id
      );
    END IF;
  END IF;

  SELECT COALESCE(SUM(amount), 0), COUNT(*),
         COALESCE((SELECT method::text FROM public.sale_payments
                    WHERE tenant_id = _tenant_id AND sale_id = v_replacement.id
                      AND method::text <> 'due' AND amount > 0
                    ORDER BY created_at, id LIMIT 1), 'cash')
    INTO v_effective_paid, v_pay_count, v_first_method
    FROM public.sale_payments
   WHERE tenant_id = _tenant_id
     AND sale_id = v_replacement.id
     AND method::text <> 'due'
     AND amount > 0;

  UPDATE public.sales
     SET original_sale_id = _original_sale_id,
         paid = ROUND(COALESCE(v_effective_paid, 0), 2),
         due = GREATEST(total - ROUND(COALESCE(v_effective_paid, 0), 2), 0),
         status = CASE WHEN GREATEST(total - ROUND(COALESCE(v_effective_paid, 0), 2), 0) > 0.001
                       THEN 'partial'::public.sale_status
                       ELSE 'completed'::public.sale_status END,
         payment_method = CASE WHEN v_pay_count > 1 THEN 'split' ELSE COALESCE(v_first_method, 'cash') END
   WHERE tenant_id = _tenant_id
     AND id = v_replacement.id
   RETURNING * INTO v_replacement;

  PERFORM public.post_sale_journal(_tenant_id, v_replacement.id);

  PERFORM public.audit_log_event(
    _tenant_id,
    'pos.invoice_replaced',
    'sales',
    v_replacement.id,
    jsonb_build_object(
      'original_sale_id', v_original.id,
      'original_invoice_no', v_original.invoice_no,
      'original_total', v_original.total,
      'original_paid', v_original.paid,
      'original_due', v_original.due
    ),
    jsonb_build_object(
      'replacement_sale_id', v_replacement.id,
      'replacement_invoice_no', v_replacement.invoice_no,
      'replacement_total', v_replacement.total,
      'replacement_paid', v_replacement.paid,
      'replacement_due', v_replacement.due,
      'stock_validation', 'current stock + original invoice qty'
    )
  );

  RETURN v_replacement;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_sale_invoice(uuid, uuid, uuid, uuid, numeric, text, uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_sale_invoice(uuid, uuid, uuid, uuid, numeric, text, uuid, jsonb, jsonb, uuid) TO authenticated, service_role;