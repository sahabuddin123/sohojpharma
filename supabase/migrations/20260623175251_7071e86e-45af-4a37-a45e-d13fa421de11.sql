
-- =========================================================================
-- E1. DROP DEPRECATED POS_CHECKOUT / POS_RETURN OVERLOADS
-- =========================================================================
DROP FUNCTION IF EXISTS public.pos_checkout(uuid, uuid, uuid, text, numeric, text, uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.pos_return(uuid, uuid, text, text, public.payment_method, jsonb);
DROP FUNCTION IF EXISTS public.pos_return(uuid, uuid, jsonb, text, text, numeric, text);

-- =========================================================================
-- E3. BATCH UNIQUENESS: (tenant, product, batch_no) -> (..., expiry_date)
-- =========================================================================
ALTER TABLE public.batches
  DROP CONSTRAINT IF EXISTS batches_tenant_id_product_id_batch_no_key;
DROP INDEX IF EXISTS public.batches_tenant_id_product_id_batch_no_key;

ALTER TABLE public.batches
  ADD CONSTRAINT batches_tenant_product_batch_expiry_key
  UNIQUE (tenant_id, product_id, batch_no, expiry_date);

-- =========================================================================
-- E7. CANONICAL STOCK MUTATION HELPER + NEGATIVE-STOCK TRIGGER
-- =========================================================================
CREATE OR REPLACE FUNCTION public.update_batch_stock(_batch_id uuid, _delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_qty    numeric;
  v_new    numeric;
BEGIN
  SELECT tenant_id, qty_on_hand INTO v_tenant, v_qty
    FROM public.batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch % not found', _batch_id USING ERRCODE = '23503';
  END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_tenant) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_new := v_qty + _delta;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'insufficient stock on batch % (have %, delta %)', _batch_id, v_qty, _delta
      USING ERRCODE = '23514';
  END IF;
  UPDATE public.batches SET qty_on_hand = v_new WHERE id = _batch_id;
  RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public.tg_batch_no_negative_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.qty_on_hand < 0 THEN
    RAISE EXCEPTION 'batch % qty_on_hand cannot go negative (attempted %)',
      NEW.id, NEW.qty_on_hand USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_batch_no_negative ON public.batches;
CREATE TRIGGER trg_batch_no_negative
BEFORE INSERT OR UPDATE OF qty_on_hand ON public.batches
FOR EACH ROW EXECUTE FUNCTION public.tg_batch_no_negative_stock();

-- =========================================================================
-- E6. OVER-RETURN PROTECTION ON sale_return_items
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_sale_return_no_overreturn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_sold     numeric;
  v_other    numeric;
BEGIN
  SELECT qty INTO v_sold
    FROM public.sale_items WHERE id = NEW.sale_item_id;
  IF v_sold IS NULL THEN
    RAISE EXCEPTION 'sale_item % not found', NEW.sale_item_id USING ERRCODE = '23503';
  END IF;
  SELECT COALESCE(SUM(qty), 0) INTO v_other
    FROM public.sale_return_items
   WHERE sale_item_id = NEW.sale_item_id
     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF v_other + NEW.qty > v_sold + 0.0001 THEN
    RAISE EXCEPTION 'over-return blocked: sold=% already_returned=% attempting=%',
      v_sold, v_other, NEW.qty USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sale_return_no_overreturn ON public.sale_return_items;
CREATE TRIGGER trg_sale_return_no_overreturn
BEFORE INSERT OR UPDATE OF qty, sale_item_id ON public.sale_return_items
FOR EACH ROW EXECUTE FUNCTION public.tg_sale_return_no_overreturn();

-- =========================================================================
-- E3. PATCH grn_receive: include expiry_date in find-or-create batch match
-- =========================================================================
CREATE OR REPLACE FUNCTION public.grn_receive(
  _tenant_id uuid, _po_id uuid, _grn_no text,
  _notes text DEFAULT NULL::text,
  _allow_over boolean DEFAULT false,
  _lines jsonb DEFAULT '[]'::jsonb
)
RETURNS public.goods_receipts
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_grn         public.goods_receipts;
  v_po          public.purchase_orders;
  v_line        jsonb;
  v_po_item     public.purchase_order_items;
  v_batch_id    uuid;
  v_qty         numeric;
  v_cost        numeric;
  v_line_total  numeric;
  v_total_value numeric := 0;
  v_remaining   numeric;
  v_supplier    uuid;
  v_new_status  po_status;
  v_expiry      date;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders
   WHERE id = _po_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO not found' USING ERRCODE='23503'; END IF;
  IF v_po.status IN ('cancelled','received') THEN
    RAISE EXCEPTION 'PO is % and cannot receive', v_po.status USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'no lines to receive' USING ERRCODE='22023';
  END IF;

  v_supplier := v_po.supplier_id;

  INSERT INTO public.goods_receipts(
    tenant_id, grn_no, po_id, supplier_id, received_by, notes
  ) VALUES (
    _tenant_id, _grn_no, _po_id, v_supplier, auth.uid(), _notes
  ) RETURNING * INTO v_grn;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    SELECT * INTO v_po_item FROM public.purchase_order_items
     WHERE id = (v_line->>'po_item_id')::uuid
       AND purchase_order_id = _po_id
       AND tenant_id = _tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PO line % not found', v_line->>'po_item_id' USING ERRCODE='23503';
    END IF;

    v_qty    := (v_line->>'qty_received')::numeric;
    v_cost   := COALESCE((v_line->>'unit_cost')::numeric, v_po_item.unit_cost);
    v_expiry := (v_line->>'expiry_date')::date;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'qty_received must be > 0' USING ERRCODE='22023';
    END IF;
    IF v_expiry IS NULL THEN
      RAISE EXCEPTION 'expiry_date required for batch %', v_line->>'batch_no' USING ERRCODE='22023';
    END IF;

    v_remaining := v_po_item.qty_ordered - v_po_item.qty_received;
    IF v_qty > v_remaining AND NOT _allow_over THEN
      RAISE EXCEPTION 'over-receipt blocked: ordered %, already received %, attempting %',
        v_po_item.qty_ordered, v_po_item.qty_received, v_qty USING ERRCODE='23514';
    END IF;

    -- Find-or-create batch by (tenant, product, batch_no, expiry_date)
    SELECT id INTO v_batch_id FROM public.batches
     WHERE tenant_id = _tenant_id
       AND product_id = v_po_item.product_id
       AND batch_no = v_line->>'batch_no'
       AND expiry_date = v_expiry
     FOR UPDATE;
    IF v_batch_id IS NULL THEN
      INSERT INTO public.batches(
        tenant_id, product_id, batch_no, mfg_date, expiry_date,
        purchase_price, qty_on_hand
      ) VALUES (
        _tenant_id, v_po_item.product_id, v_line->>'batch_no',
        NULLIF(v_line->>'mfg_date','')::date,
        v_expiry,
        v_cost, v_qty
      ) RETURNING id INTO v_batch_id;
    ELSE
      UPDATE public.batches
         SET qty_on_hand = qty_on_hand + v_qty,
             purchase_price = v_cost
       WHERE id = v_batch_id;
    END IF;

    v_line_total := ROUND(v_qty * v_cost, 2);
    v_total_value := v_total_value + v_line_total;

    INSERT INTO public.goods_receipt_items(
      tenant_id, grn_id, po_item_id, product_id, batch_id,
      batch_no, mfg_date, expiry_date, qty_received, unit_cost, line_total
    ) VALUES (
      _tenant_id, v_grn.id, v_po_item.id, v_po_item.product_id, v_batch_id,
      v_line->>'batch_no',
      NULLIF(v_line->>'mfg_date','')::date,
      v_expiry,
      v_qty, v_cost, v_line_total
    );

    INSERT INTO public.stock_movements(
      tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
      reference_table, reference_id, reference_no, user_id
    ) SELECT
      _tenant_id, v_po_item.product_id, v_batch_id, 'purchase', v_qty,
      qty_on_hand, 'goods_receipts', v_grn.id, _grn_no, auth.uid()
    FROM public.batches WHERE id = v_batch_id;

    UPDATE public.purchase_order_items
       SET qty_received = qty_received + v_qty
     WHERE id = v_po_item.id;
  END LOOP;

  UPDATE public.goods_receipts SET total_value = v_total_value
   WHERE id = v_grn.id RETURNING * INTO v_grn;

  IF EXISTS (
    SELECT 1 FROM public.purchase_order_items
     WHERE purchase_order_id = _po_id AND qty_received < qty_ordered
  ) THEN
    v_new_status := 'partially_received';
  ELSE
    v_new_status := 'received';
  END IF;
  UPDATE public.purchase_orders
     SET status = v_new_status,
         received_at = CASE WHEN v_new_status='received' THEN now() ELSE received_at END
   WHERE id = _po_id;

  IF v_supplier IS NOT NULL AND v_total_value > 0 THEN
    PERFORM public.post_ledger_entry(
      _tenant_id, 'supplier'::party_type, v_supplier, 'purchase'::ledger_entry_type,
      0, v_total_value, 'goods_receipts', v_grn.id, _grn_no,
      'GRN against PO ' || v_po.po_number
    );
  END IF;

  RETURN v_grn;
END $function$;

-- =========================================================================
-- E2. PATCH surviving pos_checkout: add expired-batch filter to FEFO loop
-- =========================================================================
CREATE OR REPLACE FUNCTION public.pos_checkout(
  _tenant_id uuid, _customer_id uuid, _cashier_id uuid, _invoice_no text,
  _discount numeric DEFAULT 0,
  _notes text DEFAULT NULL::text,
  _client_op_id uuid DEFAULT NULL::uuid,
  _items jsonb DEFAULT '[]'::jsonb,
  _payments jsonb DEFAULT '[]'::jsonb,
  _register_id uuid DEFAULT NULL::uuid,
  _warehouse_id uuid DEFAULT NULL::uuid
)
RETURNS public.sales
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
  v_reg           public.cash_registers;
  v_attempt       int;
  v_tenant_allow_override boolean;
  v_has_any_batch boolean;
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

  SELECT COALESCE(allow_stock_override, false) INTO v_tenant_allow_override
    FROM public.tenants WHERE id = _tenant_id;

  IF _register_id IS NOT NULL THEN
    SELECT * INTO v_reg FROM public.cash_registers
      WHERE id = _register_id AND tenant_id = _tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'register not found' USING ERRCODE='23503'; END IF;
    IF v_reg.status <> 'open' THEN RAISE EXCEPTION 'register is closed' USING ERRCODE='22023'; END IF;
  END IF;

  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;
    BEGIN
      INSERT INTO public.sales(
        tenant_id, invoice_no, customer_id, cashier_id, warehouse_id,
        subtotal, discount, vat, total, paid, due,
        payment_method, status, notes, client_op_id
      ) VALUES (
        _tenant_id,
        COALESCE(NULLIF(_invoice_no,''), public.next_invoice_no(_tenant_id)),
        _customer_id, _cashier_id, _warehouse_id,
        0, COALESCE(_discount,0), 0, 0, 0, 0,
        'cash', 'completed', _notes, _client_op_id
      ) RETURNING * INTO v_sale;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN RAISE; END IF;
      _invoice_no := NULL;
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

    -- FEFO with expired-batch exclusion (E2 fix)
    FOR v_batch IN
      SELECT id, expiry_date, qty_on_hand, purchase_price
        FROM public.batches
       WHERE tenant_id = _tenant_id
         AND product_id = v_product_id
         AND qty_on_hand > 0
         AND expiry_date >= CURRENT_DATE
         AND (_warehouse_id IS NULL OR warehouse_id = _warehouse_id)
       ORDER BY expiry_date ASC, created_at ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_need_qty <= 0;
      v_take := LEAST(v_need_qty, v_batch.qty_on_hand);

      UPDATE public.batches SET qty_on_hand = qty_on_hand - v_take WHERE id = v_batch.id;

      INSERT INTO public.sale_items(
        tenant_id, sale_id, product_id, batch_id, warehouse_id,
        qty, unit_price, unit_cost, discount, vat, line_total
      ) VALUES (
        _tenant_id, v_sale.id, v_product_id, v_batch.id, _warehouse_id,
        v_take, v_unit_price, v_batch.purchase_price,
        ROUND(v_line_disc * v_take / v_requested_qty, 2),
        ROUND(v_line_vat  * v_take / v_requested_qty, 2),
        ROUND(v_take * v_unit_price
              - v_line_disc * v_take / v_requested_qty
              + v_line_vat  * v_take / v_requested_qty, 2)
      );

      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, warehouse_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id
      ) VALUES (
        _tenant_id, v_product_id, v_batch.id, _warehouse_id, 'sale', -v_take,
        v_batch.qty_on_hand - v_take, 'sales', v_sale.id, v_sale.invoice_no, _cashier_id
      );

      v_need_qty := v_need_qty - v_take;
    END LOOP;

    IF v_need_qty > 0 THEN
      IF NOT (v_tenant_allow_override AND v_allow_override) THEN
        SELECT EXISTS(SELECT 1 FROM public.batches
                       WHERE tenant_id = _tenant_id AND product_id = v_product_id
                         AND (_warehouse_id IS NULL OR warehouse_id = _warehouse_id))
          INTO v_has_any_batch;
        IF NOT v_has_any_batch THEN
          IF _warehouse_id IS NOT NULL THEN
            RAISE EXCEPTION 'insufficient stock in selected warehouse for product %: short by %',
              v_product_id, v_need_qty USING ERRCODE = '23514';
          ELSE
            RAISE EXCEPTION 'Opening stock not initialized for product %. Please initialize via Opening Stock Wizard.',
              v_product_id USING ERRCODE = '23514';
          END IF;
        ELSE
          RAISE EXCEPTION 'insufficient stock for product %: short by %',
            v_product_id, v_need_qty USING ERRCODE = '23514';
        END IF;
      END IF;

      v_override_qty := v_need_qty;
      SELECT COALESCE(p.purchase_price, 0) INTO v_override_cost
        FROM public.products p
       WHERE p.id = v_product_id AND p.tenant_id = _tenant_id;

      INSERT INTO public.sale_items(
        tenant_id, sale_id, product_id, batch_id, warehouse_id,
        qty, unit_price, unit_cost, discount, vat, line_total
      ) VALUES (
        _tenant_id, v_sale.id, v_product_id, NULL, _warehouse_id,
        v_need_qty, v_unit_price, COALESCE(v_override_cost, 0),
        ROUND(v_line_disc * v_need_qty / v_requested_qty, 2),
        ROUND(v_line_vat  * v_need_qty / v_requested_qty, 2),
        ROUND(v_need_qty * v_unit_price
              - v_line_disc * v_need_qty / v_requested_qty
              + v_line_vat  * v_need_qty / v_requested_qty, 2)
      );

      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, warehouse_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id, notes
      ) VALUES (
        _tenant_id, v_product_id, NULL, _warehouse_id, 'sale', -v_need_qty,
        NULL, 'sales', v_sale.id, v_sale.invoice_no, _cashier_id,
        'Stock override: sold without available batch stock'
      );

      PERFORM public.audit_log_event(
        _tenant_id, 'stock_override_used', 'sales', v_sale.id, NULL,
        jsonb_build_object(
          'user_id', _cashier_id, 'product_id', v_product_id,
          'qty', v_override_qty, 'invoice_no', v_sale.invoice_no,
          'warehouse_id', _warehouse_id,
          'timestamp', now()));
      v_need_qty := 0;
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

    IF _register_id IS NOT NULL AND v_method <> 'due' THEN
      INSERT INTO public.cash_register_transactions(
        tenant_id, register_id, transaction_type, amount,
        payment_method, notes, reference_table, reference_id, reference_no, created_by
      ) VALUES (
        _tenant_id, _register_id, 'sale', (v_pay->>'amount')::numeric,
        v_method, 'Sale ' || v_sale.invoice_no,
        'sales', v_sale.id, v_sale.invoice_no, _cashier_id
      );
    END IF;
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
     SET subtotal=v_subtotal, discount=v_disc_total + COALESCE(_discount,0),
         vat=v_vat_total, total=v_total, paid=v_paid,
         due=GREATEST(v_total - v_paid, 0),
         payment_method=CASE WHEN v_pay_count > 1 THEN 'split' ELSE COALESCE(v_first_method,'cash') END,
         status=v_status
   WHERE id = v_sale.id
   RETURNING * INTO v_sale;

  PERFORM public.audit_log_event(
    _tenant_id, 'pos.sale_created', 'sales', v_sale.id, NULL,
    jsonb_build_object('invoice_no', v_sale.invoice_no, 'total', v_total,
      'paid', v_paid, 'due', v_sale.due, 'status', v_status,
      'register_id', _register_id, 'warehouse_id', _warehouse_id));

  RETURN v_sale;
END;
$function$;
