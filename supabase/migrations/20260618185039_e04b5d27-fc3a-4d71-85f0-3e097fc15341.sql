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
AS $function$
DECLARE
  v_original public.sales;
  v_replacement public.sales;
  v_existing_replacement public.sales;
  v_existing_payment_count integer := 0;
  v_existing_paid numeric := 0;
  v_missing_paid numeric := 0;
  v_effective_paid numeric := 0;
  v_first_method text;
  v_pay_count integer := 0;
  v_tenant_allow_override boolean := false;
  v_requested record;
  v_original_qty numeric := 0;
  v_current_stock numeric := 0;
  v_available_stock numeric := 0;
  v_orig_item record;
  v_restore_batch_id uuid;
  v_reg public.cash_registers;
  v_attempt integer := 0;
  v_item jsonb;
  v_product_id uuid;
  v_requested_qty numeric;
  v_need_qty numeric;
  v_unit_price numeric;
  v_line_disc numeric;
  v_line_vat numeric;
  v_allow_override boolean;
  v_override_cost numeric;
  v_override_qty numeric;
  v_has_any_batch boolean;
  v_batch record;
  v_take numeric;
  v_after_qty numeric;
  v_subtotal numeric := 0;
  v_vat_total numeric := 0;
  v_disc_total numeric := 0;
  v_total numeric := 0;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
  END IF;

  IF _client_op_id IS NOT NULL THEN
    SELECT * INTO v_existing_replacement
      FROM public.sales
     WHERE client_op_id = _client_op_id
       AND tenant_id = _tenant_id;
    IF FOUND THEN
      RETURN v_existing_replacement;
    END IF;
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

  IF _register_id IS NOT NULL THEN
    SELECT * INTO v_reg
      FROM public.cash_registers
     WHERE id = _register_id
       AND tenant_id = _tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'register not found' USING ERRCODE = '23503';
    END IF;
    IF v_reg.status <> 'open' THEN
      RAISE EXCEPTION 'register is closed' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Edit-mode validation: available stock = current stock + stock held by the original invoice.
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

    RAISE NOTICE 'POS edit stock validation product %, requested_qty %, available_stock %, current_stock %, original_qty %',
      v_requested.product_id,
      v_requested.requested_qty,
      v_available_stock,
      COALESCE(v_current_stock, 0),
      COALESCE(v_original_qty, 0);

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

  -- Restore the original invoice stock inside this transaction, then consume it for the replacement sale.
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
       AND tenant_id = _tenant_id
     RETURNING qty_on_hand INTO v_after_qty;

    INSERT INTO public.stock_movements(
      tenant_id, product_id, batch_id, movement_type, qty_change,
      qty_after, reference_table, reference_id, reference_no, user_id, notes
    ) VALUES (
      _tenant_id,
      v_orig_item.product_id,
      v_restore_batch_id,
      'adjustment'::public.movement_type,
      v_orig_item.qty,
      v_after_qty,
      'sales',
      _original_sale_id,
      v_original.invoice_no,
      _cashier_id,
      'POS edit stock restore before direct replacement sale'
    );
  END LOOP;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_existing_payment_count, v_existing_paid
    FROM public.sale_payments
   WHERE tenant_id = _tenant_id
     AND sale_id = _original_sale_id
     AND method::text <> 'due'
     AND amount > 0;

  v_missing_paid := GREATEST(COALESCE(v_original.paid, 0) - COALESCE(v_existing_paid, 0), 0);
  v_effective_paid := COALESCE(v_existing_paid, 0) + COALESCE(v_missing_paid, 0);

  SELECT COALESCE(SUM(
           COALESCE((item->>'qty')::numeric, 0) * COALESCE((item->>'unit_price')::numeric, 0)
           - COALESCE((item->>'discount')::numeric, 0)
           + COALESCE((item->>'vat')::numeric, 0)
         ), 0) - COALESCE(_discount, 0)
    INTO v_total
    FROM jsonb_array_elements(_items) AS item;

  v_total := GREATEST(ROUND(v_total, 2), 0);

  IF v_effective_paid > v_total + 0.001 THEN
    RAISE EXCEPTION 'carried payment (%) exceeds replacement total (%)', v_effective_paid, v_total USING ERRCODE = '22023';
  END IF;

  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;
    BEGIN
      INSERT INTO public.sales(
        tenant_id, invoice_no, customer_id, cashier_id,
        subtotal, discount, vat, total, paid, due,
        payment_method, status, notes, client_op_id, original_sale_id
      ) VALUES (
        _tenant_id,
        public.next_invoice_no(_tenant_id),
        _customer_id,
        _cashier_id,
        0,
        COALESCE(_discount, 0),
        0,
        0,
        0,
        0,
        'cash',
        'completed'::public.sale_status,
        _notes,
        _client_op_id,
        _original_sale_id
      ) RETURNING * INTO v_replacement;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE;
      END IF;
    END;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product_id     := (v_item->>'product_id')::uuid;
    v_requested_qty  := (v_item->>'qty')::numeric;
    v_need_qty       := v_requested_qty;
    v_unit_price     := (v_item->>'unit_price')::numeric;
    v_line_disc      := COALESCE((v_item->>'discount')::numeric, 0);
    v_line_vat       := COALESCE((v_item->>'vat')::numeric, 0);
    v_allow_override := COALESCE((v_item->>'allow_stock_override')::boolean, false);

    IF v_need_qty IS NULL OR v_need_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty for product %', v_product_id USING ERRCODE = '22023';
    END IF;

    RAISE NOTICE 'POS edit direct allocation product %, requested_qty %, remaining_before_allocation %',
      v_product_id,
      v_requested_qty,
      v_need_qty;

    FOR v_batch IN
      SELECT id, expiry_date, qty_on_hand, purchase_price
        FROM public.batches
       WHERE tenant_id = _tenant_id
         AND product_id = v_product_id
         AND qty_on_hand > 0
       ORDER BY expiry_date ASC, created_at ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_need_qty <= 0;
      v_take := LEAST(v_need_qty, v_batch.qty_on_hand);

      UPDATE public.batches
         SET qty_on_hand = qty_on_hand - v_take,
             updated_at = now(),
             updated_by = _cashier_id
       WHERE id = v_batch.id
       RETURNING qty_on_hand INTO v_after_qty;

      INSERT INTO public.sale_items(
        tenant_id, sale_id, product_id, batch_id,
        qty, unit_price, unit_cost, discount, vat, line_total
      ) VALUES (
        _tenant_id, v_replacement.id, v_product_id, v_batch.id,
        v_take, v_unit_price, v_batch.purchase_price,
        ROUND(v_line_disc * v_take / v_requested_qty, 2),
        ROUND(v_line_vat  * v_take / v_requested_qty, 2),
        ROUND(v_take * v_unit_price
              - v_line_disc * v_take / v_requested_qty
              + v_line_vat  * v_take / v_requested_qty, 2)
      );

      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id
      ) VALUES (
        _tenant_id, v_product_id, v_batch.id, 'sale'::public.movement_type, -v_take,
        v_after_qty, 'sales', v_replacement.id, v_replacement.invoice_no, _cashier_id
      );

      v_need_qty := v_need_qty - v_take;
    END LOOP;

    IF v_need_qty > 0 THEN
      IF NOT (v_tenant_allow_override AND v_allow_override) THEN
        SELECT EXISTS(
          SELECT 1 FROM public.batches
           WHERE tenant_id = _tenant_id
             AND product_id = v_product_id
        ) INTO v_has_any_batch;

        IF NOT v_has_any_batch THEN
          RAISE EXCEPTION 'Opening stock not initialized for product %. Please initialize via Opening Stock Wizard.',
            v_product_id USING ERRCODE = '23514';
        ELSE
          RAISE EXCEPTION 'insufficient stock for product % after POS edit restore: short by %',
            v_product_id, v_need_qty USING ERRCODE = '23514';
        END IF;
      END IF;

      v_override_qty := v_need_qty;
      SELECT COALESCE(p.purchase_price, 0)
        INTO v_override_cost
        FROM public.products p
       WHERE p.id = v_product_id
         AND p.tenant_id = _tenant_id;

      INSERT INTO public.sale_items(
        tenant_id, sale_id, product_id, batch_id,
        qty, unit_price, unit_cost, discount, vat, line_total
      ) VALUES (
        _tenant_id, v_replacement.id, v_product_id, NULL,
        v_need_qty, v_unit_price, COALESCE(v_override_cost, 0),
        ROUND(v_line_disc * v_need_qty / v_requested_qty, 2),
        ROUND(v_line_vat  * v_need_qty / v_requested_qty, 2),
        ROUND(v_need_qty * v_unit_price
              - v_line_disc * v_need_qty / v_requested_qty
              + v_line_vat  * v_need_qty / v_requested_qty, 2)
      );

      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id, notes
      ) VALUES (
        _tenant_id, v_product_id, NULL, 'sale'::public.movement_type, -v_need_qty,
        NULL, 'sales', v_replacement.id, v_replacement.invoice_no, _cashier_id,
        'Stock override: sold without available batch stock during POS edit replacement'
      );

      PERFORM public.audit_log_event(
        _tenant_id,
        'stock_override_used',
        'sales',
        v_replacement.id,
        NULL,
        jsonb_build_object(
          'user_id', _cashier_id,
          'product_id', v_product_id,
          'qty', v_override_qty,
          'invoice_no', v_replacement.invoice_no,
          'source', 'pos_edit_replacement',
          'timestamp', now()
        )
      );

      v_need_qty := 0;
    END IF;

    v_subtotal   := v_subtotal   + (v_requested_qty * v_unit_price);
    v_disc_total := v_disc_total + v_line_disc;
    v_vat_total  := v_vat_total  + v_line_vat;
  END LOOP;

  v_total := v_subtotal - v_disc_total - COALESCE(_discount, 0) + v_vat_total;
  v_total := GREATEST(ROUND(v_total, 2), 0);

  IF v_effective_paid > v_total + 0.001 THEN
    RAISE EXCEPTION 'carried payment (%) exceeds replacement total (%)', v_effective_paid, v_total USING ERRCODE = '22023';
  END IF;

  IF v_existing_payment_count > 0 THEN
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
  END IF;

  IF v_missing_paid > 0.009 THEN
    INSERT INTO public.sale_payments(
      tenant_id, sale_id, method, amount, reference, created_by
    ) VALUES (
      _tenant_id,
      v_replacement.id,
      'cash'::public.payment_method,
      ROUND(v_missing_paid, 2),
      'legacy-paid-carry-forward',
      _cashier_id
    );

    IF v_existing_payment_count = 0 AND _register_id IS NOT NULL THEN
      INSERT INTO public.cash_register_transactions(
        tenant_id, register_id, transaction_type, amount,
        payment_method, notes, reference_table, reference_id, reference_no, created_by
      ) VALUES (
        _tenant_id,
        _register_id,
        'sale'::public.cash_txn_type,
        ROUND(v_missing_paid, 2),
        'cash',
        'Sale ' || v_replacement.invoice_no || ' (legacy payment carried from ' || v_original.invoice_no || ')',
        'sales',
        v_replacement.id,
        v_replacement.invoice_no,
        _cashier_id
      );
    END IF;
  END IF;

  SELECT COALESCE(SUM(amount), 0), COUNT(*),
         COALESCE((SELECT method::text
                     FROM public.sale_payments
                    WHERE tenant_id = _tenant_id
                      AND sale_id = v_replacement.id
                      AND method::text <> 'due'
                      AND amount > 0
                    ORDER BY created_at, id
                    LIMIT 1), 'cash')
    INTO v_effective_paid, v_pay_count, v_first_method
    FROM public.sale_payments
   WHERE tenant_id = _tenant_id
     AND sale_id = v_replacement.id
     AND method::text <> 'due'
     AND amount > 0;

  UPDATE public.sales
     SET subtotal = ROUND(v_subtotal, 2),
         discount = ROUND(v_disc_total + COALESCE(_discount, 0), 2),
         vat = ROUND(v_vat_total, 2),
         total = v_total,
         paid = ROUND(COALESCE(v_effective_paid, 0), 2),
         due = GREATEST(v_total - ROUND(COALESCE(v_effective_paid, 0), 2), 0),
         status = CASE WHEN GREATEST(v_total - ROUND(COALESCE(v_effective_paid, 0), 2), 0) > 0.001
                       THEN 'partial'::public.sale_status
                       ELSE 'completed'::public.sale_status END,
         payment_method = CASE WHEN v_pay_count > 1 THEN 'split' ELSE COALESCE(v_first_method, 'cash') END,
         original_sale_id = _original_sale_id
   WHERE tenant_id = _tenant_id
     AND id = v_replacement.id
   RETURNING * INTO v_replacement;

  PERFORM public.post_sale_journal(_tenant_id, v_replacement.id);

  PERFORM public.cancel_sale_invoice(
    _tenant_id,
    _original_sale_id,
    'Replaced via POS edit',
    false
  );

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
      'implementation', 'direct_replacement_without_pos_checkout',
      'stock_validation', 'current stock + original invoice qty'
    )
  );

  RETURN v_replacement;
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_sale_invoice(uuid, uuid, uuid, uuid, numeric, text, uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_sale_invoice(uuid, uuid, uuid, uuid, numeric, text, uuid, jsonb, jsonb, uuid) TO authenticated, service_role;