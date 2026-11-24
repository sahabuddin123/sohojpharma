-- 1. Edit history table
CREATE TABLE IF NOT EXISTS public.invoice_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  invoice_no text NOT NULL,
  edited_by uuid,
  edited_at timestamptz NOT NULL DEFAULT now(),
  old_total numeric(14,2) NOT NULL DEFAULT 0,
  new_total numeric(14,2) NOT NULL DEFAULT 0,
  old_paid numeric(14,2) NOT NULL DEFAULT 0,
  new_paid numeric(14,2) NOT NULL DEFAULT 0,
  old_due numeric(14,2) NOT NULL DEFAULT 0,
  new_due numeric(14,2) NOT NULL DEFAULT 0,
  old_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  new_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text
);

CREATE INDEX IF NOT EXISTS idx_invoice_edit_history_sale ON public.invoice_edit_history(sale_id, edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_edit_history_tenant ON public.invoice_edit_history(tenant_id, edited_at DESC);

GRANT SELECT, INSERT ON public.invoice_edit_history TO authenticated;
GRANT ALL ON public.invoice_edit_history TO service_role;

ALTER TABLE public.invoice_edit_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can view edit history"
  ON public.invoice_edit_history FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "tenant members can insert edit history"
  ON public.invoice_edit_history FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));

-- 2. Replace edit_sale_invoice with snapshot-capturing version
CREATE OR REPLACE FUNCTION public.edit_sale_invoice(_tenant_id uuid, _original_sale_id uuid, _customer_id uuid, _cashier_id uuid, _discount numeric DEFAULT 0, _notes text DEFAULT NULL::text, _client_op_id uuid DEFAULT NULL::uuid, _items jsonb DEFAULT '[]'::jsonb, _payments jsonb DEFAULT '[]'::jsonb, _register_id uuid DEFAULT NULL::uuid)
 RETURNS sales
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_orig          public.sales;
  v_sale          public.sales;
  v_old           record;
  v_item          jsonb;
  v_pay           jsonb;
  v_product_id    uuid;
  v_requested_qty numeric;
  v_need_qty      numeric;
  v_unit_price    numeric;
  v_line_disc     numeric;
  v_line_vat      numeric;
  v_allow_override boolean;
  v_override_qty  numeric;
  v_override_cost numeric;
  v_batch         record;
  v_take          numeric;
  v_subtotal      numeric := 0;
  v_vat_total     numeric := 0;
  v_disc_total    numeric := 0;
  v_total         numeric := 0;
  v_paid          numeric := 0;
  v_method        text;
  v_pay_count     int := 0;
  v_old_items_snapshot jsonb := '[]'::jsonb;
  v_new_items_snapshot jsonb := '[]'::jsonb;
  v_first_method  text;
  v_status        public.sale_status;
  v_reg           public.cash_registers;
  v_tenant_allow_override boolean;
  v_has_any_batch boolean;
  v_override_products uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF _client_op_id IS NOT NULL THEN
    SELECT * INTO v_sale
      FROM public.sales
     WHERE tenant_id = _tenant_id AND id = _original_sale_id AND client_op_id = _client_op_id
     LIMIT 1;
    IF FOUND THEN RETURN v_sale; END IF;
  END IF;

  SELECT * INTO v_orig FROM public.sales
   WHERE id = _original_sale_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'original invoice not found' USING ERRCODE='23503'; END IF;
  IF v_orig.status IN ('void','returned','partially_returned') THEN
    RAISE EXCEPTION 'invoice cannot be edited (status: %)', v_orig.status USING ERRCODE='22023';
  END IF;
  IF COALESCE(v_orig.is_return, false) THEN
    RAISE EXCEPTION 'return invoices cannot be edited' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(COALESCE(_items,'[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'cart is empty' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(allow_stock_override, false) INTO v_tenant_allow_override
    FROM public.tenants WHERE id = _tenant_id;

  IF _register_id IS NOT NULL THEN
    SELECT * INTO v_reg FROM public.cash_registers
      WHERE id = _register_id AND tenant_id = _tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'register not found' USING ERRCODE='23503'; END IF;
    IF v_reg.status <> 'open' THEN RAISE EXCEPTION 'register is closed' USING ERRCODE='22023'; END IF;
  END IF;

  PERFORM public.cancel_sale_journals(_tenant_id, _original_sale_id, 'Invoice edited (in-place)');

  SELECT COALESCE(array_agg(DISTINCT product_id), ARRAY[]::uuid[])
    INTO v_override_products
    FROM public.sale_items
   WHERE sale_id = _original_sale_id AND tenant_id = _tenant_id AND batch_id IS NULL;

  FOR v_old IN
    SELECT product_id, batch_id, qty, COALESCE(returned_qty,0) AS returned_qty
      FROM public.sale_items
     WHERE sale_id = _original_sale_id AND tenant_id = _tenant_id
  LOOP
    v_need_qty := GREATEST(v_old.qty - v_old.returned_qty, 0);
    IF v_need_qty <= 0 OR v_old.batch_id IS NULL THEN CONTINUE; END IF;
    UPDATE public.batches SET qty_on_hand = qty_on_hand + v_need_qty WHERE id = v_old.batch_id;
  END LOOP;

  -- SNAPSHOT OLD ITEMS FOR HISTORY
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', si.product_id, 'product_name', p.name,
    'qty', si.qty, 'unit_price', si.unit_price,
    'discount', si.discount, 'vat', si.vat, 'line_total', si.line_total)), '[]'::jsonb)
    INTO v_old_items_snapshot
    FROM public.sale_items si LEFT JOIN public.products p ON p.id = si.product_id
   WHERE si.sale_id = _original_sale_id AND si.tenant_id = _tenant_id;

  DELETE FROM public.stock_movements
   WHERE tenant_id = _tenant_id AND reference_table = 'sales' AND reference_id = _original_sale_id;
  DELETE FROM public.cash_register_transactions
   WHERE tenant_id = _tenant_id AND reference_table = 'sales' AND reference_id = _original_sale_id;
  DELETE FROM public.sale_payments
   WHERE tenant_id = _tenant_id AND sale_id = _original_sale_id;
  DELETE FROM public.sale_items
   WHERE tenant_id = _tenant_id AND sale_id = _original_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product_id     := (v_item->>'product_id')::uuid;
    v_requested_qty  := (v_item->>'qty')::numeric;
    v_need_qty       := v_requested_qty;
    v_unit_price     := (v_item->>'unit_price')::numeric;
    v_line_disc      := COALESCE((v_item->>'discount')::numeric, 0);
    v_line_vat       := COALESCE((v_item->>'vat')::numeric, 0);
    v_allow_override := COALESCE((v_item->>'allow_stock_override')::boolean, false)
                        OR (v_product_id = ANY(v_override_products));
    IF v_need_qty IS NULL OR v_need_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty for product %', v_product_id USING ERRCODE='22023';
    END IF;
    FOR v_batch IN
      SELECT id, expiry_date, qty_on_hand, purchase_price
        FROM public.batches
       WHERE tenant_id = _tenant_id AND product_id = v_product_id AND qty_on_hand > 0
       ORDER BY expiry_date ASC, created_at ASC FOR UPDATE
    LOOP
      EXIT WHEN v_need_qty <= 0;
      v_take := LEAST(v_need_qty, v_batch.qty_on_hand);
      UPDATE public.batches SET qty_on_hand = qty_on_hand - v_take WHERE id = v_batch.id;
      INSERT INTO public.sale_items(
        tenant_id, sale_id, product_id, batch_id, qty, unit_price, unit_cost, discount, vat, line_total
      ) VALUES (
        _tenant_id, _original_sale_id, v_product_id, v_batch.id,
        v_take, v_unit_price, v_batch.purchase_price,
        ROUND(v_line_disc * v_take / v_requested_qty, 2),
        ROUND(v_line_vat  * v_take / v_requested_qty, 2),
        ROUND(v_take * v_unit_price - v_line_disc * v_take / v_requested_qty + v_line_vat * v_take / v_requested_qty, 2)
      );
      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
        reference_table, reference_id, reference_no, user_id, notes
      ) VALUES (
        _tenant_id, v_product_id, v_batch.id, 'sale', -v_take,
        v_batch.qty_on_hand - v_take, 'sales', _original_sale_id, v_orig.invoice_no, _cashier_id,
        'Invoice edited (in-place)'
      );
      v_need_qty := v_need_qty - v_take;
    END LOOP;
    IF v_need_qty > 0 THEN
      IF NOT (v_tenant_allow_override AND v_allow_override) THEN
        SELECT EXISTS(SELECT 1 FROM public.batches WHERE tenant_id = _tenant_id AND product_id = v_product_id)
          INTO v_has_any_batch;
        IF NOT v_has_any_batch THEN
          RAISE EXCEPTION 'Opening stock not initialized for product %. Please initialize via Opening Stock Wizard.',
            v_product_id USING ERRCODE='23514';
        ELSE
          RAISE EXCEPTION 'insufficient stock for product %: short by %',
            v_product_id, v_need_qty USING ERRCODE='23514';
        END IF;
      END IF;
      v_override_qty := v_need_qty;
      SELECT COALESCE(p.purchase_price, 0) INTO v_override_cost
        FROM public.products p WHERE p.id = v_product_id AND p.tenant_id = _tenant_id;
      INSERT INTO public.sale_items(
        tenant_id, sale_id, product_id, batch_id, qty, unit_price, unit_cost, discount, vat, line_total
      ) VALUES (
        _tenant_id, _original_sale_id, v_product_id, NULL,
        v_need_qty, v_unit_price, COALESCE(v_override_cost, 0),
        ROUND(v_line_disc * v_need_qty / v_requested_qty, 2),
        ROUND(v_line_vat  * v_need_qty / v_requested_qty, 2),
        ROUND(v_need_qty * v_unit_price - v_line_disc * v_need_qty / v_requested_qty + v_line_vat * v_need_qty / v_requested_qty, 2)
      );
      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
        reference_table, reference_id, reference_no, user_id, notes
      ) VALUES (
        _tenant_id, v_product_id, NULL, 'sale', -v_need_qty,
        NULL, 'sales', _original_sale_id, v_orig.invoice_no, _cashier_id,
        'Invoice edited — stock override line'
      );
      v_need_qty := 0;
    END IF;
    v_subtotal   := v_subtotal   + (v_requested_qty * v_unit_price);
    v_disc_total := v_disc_total + v_line_disc;
    v_vat_total  := v_vat_total  + v_line_vat;
  END LOOP;

  v_total := v_subtotal - v_disc_total - COALESCE(_discount,0) + v_vat_total;
  IF v_total < 0 THEN
    RAISE EXCEPTION 'invoice total cannot be negative' USING ERRCODE='22023';
  END IF;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    v_method := v_pay->>'method';
    IF v_pay_count = 0 THEN v_first_method := v_method; END IF;
    v_pay_count := v_pay_count + 1;
    IF v_method = 'due' OR COALESCE((v_pay->>'amount')::numeric, 0) = 0 THEN CONTINUE; END IF;
    INSERT INTO public.sale_payments(
      tenant_id, sale_id, method, amount, reference, mobile_no, created_by
    ) VALUES (
      _tenant_id, _original_sale_id, v_method::public.payment_method,
      (v_pay->>'amount')::numeric, v_pay->>'reference', v_pay->>'mobile_no', _cashier_id
    );
    v_paid := v_paid + (v_pay->>'amount')::numeric;
    IF _register_id IS NOT NULL THEN
      INSERT INTO public.cash_register_transactions(
        tenant_id, register_id, transaction_type, amount,
        payment_method, notes, reference_table, reference_id, reference_no, created_by
      ) VALUES (
        _tenant_id, _register_id, 'sale', (v_pay->>'amount')::numeric,
        v_method, 'Sale ' || v_orig.invoice_no || ' (edited)',
        'sales', _original_sale_id, v_orig.invoice_no, _cashier_id
      );
    END IF;
  END LOOP;

  IF v_paid > v_total + 0.001 THEN
    RAISE EXCEPTION 'payments (%) exceed invoice total (%) — issue refund or convert to customer credit before saving',
      v_paid, v_total USING ERRCODE='22023';
  END IF;
  IF v_total - v_paid > 0.001 THEN
    IF _customer_id IS NULL THEN
      RAISE EXCEPTION 'walk-in sale cannot leave a due balance' USING ERRCODE='22023';
    END IF;
    v_status := 'partial';
  ELSE
    v_status := 'completed';
  END IF;

  UPDATE public.sales
     SET subtotal = v_subtotal,
         discount = v_disc_total + COALESCE(_discount,0),
         vat = v_vat_total,
         total = v_total,
         paid = v_paid,
         due = GREATEST(v_total - v_paid, 0),
         payment_method = CASE WHEN v_pay_count > 1 THEN 'split' ELSE COALESCE(v_first_method,'cash') END,
         status = v_status,
         notes = _notes,
         cashier_id = _cashier_id,
         client_op_id = COALESCE(_client_op_id, client_op_id),
         cancelled_at = NULL,
         cancelled_by = NULL,
         cancellation_reason = NULL
   WHERE id = _original_sale_id
   RETURNING * INTO v_sale;

  -- SNAPSHOT NEW ITEMS FOR HISTORY
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', si.product_id, 'product_name', p.name,
    'qty', si.qty, 'unit_price', si.unit_price,
    'discount', si.discount, 'vat', si.vat, 'line_total', si.line_total)), '[]'::jsonb)
    INTO v_new_items_snapshot
    FROM public.sale_items si LEFT JOIN public.products p ON p.id = si.product_id
   WHERE si.sale_id = _original_sale_id AND si.tenant_id = _tenant_id;

  PERFORM public.post_sale_journal(_tenant_id, _original_sale_id);

  INSERT INTO public.audit_log(
    tenant_id, user_id, action, entity_table, entity_id, before_data, after_data
  ) VALUES (
    _tenant_id, auth.uid(), 'invoice.edited', 'sales', _original_sale_id,
    jsonb_build_object('invoice_no', v_orig.invoice_no, 'total', v_orig.total, 'paid', v_orig.paid, 'due', v_orig.due, 'status', v_orig.status),
    jsonb_build_object('invoice_no', v_sale.invoice_no, 'total', v_sale.total, 'paid', v_sale.paid, 'due', v_sale.due, 'status', v_sale.status, 'mode', 'in_place_update')
  );

  INSERT INTO public.invoice_edit_history(
    tenant_id, sale_id, invoice_no, edited_by,
    old_total, new_total, old_paid, new_paid, old_due, new_due,
    old_items, new_items, reason
  ) VALUES (
    _tenant_id, _original_sale_id, v_sale.invoice_no, auth.uid(),
    v_orig.total, v_sale.total, v_orig.paid, v_sale.paid, v_orig.due, v_sale.due,
    v_old_items_snapshot, v_new_items_snapshot, _notes
  );

  RETURN v_sale;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.edit_sale_invoice(uuid, uuid, uuid, uuid, numeric, text, uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;