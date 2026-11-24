
-- 1. pos_checkout: respect inventory settings
CREATE OR REPLACE FUNCTION public.pos_checkout(
  _tenant_id uuid, _customer_id uuid, _cashier_id uuid, _invoice_no text,
  _discount numeric DEFAULT 0, _notes text DEFAULT NULL::text,
  _client_op_id uuid DEFAULT NULL::uuid,
  _items jsonb DEFAULT '[]'::jsonb, _payments jsonb DEFAULT '[]'::jsonb
)
RETURNS sales
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_sale          public.sales;
  v_existing      public.sales;
  v_item          jsonb;
  v_pay           jsonb;
  v_product_id    uuid;
  v_product_name  text;
  v_requested_qty numeric;
  v_need_qty      numeric;
  v_unit_price    numeric;
  v_line_disc     numeric;
  v_line_vat      numeric;
  v_allow_override boolean;
  v_override_cost numeric;
  v_override_qty  numeric;
  v_batch         record;
  v_take          numeric;
  v_subtotal      numeric := 0;
  v_vat_total     numeric := 0;
  v_disc_total    numeric := 0;
  v_total         numeric := 0;
  v_paid          numeric := 0;
  v_method        text;
  v_pay_count     int := 0;
  v_first_method  text;
  v_status        sale_status;
  v_expired       record;
  v_inv           jsonb;
  v_enable_fefo   boolean;
  v_enable_expiry boolean;
  v_enable_neg    boolean;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
  END IF;

  SELECT inventory INTO v_inv FROM public.tenant_settings WHERE tenant_id = _tenant_id;
  v_enable_fefo   := COALESCE((v_inv->>'enable_fefo')::boolean, true);
  v_enable_expiry := COALESCE((v_inv->>'enable_expiry_tracking')::boolean, true);
  v_enable_neg    := COALESCE((v_inv->>'enable_negative_stock')::boolean, false);

  IF _client_op_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.sales
     WHERE client_op_id = _client_op_id AND tenant_id = _tenant_id;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'cart is empty' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.sales(
    tenant_id, invoice_no, customer_id, cashier_id,
    subtotal, discount, vat, total, paid, due,
    payment_method, status, notes, client_op_id
  ) VALUES (
    _tenant_id, _invoice_no, _customer_id, _cashier_id,
    0, COALESCE(_discount,0), 0, 0, 0, 0,
    'cash', 'completed', _notes, _client_op_id
  ) RETURNING * INTO v_sale;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product_id     := (v_item->>'product_id')::uuid;
    v_requested_qty  := (v_item->>'qty')::numeric;
    v_need_qty       := v_requested_qty;
    v_unit_price     := (v_item->>'unit_price')::numeric;
    v_line_disc      := COALESCE((v_item->>'discount')::numeric, 0);
    v_line_vat       := COALESCE((v_item->>'vat')::numeric, 0);
    -- Allow per-line override OR tenant-wide enable_negative_stock
    v_allow_override := COALESCE((v_item->>'allow_stock_override')::boolean, false) OR v_enable_neg;

    IF v_need_qty IS NULL OR v_need_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty for product %', v_product_id USING ERRCODE = '22023';
    END IF;

    SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id AND tenant_id = _tenant_id;

    -- Batch picking: FEFO by default, oldest-first when disabled.
    -- Expiry filter only applies when enable_expiry_tracking=true.
    FOR v_batch IN
      SELECT id, batch_no, expiry_date, qty_on_hand, purchase_price
        FROM public.batches
       WHERE tenant_id = _tenant_id AND product_id = v_product_id
         AND qty_on_hand > 0
         AND (NOT v_enable_expiry OR expiry_date >= CURRENT_DATE)
       ORDER BY
         CASE WHEN v_enable_fefo THEN expiry_date END ASC NULLS LAST,
         created_at ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_need_qty <= 0;
      v_take := LEAST(v_need_qty, v_batch.qty_on_hand);

      UPDATE public.batches SET qty_on_hand = qty_on_hand - v_take WHERE id = v_batch.id;

      INSERT INTO public.sale_items(
        tenant_id, sale_id, product_id, batch_id,
        qty, unit_price, unit_cost, discount, vat, line_total
      ) VALUES (
        _tenant_id, v_sale.id, v_product_id, v_batch.id,
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
        _tenant_id, v_product_id, v_batch.id, 'sale', -v_take,
        v_batch.qty_on_hand - v_take, 'sales', v_sale.id, _invoice_no, _cashier_id
      );

      v_need_qty := v_need_qty - v_take;
    END LOOP;

    IF v_need_qty > 0 THEN
      IF v_enable_expiry THEN
        SELECT batch_no, expiry_date INTO v_expired
          FROM public.batches
         WHERE tenant_id = _tenant_id AND product_id = v_product_id
           AND qty_on_hand > 0 AND expiry_date < CURRENT_DATE
         ORDER BY expiry_date DESC LIMIT 1;
        IF FOUND AND NOT v_allow_override THEN
          RAISE EXCEPTION 'Cannot sell expired medicine. Product: %, Batch: %, Expiry: %',
            COALESCE(v_product_name,'?'), v_expired.batch_no, v_expired.expiry_date
            USING ERRCODE = '22023';
        END IF;
      END IF;

      IF v_allow_override THEN
        v_override_qty := v_need_qty;
        SELECT COALESCE(p.purchase_price, 0) INTO v_override_cost
          FROM public.products p
         WHERE p.id = v_product_id AND p.tenant_id = _tenant_id;

        INSERT INTO public.sale_items(
          tenant_id, sale_id, product_id, batch_id,
          qty, unit_price, unit_cost, discount, vat, line_total
        ) VALUES (
          _tenant_id, v_sale.id, v_product_id, NULL,
          v_override_qty, v_unit_price, v_override_cost,
          ROUND(v_line_disc * v_override_qty / v_requested_qty, 2),
          ROUND(v_line_vat  * v_override_qty / v_requested_qty, 2),
          ROUND(v_override_qty * v_unit_price
                - v_line_disc * v_override_qty / v_requested_qty
                + v_line_vat  * v_override_qty / v_requested_qty, 2)
        );
        v_need_qty := 0;
      ELSE
        RAISE EXCEPTION 'insufficient stock for product %', COALESCE(v_product_name, v_product_id::text)
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  SELECT
    COALESCE(SUM(qty * unit_price), 0),
    COALESCE(SUM(discount), 0),
    COALESCE(SUM(vat), 0)
  INTO v_subtotal, v_disc_total, v_vat_total
  FROM public.sale_items WHERE sale_id = v_sale.id;

  v_disc_total := v_disc_total + COALESCE(_discount, 0);
  v_total := GREATEST(0, v_subtotal - v_disc_total + v_vat_total);

  FOR v_pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    v_method := v_pay->>'method';
    IF v_first_method IS NULL THEN v_first_method := v_method; END IF;
    v_pay_count := v_pay_count + 1;
    IF v_method <> 'due' THEN
      v_paid := v_paid + COALESCE((v_pay->>'amount')::numeric, 0);
      INSERT INTO public.sale_payments(tenant_id, sale_id, method, amount, reference)
      VALUES (_tenant_id, v_sale.id, v_method::payment_method,
              COALESCE((v_pay->>'amount')::numeric, 0), v_pay->>'reference');
    END IF;
  END LOOP;

  v_status := CASE
    WHEN v_paid >= v_total THEN 'completed'::sale_status
    WHEN v_paid > 0 THEN 'partial'::sale_status
    ELSE 'completed'::sale_status
  END;

  UPDATE public.sales SET
    subtotal = v_subtotal,
    discount = v_disc_total,
    vat = v_vat_total,
    total = v_total,
    paid = v_paid,
    due = GREATEST(0, v_total - v_paid),
    payment_method = COALESCE(
      CASE WHEN v_pay_count > 1 THEN 'split' ELSE v_first_method END,
      'cash')::payment_method,
    status = v_status
  WHERE id = v_sale.id
  RETURNING * INTO v_sale;

  RETURN v_sale;
END $function$;

-- 2. tg_block_expired_batch_sale: defer to tenant inventory setting
CREATE OR REPLACE FUNCTION public.tg_block_expired_batch_sale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_expiry        date;
  v_batchno       text;
  v_pname         text;
  v_enable_expiry boolean;
BEGIN
  IF NEW.batch_id IS NULL OR NEW.qty IS NULL OR NEW.qty <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((inventory->>'enable_expiry_tracking')::boolean, true)
    INTO v_enable_expiry
    FROM public.tenant_settings WHERE tenant_id = NEW.tenant_id;
  IF NOT COALESCE(v_enable_expiry, true) THEN
    RETURN NEW;
  END IF;

  SELECT b.expiry_date, b.batch_no, p.name
    INTO v_expiry, v_batchno, v_pname
    FROM public.batches b
    LEFT JOIN public.products p ON p.id = b.product_id
   WHERE b.id = NEW.batch_id;

  IF v_expiry IS NOT NULL AND v_expiry < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot sell expired medicine. Product: %, Batch: %, Expiry: %',
      COALESCE(v_pname,'?'), COALESCE(v_batchno,'?'), v_expiry
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;

-- 3. stock_transfer_request: enforce allow_expired_transfer / allow_recalled_transfer
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
  v_inv jsonb;
  v_allow_expired  boolean;
  v_allow_recalled boolean;
  v_batch record;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _from_warehouse_id = _to_warehouse_id THEN
    RAISE EXCEPTION 'same_warehouse' USING ERRCODE='22023';
  END IF;

  SELECT inventory INTO v_inv FROM public.tenant_settings WHERE tenant_id = _tenant_id;
  v_allow_expired  := COALESCE((v_inv->>'allow_expired_transfer')::boolean, false);
  v_allow_recalled := COALESCE((v_inv->>'allow_recalled_transfer')::boolean, false);

  -- Pre-flight: validate every line's batch (when batch_id supplied) against the rules
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF NULLIF(v_item->>'batch_id','') IS NOT NULL THEN
      SELECT id, batch_no, expiry_date, status
        INTO v_batch
        FROM public.batches
       WHERE id = (v_item->>'batch_id')::uuid AND tenant_id = _tenant_id;
      IF FOUND THEN
        IF NOT v_allow_expired
           AND v_batch.expiry_date IS NOT NULL
           AND v_batch.expiry_date < CURRENT_DATE THEN
          RAISE EXCEPTION 'Cannot transfer expired batch % (expiry %)',
            v_batch.batch_no, v_batch.expiry_date USING ERRCODE='22023';
        END IF;
        IF NOT v_allow_recalled
           AND v_batch.status IN ('recalled','locked') THEN
          RAISE EXCEPTION 'Cannot transfer % batch %', v_batch.status, v_batch.batch_no
            USING ERRCODE='22023';
        END IF;
      END IF;
    END IF;
  END LOOP;

  SELECT branch_id INTO v_from_branch FROM public.warehouses WHERE id=_from_warehouse_id AND tenant_id=_tenant_id;
  SELECT branch_id INTO v_to_branch   FROM public.warehouses WHERE id=_to_warehouse_id   AND tenant_id=_tenant_id;

  v_no := public.generate_next_number(_tenant_id, 'transfer');

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
