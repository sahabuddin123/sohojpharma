
-- =====================================================================
-- PHASE P7 — VAT INTEGRITY
-- =====================================================================

-- P7-A: ensure server-side VAT columns persisted on sale_items
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_method text NOT NULL DEFAULT 'exclusive',
  ADD COLUMN IF NOT EXISTS taxable_amount numeric NOT NULL DEFAULT 0;

-- P7-D: immutable per-line VAT audit trail (NBR readiness)
CREATE TABLE IF NOT EXISTS public.sale_tax_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sale_id uuid,
  return_id uuid,
  sale_item_id uuid,
  product_id uuid,
  vat_rate numeric NOT NULL,
  vat_method text NOT NULL,
  taxable_amount numeric NOT NULL,
  vat_amount numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('sale','return')),
  source text NOT NULL CHECK (source IN ('product','tenant_default','zero')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sale_tax_audit TO authenticated;
GRANT ALL ON public.sale_tax_audit TO service_role;
ALTER TABLE public.sale_tax_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tax_audit_tenant_read" ON public.sale_tax_audit;
CREATE POLICY "tax_audit_tenant_read" ON public.sale_tax_audit
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX IF NOT EXISTS idx_sale_tax_audit_sale ON public.sale_tax_audit(tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_tax_audit_return ON public.sale_tax_audit(tenant_id, return_id);

-- P7-B: server-authoritative VAT resolver
CREATE OR REPLACE FUNCTION public.resolve_product_vat(
  _tenant_id uuid, _product_id uuid,
  OUT vat_rate numeric, OUT vat_method text, OUT vat_source text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rate numeric; v_method text; v_default_rate numeric;
BEGIN
  SELECT p.vat_rate, COALESCE(p.vat_mode,'exclusive')
    INTO v_rate, v_method
    FROM public.products p
   WHERE p.id = _product_id AND p.tenant_id = _tenant_id;

  IF v_rate IS NOT NULL AND v_rate > 0 THEN
    vat_rate := v_rate; vat_method := v_method; vat_source := 'product'; RETURN;
  END IF;

  SELECT COALESCE((tax->>'default_vat_rate')::numeric, 0)
    INTO v_default_rate FROM public.tenant_settings WHERE tenant_id = _tenant_id;

  IF v_default_rate IS NOT NULL AND v_default_rate > 0 THEN
    vat_rate := v_default_rate;
    vat_method := COALESCE(v_method,'exclusive');
    vat_source := 'tenant_default';
  ELSE
    vat_rate := 0;
    vat_method := COALESCE(v_method,'exclusive');
    vat_source := 'zero';
  END IF;
END $$;

-- =====================================================================
-- PHASE P8 — HIGH-CONCURRENCY NUMBERING (native PG sequences)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tenant_number_sequences (
  tenant_id uuid NOT NULL,
  doc_type text NOT NULL,
  sequence_name text NOT NULL UNIQUE,
  prefix text NOT NULL,
  start_value bigint NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, doc_type)
);
GRANT SELECT ON public.tenant_number_sequences TO authenticated;
GRANT ALL ON public.tenant_number_sequences TO service_role;
ALTER TABLE public.tenant_number_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tns_tenant_read" ON public.tenant_number_sequences;
CREATE POLICY "tns_tenant_read" ON public.tenant_number_sequences
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

-- Lock-free generator backed by native PostgreSQL sequences.
-- nextval() is atomic; no row locks, no advisory locks, no retry loops.
CREATE OR REPLACE FUNCTION public.generate_next_number(_tenant_id uuid, _doc_type text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_cfg jsonb; v_prefix text; v_start bigint;
  v_seq_name text; v_next bigint; v_reg public.tenant_number_sequences;
BEGIN
  IF _tenant_id IS NULL OR COALESCE(_doc_type,'') = '' THEN
    RAISE EXCEPTION 'tenant_id and doc_type required';
  END IF;

  SELECT * INTO v_reg
    FROM public.tenant_number_sequences
   WHERE tenant_id=_tenant_id AND doc_type=_doc_type;

  IF NOT FOUND THEN
    SELECT (number_series -> _doc_type) INTO v_cfg
      FROM public.tenant_settings WHERE tenant_id = _tenant_id;
    v_prefix := COALESCE(NULLIF(v_cfg ->> 'prefix',''), UPPER(_doc_type));
    v_start  := GREATEST(COALESCE((v_cfg ->> 'start')::bigint, 1000), 1);
    v_seq_name := 'seq_' || replace(_tenant_id::text,'-','') || '_' || regexp_replace(lower(_doc_type),'[^a-z0-9]+','_','g');

    BEGIN
      INSERT INTO public.tenant_number_sequences(tenant_id, doc_type, sequence_name, prefix, start_value)
      VALUES (_tenant_id, _doc_type, v_seq_name, v_prefix, v_start);
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO v_reg FROM public.tenant_number_sequences
       WHERE tenant_id=_tenant_id AND doc_type=_doc_type;
      v_seq_name := v_reg.sequence_name; v_prefix := v_reg.prefix; v_start := v_reg.start_value;
    END;

    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I START %s MINVALUE %s CACHE 50',
                   v_seq_name, v_start, v_start);
  ELSE
    v_seq_name := v_reg.sequence_name; v_prefix := v_reg.prefix;
  END IF;

  EXECUTE format('SELECT nextval(%L)', 'public.'||v_seq_name) INTO v_next;
  RETURN v_prefix || '-' || v_next::text;
END $$;

-- =====================================================================
-- pos_checkout — SERVER-AUTHORITATIVE VAT
--   Client values for vat/tax are IGNORED. Server resolves vat_rate per
--   product and computes vat_amount, taxable_amount, line_total.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.pos_checkout(
  _tenant_id uuid, _customer_id uuid, _cashier_id uuid, _invoice_no text,
  _discount numeric DEFAULT 0, _notes text DEFAULT NULL, _client_op_id uuid DEFAULT NULL,
  _items jsonb DEFAULT '[]'::jsonb, _payments jsonb DEFAULT '[]'::jsonb,
  _register_id uuid DEFAULT NULL, _warehouse_id uuid DEFAULT NULL
) RETURNS sales LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  v_sale public.sales; v_existing public.sales; v_item jsonb; v_pay jsonb;
  v_product_id uuid; v_requested_qty numeric; v_need_qty numeric;
  v_unit_price numeric; v_line_disc_total numeric;
  v_allow_override boolean; v_override_cost numeric; v_override_qty numeric;
  v_batch record; v_take numeric;
  v_subtotal numeric := 0; v_vat_total numeric := 0; v_disc_total numeric := 0;
  v_total numeric := 0; v_paid numeric := 0;
  v_method text; v_pay_count int := 0; v_first_method text;
  v_status sale_status; v_reg public.cash_registers; v_attempt int;
  v_tenant_allow_override boolean; v_has_any_batch boolean;
  v_vat_rate numeric; v_vat_method text; v_vat_source text;
  v_line_gross numeric; v_line_taxable numeric; v_line_vat_amt numeric; v_line_total numeric;
  v_take_disc numeric; v_take_taxable numeric; v_take_vat numeric; v_take_total numeric;
  v_new_item_id uuid;
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
    RAISE EXCEPTION 'register_required: open a cash register before completing a sale' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_reg FROM public.cash_registers
    WHERE id = _register_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'register not found' USING ERRCODE='23503'; END IF;
  IF v_reg.status <> 'open' THEN RAISE EXCEPTION 'register is closed' USING ERRCODE='22023'; END IF;
  IF v_reg.user_id <> auth.uid() AND NOT public.is_tenant_manager_or_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'register_ownership: cannot transact on another cashier register' USING ERRCODE='42501';
  END IF;

  SELECT COALESCE(allow_stock_override,false) INTO v_tenant_allow_override
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
    v_product_id   := (v_item->>'product_id')::uuid;
    v_requested_qty:= (v_item->>'qty')::numeric;
    v_need_qty     := v_requested_qty;
    v_unit_price   := (v_item->>'unit_price')::numeric;
    v_line_disc_total := COALESCE((v_item->>'discount')::numeric, 0);
    v_allow_override := COALESCE((v_item->>'allow_stock_override')::boolean,false);

    IF v_need_qty IS NULL OR v_need_qty <= 0 THEN
      RAISE EXCEPTION 'invalid qty for product %', v_product_id USING ERRCODE='22023';
    END IF;
    IF v_unit_price IS NULL OR v_unit_price < 0 THEN
      RAISE EXCEPTION 'invalid unit_price for product %', v_product_id USING ERRCODE='22023';
    END IF;

    -- SERVER-AUTHORITATIVE VAT (client vat is ignored)
    SELECT r.vat_rate, r.vat_method, r.vat_source
      INTO v_vat_rate, v_vat_method, v_vat_source
      FROM public.resolve_product_vat(_tenant_id, v_product_id) r;

    v_line_gross := ROUND(v_requested_qty * v_unit_price - v_line_disc_total, 4);
    IF v_line_gross < 0 THEN
      RAISE EXCEPTION 'line discount exceeds line value for product %', v_product_id USING ERRCODE='22023';
    END IF;
    IF v_vat_method = 'inclusive' AND v_vat_rate > 0 THEN
      v_line_taxable := ROUND(v_line_gross / (1 + v_vat_rate/100), 4);
      v_line_vat_amt := ROUND(v_line_gross - v_line_taxable, 4);
      v_line_total   := ROUND(v_line_gross, 2);
    ELSE
      v_line_taxable := v_line_gross;
      v_line_vat_amt := ROUND(v_line_gross * v_vat_rate/100, 4);
      v_line_total   := ROUND(v_line_gross + v_line_vat_amt, 2);
    END IF;

    -- Allocate from batches (FEFO)
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
      v_take_disc    := ROUND(v_line_disc_total * v_take / v_requested_qty, 4);
      v_take_taxable := ROUND(v_line_taxable    * v_take / v_requested_qty, 4);
      v_take_vat     := ROUND(v_line_vat_amt    * v_take / v_requested_qty, 4);
      v_take_total   := ROUND(v_line_total      * v_take / v_requested_qty, 2);

      UPDATE public.batches SET qty_on_hand = qty_on_hand - v_take WHERE id = v_batch.id;
      INSERT INTO public.sale_items(
        tenant_id, sale_id, product_id, batch_id, warehouse_id,
        qty, unit_price, unit_cost, discount, vat, vat_rate, vat_method, taxable_amount, line_total
      ) VALUES (
        _tenant_id, v_sale.id, v_product_id, v_batch.id, _warehouse_id,
        v_take, v_unit_price, v_batch.purchase_price,
        v_take_disc, v_take_vat, v_vat_rate, v_vat_method, v_take_taxable, v_take_total
      ) RETURNING id INTO v_new_item_id;

      INSERT INTO public.sale_tax_audit(
        tenant_id, sale_id, sale_item_id, product_id,
        vat_rate, vat_method, taxable_amount, vat_amount, direction, source
      ) VALUES (
        _tenant_id, v_sale.id, v_new_item_id, v_product_id,
        v_vat_rate, v_vat_method, v_take_taxable, v_take_vat, 'sale', v_vat_source
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
                       WHERE tenant_id=_tenant_id AND product_id=v_product_id
                         AND (_warehouse_id IS NULL OR warehouse_id=_warehouse_id))
          INTO v_has_any_batch;
        IF NOT v_has_any_batch THEN
          RAISE EXCEPTION 'Opening stock not initialized for product %', v_product_id USING ERRCODE='23514';
        ELSE
          RAISE EXCEPTION 'insufficient stock for product %: short by %', v_product_id, v_need_qty USING ERRCODE='23514';
        END IF;
      END IF;
      v_override_qty := v_need_qty;
      SELECT COALESCE(p.purchase_price,0) INTO v_override_cost
        FROM public.products p WHERE p.id=v_product_id AND p.tenant_id=_tenant_id;

      v_take_disc    := ROUND(v_line_disc_total * v_need_qty / v_requested_qty, 4);
      v_take_taxable := ROUND(v_line_taxable    * v_need_qty / v_requested_qty, 4);
      v_take_vat     := ROUND(v_line_vat_amt    * v_need_qty / v_requested_qty, 4);
      v_take_total   := ROUND(v_line_total      * v_need_qty / v_requested_qty, 2);

      INSERT INTO public.sale_items(
        tenant_id, sale_id, product_id, batch_id, warehouse_id,
        qty, unit_price, unit_cost, discount, vat, vat_rate, vat_method, taxable_amount, line_total
      ) VALUES (
        _tenant_id, v_sale.id, v_product_id, NULL, _warehouse_id,
        v_need_qty, v_unit_price, COALESCE(v_override_cost,0),
        v_take_disc, v_take_vat, v_vat_rate, v_vat_method, v_take_taxable, v_take_total
      ) RETURNING id INTO v_new_item_id;

      INSERT INTO public.sale_tax_audit(
        tenant_id, sale_id, sale_item_id, product_id,
        vat_rate, vat_method, taxable_amount, vat_amount, direction, source
      ) VALUES (
        _tenant_id, v_sale.id, v_new_item_id, v_product_id,
        v_vat_rate, v_vat_method, v_take_taxable, v_take_vat, 'sale', v_vat_source
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
        _tenant_id,'stock_override_used','sales', v_sale.id, NULL,
        jsonb_build_object('user_id',_cashier_id,'product_id',v_product_id,
          'qty',v_override_qty,'invoice_no',v_sale.invoice_no));
      v_need_qty := 0;
    END IF;

    v_subtotal   := v_subtotal   + v_line_taxable;
    v_disc_total := v_disc_total + v_line_disc_total;
    v_vat_total  := v_vat_total  + v_line_vat_amt;
  END LOOP;

  v_total := ROUND(v_subtotal - COALESCE(_discount,0) + v_vat_total, 2);
  IF v_total < 0 THEN
    RAISE EXCEPTION 'invoice total cannot be negative' USING ERRCODE='22023';
  END IF;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(_payments) LOOP
    v_method := v_pay->>'method';
    IF v_pay_count = 0 THEN v_first_method := v_method; END IF;
    v_pay_count := v_pay_count + 1;
    IF v_method='due' OR (v_pay->>'amount')::numeric = 0 THEN CONTINUE; END IF;
    INSERT INTO public.sale_payments(
      tenant_id, sale_id, method, amount, reference, mobile_no, created_by
    ) VALUES (
      _tenant_id, v_sale.id, v_method::payment_method,
      (v_pay->>'amount')::numeric, v_pay->>'reference', v_pay->>'mobile_no', _cashier_id
    );
    v_paid := v_paid + (v_pay->>'amount')::numeric;
    INSERT INTO public.cash_register_transactions(
      tenant_id, register_id, transaction_type, amount,
      payment_method, notes, reference_table, reference_id, reference_no, created_by
    ) VALUES (
      _tenant_id, _register_id, 'sale', (v_pay->>'amount')::numeric,
      v_method, 'Sale '||v_sale.invoice_no,'sales', v_sale.id, v_sale.invoice_no, _cashier_id
    );
  END LOOP;

  IF v_paid > v_total + 0.001 THEN
    RAISE EXCEPTION 'payments (%) exceed invoice total (%)', v_paid, v_total USING ERRCODE='22023';
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
     SET subtotal=v_subtotal, discount=v_disc_total + COALESCE(_discount,0),
         vat=v_vat_total, total=v_total, paid=v_paid,
         due=GREATEST(v_total - v_paid, 0),
         payment_method=CASE WHEN v_pay_count>1 THEN 'split' ELSE COALESCE(v_first_method,'cash') END,
         status=v_status
   WHERE id=v_sale.id RETURNING * INTO v_sale;

  PERFORM public.audit_log_event(
    _tenant_id,'pos.sale_created','sales', v_sale.id, NULL,
    jsonb_build_object('invoice_no',v_sale.invoice_no,'total',v_total,
      'paid',v_paid,'due',v_sale.due,'status',v_status,'vat_total',v_vat_total));
  RETURN v_sale;
END $$;

-- =====================================================================
-- pos_return — proportional VAT reversal + audit
-- (Existing journal triggers handle DR VAT Payable / CR refund leg.)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.pos_return(
  _tenant_id uuid, _sale_id uuid, _items jsonb DEFAULT '[]'::jsonb,
  _reason text DEFAULT NULL, _refund_method text DEFAULT 'cash',
  _refund_amount numeric DEFAULT NULL, _notes text DEFAULT NULL,
  _register_id uuid DEFAULT NULL, _client_op_id uuid DEFAULT NULL
) RETURNS sales_returns LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  v_sale public.sales; v_ret public.sales_returns; v_existing public.sales_returns;
  v_item jsonb; v_si public.sale_items; v_qty numeric; v_avail numeric;
  v_subtotal numeric := 0; v_vat_total numeric := 0; v_total numeric := 0;
  v_refund numeric; v_method_pm public.payment_method;
  v_special text := NULL; v_return_no text;
  v_sold_total numeric := 0; v_returned_total numeric := 0;
  v_new_status public.sale_status; v_reg public.cash_registers;
  v_needs_register boolean;
  v_line_taxable numeric; v_line_vat numeric;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _client_op_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.sales_returns
     WHERE client_op_id=_client_op_id AND tenant_id=_tenant_id;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;
  SELECT * INTO v_sale FROM public.sales
   WHERE id=_sale_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE='23503'; END IF;
  IF v_sale.status NOT IN ('completed','partial','partially_returned') THEN
    RAISE EXCEPTION 'cannot return sale in status %', v_sale.status USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(_items)=0 THEN
    RAISE EXCEPTION 'no items to return' USING ERRCODE='22023';
  END IF;

  IF lower(COALESCE(_refund_method,'cash')) IN ('due','store_credit','adjustment') THEN
    v_special := lower(_refund_method);
    v_method_pm := 'other'::public.payment_method;
  ELSE
    v_method_pm := lower(COALESCE(_refund_method,'cash'))::public.payment_method;
  END IF;
  v_needs_register := v_special IS NULL;

  v_return_no := public.generate_next_number(_tenant_id,'return');

  INSERT INTO public.sales_returns(
    tenant_id, return_no, sale_id, customer_id, return_date, reason,
    subtotal, vat, total, refund_method, refunded_amount, notes, created_by, client_op_id
  ) VALUES (
    _tenant_id, v_return_no, _sale_id, v_sale.customer_id, CURRENT_DATE, _reason,
    0,0,0, v_method_pm, 0,
    COALESCE(_notes,'') || CASE WHEN v_special IS NOT NULL THEN ' [refund='||v_special||']' ELSE '' END,
    auth.uid(), _client_op_id
  ) RETURNING * INTO v_ret;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO v_si FROM public.sale_items
     WHERE id=(v_item->>'sale_item_id')::uuid
       AND sale_id=_sale_id AND tenant_id=_tenant_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sale_item % not found', v_item->>'sale_item_id' USING ERRCODE='23503';
    END IF;
    v_qty := (v_item->>'qty')::numeric;
    IF v_qty IS NULL OR v_qty<=0 THEN RAISE EXCEPTION 'return qty must be > 0' USING ERRCODE='22023'; END IF;
    v_avail := v_si.qty - COALESCE(v_si.returned_qty,0);
    IF v_qty>v_avail THEN
      RAISE EXCEPTION 'cannot return % of product % — only % available',
        v_qty, v_si.product_id, v_avail USING ERRCODE='23514';
    END IF;

    IF v_si.batch_id IS NOT NULL THEN
      UPDATE public.batches SET qty_on_hand=qty_on_hand+v_qty WHERE id=v_si.batch_id;
      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, warehouse_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id, notes
      ) SELECT _tenant_id, v_si.product_id, v_si.batch_id, b.warehouse_id, 'sales_return',
               v_qty, b.qty_on_hand,'sales_returns', v_ret.id, v_return_no, auth.uid(), _reason
        FROM public.batches b WHERE b.id=v_si.batch_id;
    ELSE
      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, warehouse_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id, notes
      ) VALUES (
        _tenant_id, v_si.product_id, NULL, v_si.warehouse_id,'adjustment', v_qty,
        NULL,'sales_returns', v_ret.id, v_return_no, auth.uid(),
        COALESCE(_reason,'') || ' [override-recovery: quarantine]'
      );
    END IF;

    UPDATE public.sale_items SET returned_qty=COALESCE(returned_qty,0)+v_qty WHERE id=v_si.id;

    -- Proportional reversal from PERSISTED server values (no client trust)
    v_line_taxable := ROUND(COALESCE(v_si.taxable_amount, v_si.unit_price*v_si.qty - COALESCE(v_si.discount,0))
                            * v_qty / NULLIF(v_si.qty,0), 4);
    v_line_vat     := ROUND(COALESCE(v_si.vat,0) * v_qty / NULLIF(v_si.qty,0), 4);

    INSERT INTO public.sale_return_items(
      tenant_id, return_id, sale_item_id, product_id, batch_id,
      qty, unit_price, line_total, reason
    ) VALUES (
      _tenant_id, v_ret.id, v_si.id, v_si.product_id, v_si.batch_id,
      v_qty, v_si.unit_price, v_line_taxable + v_line_vat, _reason
    );

    -- Audit: negative VAT row (reversal)
    INSERT INTO public.sale_tax_audit(
      tenant_id, sale_id, return_id, sale_item_id, product_id,
      vat_rate, vat_method, taxable_amount, vat_amount, direction, source
    ) VALUES (
      _tenant_id, _sale_id, v_ret.id, v_si.id, v_si.product_id,
      COALESCE(v_si.vat_rate,0), COALESCE(v_si.vat_method,'exclusive'),
      -v_line_taxable, -v_line_vat, 'return', 'product'
    );

    v_subtotal := v_subtotal + v_line_taxable;
    v_vat_total:= v_vat_total + v_line_vat;
  END LOOP;

  v_total := v_subtotal + v_vat_total;
  v_refund := COALESCE(_refund_amount, v_total);
  IF v_refund<0 THEN RAISE EXCEPTION 'refund_amount cannot be negative' USING ERRCODE='22023'; END IF;

  UPDATE public.sales_returns
     SET subtotal=v_subtotal, vat=v_vat_total, total=v_total, refunded_amount=v_refund
   WHERE id=v_ret.id RETURNING * INTO v_ret;

  IF v_sale.customer_id IS NOT NULL AND v_refund>0
     AND v_special IN ('due','store_credit','adjustment') THEN
    PERFORM public.post_ledger_entry(
      _tenant_id,'customer'::public.party_type, v_sale.customer_id,
      'sales_return'::public.ledger_entry_type,
      0, v_refund,'sales_returns', v_ret.id, v_return_no,
      'Return '||v_return_no||COALESCE(' — '||_reason,''));
  END IF;

  IF v_refund>0 AND v_needs_register THEN
    IF _register_id IS NOT NULL THEN
      SELECT * INTO v_reg FROM public.cash_registers
       WHERE id=_register_id AND tenant_id=_tenant_id;
    ELSE
      SELECT * INTO v_reg FROM public.cash_registers
       WHERE tenant_id=_tenant_id AND user_id=auth.uid() AND status='open'
       ORDER BY opened_at DESC LIMIT 1;
    END IF;
    IF v_reg.id IS NULL OR v_reg.status<>'open' THEN
      RAISE EXCEPTION 'register_required: cash refund needs an open register' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.cash_register_transactions(
      tenant_id, register_id, transaction_type, amount,
      payment_method, notes, reference_table, reference_id, reference_no, created_by
    ) VALUES (
      _tenant_id, v_reg.id,'sale_refund'::public.cash_txn_type, v_refund,
      v_method_pm::text,
      'Refund for return '||v_return_no||COALESCE(' — '||_reason,''),
      'sales_returns', v_ret.id, v_return_no, auth.uid()
    );
  END IF;

  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(returned_qty),0)
    INTO v_sold_total, v_returned_total
    FROM public.sale_items WHERE sale_id=_sale_id AND tenant_id=_tenant_id;
  IF v_returned_total>=v_sold_total THEN v_new_status:='returned';
  ELSIF v_returned_total>0 THEN v_new_status:='partially_returned';
  ELSE v_new_status:=v_sale.status; END IF;
  UPDATE public.sales SET status=v_new_status WHERE id=_sale_id;

  PERFORM public.audit_log_event(
    _tenant_id,
    CASE WHEN v_new_status='returned' THEN 'sale_return.full' ELSE 'sale_return.partial' END,
    'sales_returns', v_ret.id, NULL,
    jsonb_build_object('return_no',v_return_no,'sale_id',_sale_id,
      'total',v_total,'refund',v_refund,'vat_total',v_vat_total));
  RETURN v_ret;
END $$;
