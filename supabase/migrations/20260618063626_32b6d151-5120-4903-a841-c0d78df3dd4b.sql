CREATE OR REPLACE FUNCTION public.pos_checkout(_tenant_id uuid, _customer_id uuid, _cashier_id uuid, _invoice_no text, _discount numeric DEFAULT 0, _notes text DEFAULT NULL::text, _client_op_id uuid DEFAULT NULL::uuid, _items jsonb DEFAULT '[]'::jsonb, _payments jsonb DEFAULT '[]'::jsonb)
 RETURNS sales
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale          public.sales;
  v_existing      public.sales;
  v_item          jsonb;
  v_pay           jsonb;
  v_product_id    uuid;
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
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
  END IF;

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
    v_allow_override := COALESCE((v_item->>'allow_stock_override')::boolean, false);

    IF v_need_qty IS NULL OR v_need_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty for product %', v_product_id USING ERRCODE = '22023';
    END IF;

    FOR v_batch IN
      SELECT id, expiry_date, qty_on_hand, purchase_price
        FROM public.batches
       WHERE tenant_id = _tenant_id AND product_id = v_product_id AND qty_on_hand > 0
       ORDER BY expiry_date ASC, created_at ASC
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
          _tenant_id, v_product_id, NULL, 'sale', -v_need_qty,
          NULL, 'sales', v_sale.id, _invoice_no, _cashier_id,
          'Stock override: sold without available batch stock'
        );

        -- Audit log for the override
        PERFORM public.audit_log_event(
          _tenant_id, 'stock_override_used', 'sales', v_sale.id, NULL,
          jsonb_build_object(
            'user_id',    _cashier_id,
            'product_id', v_product_id,
            'qty',        v_override_qty,
            'invoice_no', _invoice_no,
            'timestamp',  now()
          )
        );

        v_need_qty := 0;
      ELSE
        RAISE EXCEPTION 'insufficient stock for product %: short by %', v_product_id, v_need_qty
          USING ERRCODE = '23514';
      END IF;
    END IF;

    v_subtotal   := v_subtotal   + (v_requested_qty * v_unit_price);
    v_disc_total := v_disc_total + v_line_disc;
    v_vat_total  := v_vat_total  + v_line_vat;
  END LOOP;

  v_total := v_subtotal - v_disc_total - COALESCE(_discount,0) + v_vat_total;
  IF v_total < 0 THEN
    RAISE EXCEPTION 'invoice total cannot be negative' USING ERRCODE = '22023';
  END IF;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    v_method := v_pay->>'method';
    IF v_pay_count = 0 THEN v_first_method := v_method; END IF;
    v_pay_count := v_pay_count + 1;
    IF v_method = 'due' OR (v_pay->>'amount')::numeric = 0 THEN CONTINUE; END IF;

    INSERT INTO public.sale_payments(
      tenant_id, sale_id, method, amount, reference, mobile_no, created_by
    ) VALUES (
      _tenant_id, v_sale.id, v_method::payment_method,
      (v_pay->>'amount')::numeric,
      v_pay->>'reference', v_pay->>'mobile_no', _cashier_id
    );
    v_paid := v_paid + (v_pay->>'amount')::numeric;
  END LOOP;

  IF v_paid > v_total + 0.001 THEN
    RAISE EXCEPTION 'payments (%) exceed invoice total (%)', v_paid, v_total USING ERRCODE = '22023';
  END IF;

  IF v_total - v_paid > 0.001 THEN
    IF _customer_id IS NULL THEN
      RAISE EXCEPTION 'walk-in sale cannot leave a due balance' USING ERRCODE = '22023';
    END IF;
    v_status := 'partial';
  ELSE
    v_status := 'completed';
  END IF;

  UPDATE public.sales
     SET subtotal       = v_subtotal,
         discount       = v_disc_total + COALESCE(_discount,0),
         vat            = v_vat_total,
         total          = v_total,
         paid           = v_paid,
         due            = GREATEST(v_total - v_paid, 0),
         payment_method = CASE WHEN v_pay_count > 1 THEN 'split' ELSE COALESCE(v_first_method,'cash') END,
         status         = v_status
   WHERE id = v_sale.id
   RETURNING * INTO v_sale;

  RETURN v_sale;
END;
$function$;