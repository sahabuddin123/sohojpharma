
-- 1) Trigger guard: block any sale_items insert that references an expired batch
CREATE OR REPLACE FUNCTION public.tg_block_expired_batch_sale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_expiry  date;
  v_batchno text;
  v_pname   text;
BEGIN
  IF NEW.batch_id IS NULL OR NEW.qty IS NULL OR NEW.qty <= 0 THEN
    RETURN NEW; -- allow stock-override / non-batch lines and refund corrections
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

DROP TRIGGER IF EXISTS trg_block_expired_batch_sale ON public.sale_items;
CREATE TRIGGER trg_block_expired_batch_sale
BEFORE INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.tg_block_expired_batch_sale();

-- 2) Update pos_checkout to filter expired batches (FEFO + expired-guard)
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

    SELECT name INTO v_product_name FROM public.products WHERE id = v_product_id AND tenant_id = _tenant_id;

    -- FEFO: earliest non-expired expiry first
    FOR v_batch IN
      SELECT id, batch_no, expiry_date, qty_on_hand, purchase_price
        FROM public.batches
       WHERE tenant_id = _tenant_id AND product_id = v_product_id
         AND qty_on_hand > 0
         AND expiry_date >= CURRENT_DATE
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
      -- Detect "only expired stock available" and raise a precise message
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

  -- Totals
  SELECT
    COALESCE(SUM(qty * unit_price), 0),
    COALESCE(SUM(discount), 0),
    COALESCE(SUM(vat), 0)
  INTO v_subtotal, v_disc_total, v_vat_total
  FROM public.sale_items WHERE sale_id = v_sale.id;

  v_disc_total := v_disc_total + COALESCE(_discount, 0);
  v_total := GREATEST(0, v_subtotal - v_disc_total + v_vat_total);

  -- Payments
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

-- 3) Cron-friendly cross-tenant expiry job (bypasses tenant auth, runs as definer)
CREATE OR REPLACE FUNCTION public.inventory_expire_batches_all()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT id, tenant_id, product_id, qty_on_hand FROM public.batches
     WHERE expiry_date < CURRENT_DATE AND qty_on_hand > 0
     FOR UPDATE
  LOOP
    UPDATE public.batches SET qty_on_hand = 0 WHERE id = r.id;
    INSERT INTO public.stock_movements(
      tenant_id, product_id, batch_id, movement_type, qty_change,
      qty_after, reference_table, reference_no, notes
    ) VALUES (
      r.tenant_id, r.product_id, r.id, 'expiry', -r.qty_on_hand,
      0, 'batches', 'auto-expiry', 'auto-expired on ' || CURRENT_DATE::text
    );
    n := n + 1;
  END LOOP;

  INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
  VALUES (NULL, NULL, 'expiry.job.executed', 'batches', NULL,
          jsonb_build_object('expired_batches', n, 'run_at', now()));

  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.inventory_expire_batches_all() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_expire_batches_all() TO service_role;

-- 4) Schedule daily 01:00 AM
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('inventory-expire-batches-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'inventory-expire-batches-daily',
  '0 1 * * *',
  $$ SELECT public.inventory_expire_batches_all(); $$
);
