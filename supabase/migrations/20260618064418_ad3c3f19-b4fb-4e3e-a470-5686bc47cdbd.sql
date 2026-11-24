
-- =========================================================================
-- POS Batch 3A: Server integrity hardening
-- =========================================================================

-- ---------- 1. search_products RPC (safe parameterised search) -----------
CREATE OR REPLACE FUNCTION public.search_products(
  _tenant_id uuid,
  _query     text,
  _branch_id uuid DEFAULT NULL,
  _limit     int  DEFAULT 20
) RETURNS TABLE (
  id              uuid,
  name            text,
  sku             text,
  barcode         text,
  retail_price    numeric,
  purchase_price  numeric,
  vat_rate        numeric,
  qty_on_hand     numeric,
  nearest_expiry  date
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text;
  v_like text;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  v_q := COALESCE(trim(_query), '');
  -- escape LIKE wildcards in user input
  v_like := '%' || replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_') || '%';

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.name, p.sku, p.barcode, p.retail_price, p.purchase_price, p.vat_rate
      FROM public.products p
     WHERE p.tenant_id = _tenant_id
       AND p.is_active = true
       AND p.deleted_at IS NULL
       AND (
         v_q = '' OR
         p.name    ILIKE v_like ESCAPE '\' OR
         p.sku     ILIKE v_like ESCAPE '\' OR
         p.barcode ILIKE v_like ESCAPE '\'
       )
     ORDER BY
       (p.barcode = v_q) DESC,
       (p.sku = v_q) DESC,
       p.name ASC
     LIMIT GREATEST(1, LEAST(COALESCE(_limit, 20), 100))
  ),
  stock AS (
    SELECT b.product_id,
           SUM(b.qty_on_hand)::numeric AS qty_on_hand,
           MIN(b.expiry_date)          AS nearest_expiry
      FROM public.batches b
     WHERE b.tenant_id = _tenant_id
       AND b.qty_on_hand > 0
       AND b.product_id IN (SELECT id FROM base)
     GROUP BY b.product_id
  )
  SELECT b.id, b.name, b.sku, b.barcode, b.retail_price, b.purchase_price, b.vat_rate,
         COALESCE(s.qty_on_hand, 0) AS qty_on_hand,
         s.nearest_expiry
    FROM base b
    LEFT JOIN stock s ON s.product_id = b.id;
END $$;

GRANT EXECUTE ON FUNCTION public.search_products(uuid, text, uuid, int) TO authenticated;

-- ---------- 2. Server invoice-number generator ---------------------------
CREATE OR REPLACE FUNCTION public.next_invoice_no(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_seq    int;
  v_no     text;
BEGIN
  v_prefix := 'INV-' || to_char(now() AT TIME ZONE 'UTC', 'YYYYMM') || '-';
  -- Find highest existing sequence for this tenant + month, then +1
  SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_no, '^' || v_prefix, ''), '')::int), 0)
    INTO v_seq
    FROM public.sales
   WHERE tenant_id = _tenant_id
     AND invoice_no LIKE v_prefix || '%'
     AND invoice_no ~ ('^' || v_prefix || '[0-9]+$');
  v_seq := v_seq + 1;
  v_no := v_prefix || lpad(v_seq::text, 6, '0');
  RETURN v_no;
END $$;

-- ---------- 3. pos_checkout: server invoice + atomic cash-register --------
CREATE OR REPLACE FUNCTION public.pos_checkout(
  _tenant_id   uuid,
  _customer_id uuid,
  _cashier_id  uuid,
  _invoice_no  text,
  _discount    numeric DEFAULT 0,
  _notes       text DEFAULT NULL,
  _client_op_id uuid DEFAULT NULL,
  _items       jsonb DEFAULT '[]'::jsonb,
  _payments    jsonb DEFAULT '[]'::jsonb,
  _register_id uuid DEFAULT NULL
) RETURNS sales
LANGUAGE plpgsql
SET search_path = public
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

  -- Validate register up front (so failure doesn't leave a sale)
  IF _register_id IS NOT NULL THEN
    SELECT * INTO v_reg FROM public.cash_registers
      WHERE id = _register_id AND tenant_id = _tenant_id
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'register not found' USING ERRCODE='23503'; END IF;
    IF v_reg.status <> 'open' THEN RAISE EXCEPTION 'register is closed' USING ERRCODE='22023'; END IF;
  END IF;

  -- Generate invoice number server-side. Retry on unique-violation (concurrent terminals).
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
      -- Race on (tenant_id, invoice_no): try again with a fresh server-generated number.
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
          NULL, 'sales', v_sale.id, v_sale.invoice_no, _cashier_id,
          'Stock override: sold without available batch stock'
        );

        PERFORM public.audit_log_event(
          _tenant_id, 'stock_override_used', 'sales', v_sale.id, NULL,
          jsonb_build_object(
            'user_id',    _cashier_id,
            'product_id', v_product_id,
            'qty',        v_override_qty,
            'invoice_no', v_sale.invoice_no,
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

    -- ATOMIC cash-register entry: any failure aborts the whole sale
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

  PERFORM public.audit_log_event(
    _tenant_id, 'pos.sale_created', 'sales', v_sale.id, NULL,
    jsonb_build_object(
      'invoice_no', v_sale.invoice_no, 'total', v_total, 'paid', v_paid,
      'due', v_sale.due, 'status', v_status, 'register_id', _register_id
    )
  );

  RETURN v_sale;
END;
$function$;
