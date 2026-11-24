
-- =========================================================================
-- PHASE 11.5C — OPENING STOCK WIZARD + POS GUARD
-- =========================================================================

-- 1. Tenant-level POS override flag
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS allow_stock_override boolean NOT NULL DEFAULT false;

-- 2. Extend batches for opening stock metadata
ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS is_opening   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mrp          numeric,
  ADD COLUMN IF NOT EXISTS supplier_id  uuid REFERENCES public.suppliers(id),
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id),
  ADD COLUMN IF NOT EXISTS source       text;  -- 'opening_stock' | 'grn' | 'adjustment' | 'import'

-- One opening-stock batch per product per tenant (enforces "once only")
CREATE UNIQUE INDEX IF NOT EXISTS batches_one_opening_per_product
  ON public.batches(tenant_id, product_id)
  WHERE is_opening = true AND (deleted_at IS NULL);

-- 3. Admin helper: toggle POS stock override allowance
CREATE OR REPLACE FUNCTION public.set_stock_override_allowed(
  _tenant_id uuid,
  _allowed   boolean
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner')) THEN
    RAISE EXCEPTION 'admin role required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tenants SET allow_stock_override = _allowed WHERE id = _tenant_id;
  PERFORM public.audit_log_event(_tenant_id, 'tenant.stock_override_toggle',
    'tenants', _tenant_id, NULL,
    jsonb_build_object('allowed', _allowed, 'by', auth.uid()));
  RETURN _allowed;
END $$;

-- 4. commit_opening_stock — wizard backend
-- Accepts an array of items, each:
--   { product_id, qty, unit_cost, mrp, batch_no, mfg_date, expiry_date,
--     supplier_id?, warehouse_id?, branch_id? }
-- Returns: jsonb { batch_ids, journal_ids, total_qty, total_value, count }
CREATE OR REPLACE FUNCTION public.commit_opening_stock(
  _tenant_id uuid,
  _items     jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item        jsonb;
  v_product_id  uuid;
  v_qty         numeric;
  v_cost        numeric;
  v_mrp         numeric;
  v_batch_no    text;
  v_mfg         date;
  v_expiry      date;
  v_supplier    uuid;
  v_warehouse   uuid;
  v_branch      uuid;
  v_batch_id    uuid;
  v_journal_id  uuid;
  v_batch_ids   uuid[] := ARRAY[]::uuid[];
  v_journal_ids uuid[] := ARRAY[]::uuid[];
  v_total_qty   numeric := 0;
  v_total_val   numeric := 0;
  v_count       int := 0;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'no items provided' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := COALESCE((v_item->>'qty')::numeric, 0);
    v_cost       := COALESCE((v_item->>'unit_cost')::numeric, 0);
    v_mrp        := NULLIF(v_item->>'mrp','')::numeric;
    v_batch_no   := NULLIF(v_item->>'batch_no','');
    v_mfg        := NULLIF(v_item->>'mfg_date','')::date;
    v_expiry     := NULLIF(v_item->>'expiry_date','')::date;
    v_supplier   := NULLIF(v_item->>'supplier_id','')::uuid;
    v_warehouse  := NULLIF(v_item->>'warehouse_id','')::uuid;
    v_branch     := NULLIF(v_item->>'branch_id','')::uuid;

    -- Validation
    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'product_id required' USING ERRCODE = '22023';
    END IF;
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'qty must be > 0 for product %', v_product_id USING ERRCODE = '22023';
    END IF;
    IF v_cost < 0 THEN
      RAISE EXCEPTION 'cost must be >= 0 for product %', v_product_id USING ERRCODE = '22023';
    END IF;
    IF v_batch_no IS NULL OR length(v_batch_no) = 0 THEN
      RAISE EXCEPTION 'batch_no required for product %', v_product_id USING ERRCODE = '22023';
    END IF;
    IF v_expiry IS NULL THEN
      RAISE EXCEPTION 'expiry_date required for product %', v_product_id USING ERRCODE = '22023';
    END IF;

    -- Verify product belongs to tenant
    IF NOT EXISTS (SELECT 1 FROM public.products
                    WHERE id = v_product_id AND tenant_id = _tenant_id) THEN
      RAISE EXCEPTION 'product % not in tenant', v_product_id USING ERRCODE = '23503';
    END IF;

    -- Once-only guard (the unique index also enforces this, but error here is friendlier)
    IF EXISTS (SELECT 1 FROM public.batches
                WHERE tenant_id = _tenant_id AND product_id = v_product_id
                  AND is_opening = true AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'opening stock already exists for product %', v_product_id
        USING ERRCODE = '23505';
    END IF;

    -- Insert batch
    INSERT INTO public.batches(
      tenant_id, branch_id, product_id, batch_no, mfg_date, expiry_date,
      purchase_price, qty_on_hand, status, is_opening, mrp,
      supplier_id, warehouse_id, source, created_by
    ) VALUES (
      _tenant_id, v_branch, v_product_id, v_batch_no, v_mfg, v_expiry,
      v_cost, v_qty, 'active', true, v_mrp,
      v_supplier, v_warehouse, 'opening_stock', auth.uid()
    ) RETURNING id INTO v_batch_id;

    -- Stock movement (opening)
    INSERT INTO public.stock_movements(
      tenant_id, product_id, batch_id, movement_type, qty_change,
      qty_after, reference_table, reference_id, reference_no, user_id, notes
    ) VALUES (
      _tenant_id, v_product_id, v_batch_id, 'opening', v_qty,
      v_qty, 'batches', v_batch_id, v_batch_no, auth.uid(),
      'Opening stock initialization'
    );

    -- Journal entry (DR 1200 Inventory / CR 3100 Opening Stock Equity)
    v_journal_id := public.post_opening_stock_journal(_tenant_id, v_batch_id);

    -- Audit log
    PERFORM public.audit_log_event(_tenant_id, 'opening_stock.created',
      'batches', v_batch_id, NULL,
      jsonb_build_object(
        'product_id', v_product_id, 'qty', v_qty, 'cost', v_cost,
        'value', v_qty * v_cost, 'batch_no', v_batch_no,
        'journal_id', v_journal_id));

    v_batch_ids   := array_append(v_batch_ids, v_batch_id);
    IF v_journal_id IS NOT NULL THEN
      v_journal_ids := array_append(v_journal_ids, v_journal_id);
    END IF;
    v_total_qty := v_total_qty + v_qty;
    v_total_val := v_total_val + (v_qty * v_cost);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_ids',   to_jsonb(v_batch_ids),
    'journal_ids', to_jsonb(v_journal_ids),
    'total_qty',   v_total_qty,
    'total_value', v_total_val,
    'count',       v_count
  );
END $$;

-- 5. Patch pos_checkout — respect tenants.allow_stock_override
-- Replace the override branch to check tenant flag.
CREATE OR REPLACE FUNCTION public.pos_checkout(
  _tenant_id uuid, _customer_id uuid, _cashier_id uuid, _invoice_no text,
  _discount numeric DEFAULT 0, _notes text DEFAULT NULL::text,
  _client_op_id uuid DEFAULT NULL::uuid,
  _items jsonb DEFAULT '[]'::jsonb,
  _payments jsonb DEFAULT '[]'::jsonb,
  _register_id uuid DEFAULT NULL::uuid
) RETURNS sales
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
        tenant_id, invoice_no, customer_id, cashier_id,
        subtotal, discount, vat, total, paid, due,
        payment_method, status, notes, client_op_id
      ) VALUES (
        _tenant_id,
        COALESCE(NULLIF(_invoice_no,''), public.next_invoice_no(_tenant_id)),
        _customer_id, _cashier_id,
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
        v_batch.qty_on_hand - v_take, 'sales', v_sale.id, v_sale.invoice_no, _cashier_id
      );

      v_need_qty := v_need_qty - v_take;
    END LOOP;

    IF v_need_qty > 0 THEN
      -- POS GUARD: refuse override unless BOTH tenant flag AND line flag say yes
      IF NOT (v_tenant_allow_override AND v_allow_override) THEN
        SELECT EXISTS(SELECT 1 FROM public.batches
                       WHERE tenant_id = _tenant_id AND product_id = v_product_id)
          INTO v_has_any_batch;
        IF NOT v_has_any_batch THEN
          RAISE EXCEPTION 'Opening stock not initialized for product %. Please initialize via Opening Stock Wizard.',
            v_product_id USING ERRCODE = '23514';
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
        NULL, 'sales', v_sale.id, v_sale.invoice_no, _cashier_id,
        'Stock override: sold without available batch stock'
      );

      PERFORM public.audit_log_event(
        _tenant_id, 'stock_override_used', 'sales', v_sale.id, NULL,
        jsonb_build_object(
          'user_id', _cashier_id, 'product_id', v_product_id,
          'qty', v_override_qty, 'invoice_no', v_sale.invoice_no,
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
      'paid', v_paid, 'due', v_sale.due, 'status', v_status, 'register_id', _register_id));

  RETURN v_sale;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.commit_opening_stock(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_stock_override_allowed(uuid, boolean) TO authenticated;
