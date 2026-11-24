
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS client_op_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS sales_returns_client_op_id_key
  ON public.sales_returns(client_op_id) WHERE client_op_id IS NOT NULL;

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS branch_id uuid;

UPDATE public.stock_movements sm SET branch_id = w.branch_id
  FROM public.warehouses w
 WHERE sm.branch_id IS NULL AND sm.warehouse_id = w.id AND w.branch_id IS NOT NULL;

UPDATE public.stock_movements sm SET branch_id = w.branch_id
  FROM public.batches b JOIN public.warehouses w ON w.id = b.warehouse_id
 WHERE sm.branch_id IS NULL AND sm.batch_id = b.id AND w.branch_id IS NOT NULL;

UPDATE public.stock_movements sm SET branch_id = public.resolve_default_branch(sm.tenant_id)
 WHERE sm.branch_id IS NULL;

CREATE OR REPLACE FUNCTION public.tg_stock_movement_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.branch_id IS NULL AND NEW.warehouse_id IS NOT NULL THEN
    SELECT branch_id INTO NEW.branch_id FROM public.warehouses WHERE id = NEW.warehouse_id;
  END IF;
  IF NEW.branch_id IS NULL AND NEW.batch_id IS NOT NULL THEN
    SELECT w.branch_id INTO NEW.branch_id
      FROM public.batches b JOIN public.warehouses w ON w.id = b.warehouse_id WHERE b.id = NEW.batch_id;
  END IF;
  IF NEW.branch_id IS NULL AND NEW.tenant_id IS NOT NULL THEN
    NEW.branch_id := public.resolve_default_branch(NEW.tenant_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_set_branch_id ON public.stock_movements;
CREATE TRIGGER tg_set_branch_id BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.tg_stock_movement_branch();

CREATE UNIQUE INDEX IF NOT EXISTS cash_registers_one_open_per_user
  ON public.cash_registers(tenant_id, user_id) WHERE status = 'open';

CREATE UNIQUE INDEX IF NOT EXISTS held_sales_unique_label_per_tenant
  ON public.held_sales(tenant_id, lower(label))
  WHERE deleted_at IS NULL AND label IS NOT NULL;

-- Helper: caller is a tenant manager/owner/corporate admin
CREATE OR REPLACE FUNCTION public.is_tenant_manager_or_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_app_admin(_user_id)
      OR public.has_role(_user_id, _tenant_id, 'owner'::app_role)
      OR public.has_role(_user_id, _tenant_id, 'manager'::app_role)
      OR public.has_role(_user_id, _tenant_id, 'corporate_admin'::app_role);
$$;
GRANT EXECUTE ON FUNCTION public.is_tenant_manager_or_admin(uuid,uuid) TO authenticated;

DROP POLICY IF EXISTS held_sales_tenant_all ON public.held_sales;
CREATE POLICY held_sales_select_member ON public.held_sales
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY held_sales_insert_self ON public.held_sales
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id) AND held_by = auth.uid());
CREATE POLICY held_sales_update_owner_or_manager ON public.held_sales
  FOR UPDATE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)
         AND (held_by = auth.uid() OR public.is_tenant_manager_or_admin(auth.uid(), tenant_id)));
CREATE POLICY held_sales_delete_owner_or_manager ON public.held_sales
  FOR DELETE TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id)
         AND (held_by = auth.uid() OR public.is_tenant_manager_or_admin(auth.uid(), tenant_id)));

CREATE OR REPLACE FUNCTION public.expire_old_holds()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.held_sales SET deleted_at = now()
   WHERE deleted_at IS NULL AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.expire_old_holds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_old_holds() TO service_role;

-- P6 sale ownership
DROP POLICY IF EXISTS branch_isolation_update ON public.sales;
CREATE POLICY branch_isolation_update ON public.sales
  FOR UPDATE TO authenticated
  USING (
    (public.is_corporate_writer(auth.uid(), tenant_id)
       OR public.is_tenant_manager_or_admin(auth.uid(), tenant_id)
       OR cashier_id = auth.uid())
    AND (public.is_corporate_role(auth.uid(), tenant_id) OR public.has_branch_access(auth.uid(), branch_id))
  )
  WITH CHECK (
    (public.is_corporate_writer(auth.uid(), tenant_id)
       OR public.is_tenant_manager_or_admin(auth.uid(), tenant_id)
       OR cashier_id = auth.uid())
    AND (public.is_corporate_role(auth.uid(), tenant_id) OR public.has_branch_access(auth.uid(), branch_id))
  );

DROP POLICY IF EXISTS branch_isolation_delete ON public.sales;
CREATE POLICY branch_isolation_delete ON public.sales
  FOR DELETE TO authenticated
  USING (public.is_corporate_writer(auth.uid(), tenant_id)
         OR public.is_tenant_manager_or_admin(auth.uid(), tenant_id));

-- P3 reconciliation
CREATE OR REPLACE FUNCTION public.reconcile_register_session(_register_id uuid)
RETURNS TABLE (register_id uuid, opening_amount numeric, cash_in numeric, cash_out numeric,
               expected_cash numeric, actual_cash numeric, variance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_reg public.cash_registers; v_in numeric := 0; v_out numeric := 0;
BEGIN
  SELECT * INTO v_reg FROM public.cash_registers WHERE id = _register_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'register not found' USING ERRCODE='23503'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_reg.tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE transaction_type::text IN ('sale','cash_in','collection')
                                   AND COALESCE(payment_method,'cash')='cash'), 0),
    COALESCE(SUM(amount) FILTER (WHERE transaction_type::text IN ('sale_refund','cash_out','expense','payout')
                                   AND COALESCE(payment_method,'cash')='cash'), 0)
  INTO v_in, v_out FROM public.cash_register_transactions WHERE register_id = _register_id;

  RETURN QUERY SELECT v_reg.id, v_reg.opening_amount, v_in, v_out,
    v_reg.opening_amount + v_in - v_out,
    COALESCE(v_reg.actual_closing_amount, 0),
    COALESCE(v_reg.actual_closing_amount, 0) - (v_reg.opening_amount + v_in - v_out);
END $$;
GRANT EXECUTE ON FUNCTION public.reconcile_register_session(uuid) TO authenticated;

-- P1 + P2 pos_checkout: register required + ownership check
CREATE OR REPLACE FUNCTION public.pos_checkout(
  _tenant_id uuid, _customer_id uuid, _cashier_id uuid, _invoice_no text,
  _discount numeric DEFAULT 0, _notes text DEFAULT NULL, _client_op_id uuid DEFAULT NULL,
  _items jsonb DEFAULT '[]', _payments jsonb DEFAULT '[]',
  _register_id uuid DEFAULT NULL, _warehouse_id uuid DEFAULT NULL
) RETURNS public.sales LANGUAGE plpgsql SET search_path = public AS $function$
DECLARE
  v_sale public.sales; v_existing public.sales; v_item jsonb; v_pay jsonb;
  v_product_id uuid; v_requested_qty numeric; v_need_qty numeric;
  v_unit_price numeric; v_line_disc numeric; v_line_vat numeric;
  v_allow_override boolean; v_override_cost numeric; v_override_qty numeric;
  v_batch record; v_take numeric;
  v_subtotal numeric := 0; v_vat_total numeric := 0; v_disc_total numeric := 0;
  v_total numeric := 0; v_paid numeric := 0;
  v_method text; v_pay_count int := 0; v_first_method text;
  v_status sale_status; v_reg public.cash_registers; v_attempt int;
  v_tenant_allow_override boolean; v_has_any_batch boolean;
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

  IF _register_id IS NULL THEN
    RAISE EXCEPTION 'register_required: open a cash register before completing a sale'
      USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_reg FROM public.cash_registers
    WHERE id = _register_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'register not found' USING ERRCODE='23503'; END IF;
  IF v_reg.status <> 'open' THEN RAISE EXCEPTION 'register is closed' USING ERRCODE='22023'; END IF;
  IF v_reg.user_id <> auth.uid() AND NOT public.is_tenant_manager_or_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'register_ownership: cannot transact on another cashier register'
      USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(allow_stock_override, false) INTO v_tenant_allow_override
    FROM public.tenants WHERE id = _tenant_id;

  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;
    BEGIN
      INSERT INTO public.sales(
        tenant_id, invoice_no, customer_id, cashier_id, warehouse_id,
        subtotal, discount, vat, total, paid, due,
        payment_method, status, notes, client_op_id
      ) VALUES (
        _tenant_id, COALESCE(NULLIF(_invoice_no,''), public.next_invoice_no(_tenant_id)),
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
    v_product_id := (v_item->>'product_id')::uuid;
    v_requested_qty := (v_item->>'qty')::numeric;
    v_need_qty := v_requested_qty;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_line_disc := COALESCE((v_item->>'discount')::numeric, 0);
    v_line_vat := COALESCE((v_item->>'vat')::numeric, 0);
    v_allow_override := COALESCE((v_item->>'allow_stock_override')::boolean, false);

    IF v_need_qty IS NULL OR v_need_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty for product %', v_product_id USING ERRCODE = '22023';
    END IF;

    FOR v_batch IN
      SELECT id, expiry_date, qty_on_hand, purchase_price, warehouse_id
        FROM public.batches
       WHERE tenant_id = _tenant_id AND product_id = v_product_id
         AND qty_on_hand > 0 AND expiry_date >= CURRENT_DATE
         AND (_warehouse_id IS NULL OR warehouse_id = _warehouse_id)
       ORDER BY expiry_date ASC, created_at ASC FOR UPDATE
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
        _tenant_id, v_product_id, v_batch.id, COALESCE(_warehouse_id, v_batch.warehouse_id),
        'sale', -v_take, v_batch.qty_on_hand - v_take, 'sales', v_sale.id,
        v_sale.invoice_no, _cashier_id
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
        FROM public.products p WHERE p.id = v_product_id AND p.tenant_id = _tenant_id;
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
        jsonb_build_object('user_id', _cashier_id, 'product_id', v_product_id,
          'qty', v_override_qty, 'invoice_no', v_sale.invoice_no,
          'warehouse_id', _warehouse_id, 'timestamp', now()));
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
      (v_pay->>'amount')::numeric, v_pay->>'reference', v_pay->>'mobile_no', _cashier_id
    );
    v_paid := v_paid + (v_pay->>'amount')::numeric;
    IF v_method <> 'due' THEN
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
   WHERE id = v_sale.id RETURNING * INTO v_sale;

  PERFORM public.audit_log_event(
    _tenant_id, 'pos.sale_created', 'sales', v_sale.id, NULL,
    jsonb_build_object('invoice_no', v_sale.invoice_no, 'total', v_total,
      'paid', v_paid, 'due', v_sale.due, 'status', v_status,
      'register_id', _register_id, 'warehouse_id', _warehouse_id));
  RETURN v_sale;
END $function$;

-- P1 pos_return: idempotent, status-guarded, override-restored, register-enforced
DROP FUNCTION IF EXISTS public.pos_return(uuid,uuid,jsonb,text,text,numeric,text,uuid);
CREATE OR REPLACE FUNCTION public.pos_return(
  _tenant_id uuid, _sale_id uuid, _items jsonb DEFAULT '[]',
  _reason text DEFAULT NULL, _refund_method text DEFAULT 'cash',
  _refund_amount numeric DEFAULT NULL, _notes text DEFAULT NULL,
  _register_id uuid DEFAULT NULL, _client_op_id uuid DEFAULT NULL
) RETURNS public.sales_returns LANGUAGE plpgsql SET search_path = public AS $function$
DECLARE
  v_sale public.sales; v_ret public.sales_returns; v_existing public.sales_returns;
  v_item jsonb; v_si public.sale_items; v_qty numeric; v_avail numeric;
  v_subtotal numeric := 0; v_vat_total numeric := 0; v_total numeric := 0;
  v_refund numeric; v_method_pm public.payment_method;
  v_special text := NULL; v_return_no text;
  v_sold_total numeric := 0; v_returned_total numeric := 0;
  v_new_status public.sale_status; v_reg public.cash_registers;
  v_needs_register boolean;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF _client_op_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.sales_returns
     WHERE client_op_id = _client_op_id AND tenant_id = _tenant_id;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  SELECT * INTO v_sale FROM public.sales
   WHERE id = _sale_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE='23503'; END IF;

  IF v_sale.status NOT IN ('completed','partial','partially_returned') THEN
    RAISE EXCEPTION 'cannot return sale in status %', v_sale.status USING ERRCODE='22023';
  END IF;

  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'no items to return' USING ERRCODE='22023';
  END IF;

  IF lower(COALESCE(_refund_method,'cash')) IN ('due','store_credit','adjustment') THEN
    v_special := lower(_refund_method);
    v_method_pm := 'other'::public.payment_method;
  ELSE
    v_method_pm := lower(COALESCE(_refund_method,'cash'))::public.payment_method;
  END IF;
  v_needs_register := v_special IS NULL;

  v_return_no := 'RTN-' || to_char(now(),'YYYYMMDDHH24MISS') || '-' || substr(_sale_id::text,1,4);

  INSERT INTO public.sales_returns(
    tenant_id, return_no, sale_id, customer_id, return_date, reason,
    subtotal, vat, total, refund_method, refunded_amount, notes, created_by, client_op_id
  ) VALUES (
    _tenant_id, v_return_no, _sale_id, v_sale.customer_id, CURRENT_DATE, _reason,
    0, 0, 0, v_method_pm, 0,
    COALESCE(_notes,'') || CASE WHEN v_special IS NOT NULL THEN ' [refund=' || v_special || ']' ELSE '' END,
    auth.uid(), _client_op_id
  ) RETURNING * INTO v_ret;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO v_si FROM public.sale_items
     WHERE id = (v_item->>'sale_item_id')::uuid
       AND sale_id = _sale_id AND tenant_id = _tenant_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sale_item % not found on this invoice', v_item->>'sale_item_id' USING ERRCODE='23503';
    END IF;

    v_qty := (v_item->>'qty')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'return qty must be > 0' USING ERRCODE='22023';
    END IF;

    v_avail := v_si.qty - COALESCE(v_si.returned_qty,0);
    IF v_qty > v_avail THEN
      RAISE EXCEPTION 'cannot return % of product % — only % available',
        v_qty, v_si.product_id, v_avail USING ERRCODE='23514';
    END IF;

    IF v_si.batch_id IS NOT NULL THEN
      UPDATE public.batches SET qty_on_hand = qty_on_hand + v_qty WHERE id = v_si.batch_id;
      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, warehouse_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id, notes
      ) SELECT
        _tenant_id, v_si.product_id, v_si.batch_id, b.warehouse_id, 'sales_return', v_qty,
        b.qty_on_hand, 'sales_returns', v_ret.id, v_return_no, auth.uid(), _reason
      FROM public.batches b WHERE b.id = v_si.batch_id;
    ELSE
      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, warehouse_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id, notes
      ) VALUES (
        _tenant_id, v_si.product_id, NULL, v_si.warehouse_id, 'adjustment', v_qty,
        NULL, 'sales_returns', v_ret.id, v_return_no, auth.uid(),
        COALESCE(_reason,'') || ' [override-recovery: no batch — quarantine for manual reassignment]'
      );
      PERFORM public.audit_log_event(
        _tenant_id, 'sale_return.override_recovery', 'sales_returns', v_ret.id, NULL,
        jsonb_build_object('product_id', v_si.product_id, 'qty', v_qty,
          'sale_item_id', v_si.id, 'invoice_no', v_sale.invoice_no));
    END IF;

    UPDATE public.sale_items
       SET returned_qty = COALESCE(returned_qty,0) + v_qty WHERE id = v_si.id;

    DECLARE v_line_value numeric; v_line_vat numeric;
    BEGIN
      v_line_value := ROUND((v_si.unit_price * v_qty)
                          - (COALESCE(v_si.discount,0) * v_qty / NULLIF(v_si.qty,0)), 2);
      v_line_vat   := ROUND(COALESCE(v_si.vat,0) * v_qty / NULLIF(v_si.qty,0), 2);
      INSERT INTO public.sale_return_items(
        tenant_id, return_id, sale_item_id, product_id, batch_id,
        qty, unit_price, line_total, reason
      ) VALUES (
        _tenant_id, v_ret.id, v_si.id, v_si.product_id, v_si.batch_id,
        v_qty, v_si.unit_price, v_line_value + v_line_vat, _reason
      );
      v_subtotal  := v_subtotal  + v_line_value;
      v_vat_total := v_vat_total + v_line_vat;
    END;
  END LOOP;

  v_total  := v_subtotal + v_vat_total;
  v_refund := COALESCE(_refund_amount, v_total);
  IF v_refund < 0 THEN
    RAISE EXCEPTION 'refund_amount cannot be negative' USING ERRCODE='22023';
  END IF;

  UPDATE public.sales_returns
     SET subtotal = v_subtotal, vat = v_vat_total, total = v_total, refunded_amount = v_refund
   WHERE id = v_ret.id RETURNING * INTO v_ret;

  IF v_sale.customer_id IS NOT NULL AND v_refund > 0
     AND v_special IN ('due','store_credit','adjustment') THEN
    PERFORM public.post_ledger_entry(
      _tenant_id, 'customer'::public.party_type, v_sale.customer_id,
      'sales_return'::public.ledger_entry_type,
      0, v_refund, 'sales_returns', v_ret.id, v_return_no,
      'Return ' || v_return_no || COALESCE(' — '||_reason,''));
  END IF;

  IF v_refund > 0 AND v_needs_register THEN
    IF _register_id IS NOT NULL THEN
      SELECT * INTO v_reg FROM public.cash_registers
       WHERE id = _register_id AND tenant_id = _tenant_id;
    ELSE
      SELECT * INTO v_reg FROM public.cash_registers
       WHERE tenant_id = _tenant_id AND user_id = auth.uid() AND status = 'open'
       ORDER BY opened_at DESC LIMIT 1;
    END IF;
    IF v_reg.id IS NULL OR v_reg.status <> 'open' THEN
      RAISE EXCEPTION 'register_required: cash refund needs an open register'
        USING ERRCODE='22023';
    END IF;
    INSERT INTO public.cash_register_transactions(
      tenant_id, register_id, transaction_type, amount,
      payment_method, notes, reference_table, reference_id, reference_no, created_by
    ) VALUES (
      _tenant_id, v_reg.id, 'sale_refund'::public.cash_txn_type, v_refund,
      v_method_pm::text,
      'Refund for return ' || v_return_no || COALESCE(' — '||_reason,''),
      'sales_returns', v_ret.id, v_return_no, auth.uid()
    );
    PERFORM public.audit_log_event(
      _tenant_id, 'register.sale_refund', 'cash_register_transactions', v_ret.id, NULL,
      jsonb_build_object('register_id', v_reg.id, 'amount', v_refund,
                         'method', v_method_pm, 'return_no', v_return_no));
  END IF;

  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(returned_qty),0)
    INTO v_sold_total, v_returned_total
    FROM public.sale_items WHERE sale_id = _sale_id AND tenant_id = _tenant_id;
  IF v_returned_total >= v_sold_total THEN v_new_status := 'returned';
  ELSIF v_returned_total > 0 THEN v_new_status := 'partially_returned';
  ELSE v_new_status := v_sale.status;
  END IF;
  UPDATE public.sales SET status = v_new_status WHERE id = _sale_id;

  PERFORM public.audit_log_event(
    _tenant_id,
    CASE WHEN v_new_status = 'returned' THEN 'sale_return.full' ELSE 'sale_return.partial' END,
    'sales_returns', v_ret.id, NULL,
    jsonb_build_object('return_no', v_return_no, 'sale_id', _sale_id,
                       'total', v_total, 'refund', v_refund,
                       'method', v_method_pm, 'special', v_special,
                       'register_id', v_reg.id));
  RETURN v_ret;
END $function$;
