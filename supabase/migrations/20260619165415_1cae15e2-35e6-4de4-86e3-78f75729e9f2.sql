
-- 1. Columns
ALTER TABLE public.sales            ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
ALTER TABLE public.sale_items       ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);
ALTER TABLE public.stock_movements  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id);

CREATE INDEX IF NOT EXISTS sales_tenant_wh_created_idx
  ON public.sales (tenant_id, warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_tenant_wh_idx
  ON public.stock_movements (tenant_id, warehouse_id, created_at DESC);

-- 2. search_products: warehouse-aware (replaces existing definition)
DROP FUNCTION IF EXISTS public.search_products(uuid, text, uuid, integer);

CREATE OR REPLACE FUNCTION public.search_products(
  _tenant_id uuid,
  _query text,
  _branch_id uuid DEFAULT NULL,
  _limit integer DEFAULT 20,
  _warehouse_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, sku text, barcode text, retail_price numeric, purchase_price numeric, vat_rate numeric, qty_on_hand numeric, nearest_expiry date, strength text, medicine_type text, volume text, pack_size integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_q text; v_like text;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  v_q := COALESCE(trim(_query), '');
  v_like := '%' || replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_') || '%';

  RETURN QUERY
  WITH base AS (
    SELECT p.id AS product_id, p.name, p.sku, p.barcode, p.retail_price, p.purchase_price, p.vat_rate,
           p.strength, p.medicine_type, p.volume, p.pack_size
      FROM public.products p
     WHERE p.tenant_id = _tenant_id AND p.is_active = true AND p.deleted_at IS NULL
       AND (
         v_q = '' OR
         p.name ILIKE v_like ESCAPE '\' OR p.sku ILIKE v_like ESCAPE '\' OR p.barcode ILIKE v_like ESCAPE '\' OR
         (p.name||' '||COALESCE(p.strength,'')||' '||COALESCE(p.medicine_type,'')||' '||COALESCE(p.volume,'')) ILIKE v_like ESCAPE '\'
       )
     ORDER BY (p.barcode = v_q) DESC, (p.sku = v_q) DESC, p.name ASC
     LIMIT GREATEST(1, LEAST(COALESCE(_limit,20), 100))
  ),
  stock AS (
    SELECT b.product_id, SUM(b.qty_on_hand)::numeric AS qty_on_hand, MIN(b.expiry_date) AS nearest_expiry
      FROM public.batches b
     WHERE b.tenant_id = _tenant_id AND b.qty_on_hand > 0
       AND b.product_id IN (SELECT base.product_id FROM base)
       AND (_warehouse_id IS NULL OR b.warehouse_id = _warehouse_id)
     GROUP BY b.product_id
  )
  SELECT b.product_id AS id, b.name, b.sku, b.barcode, b.retail_price, b.purchase_price, b.vat_rate,
         COALESCE(s.qty_on_hand, 0) AS qty_on_hand, s.nearest_expiry,
         b.strength, b.medicine_type, b.volume, b.pack_size
    FROM base b LEFT JOIN stock s ON s.product_id = b.product_id;
END $$;
GRANT EXECUTE ON FUNCTION public.search_products(uuid,text,uuid,integer,uuid) TO authenticated;

-- 3. pos_checkout: drop old overloads then recreate with _warehouse_id
DROP FUNCTION IF EXISTS public.pos_checkout(uuid,uuid,uuid,text,numeric,text,uuid,jsonb,jsonb);
DROP FUNCTION IF EXISTS public.pos_checkout(uuid,uuid,uuid,text,numeric,text,uuid,jsonb,jsonb,uuid);

CREATE OR REPLACE FUNCTION public.pos_checkout(
  _tenant_id uuid,
  _customer_id uuid,
  _cashier_id uuid,
  _invoice_no text,
  _discount numeric DEFAULT 0,
  _notes text DEFAULT NULL,
  _client_op_id uuid DEFAULT NULL,
  _items jsonb DEFAULT '[]'::jsonb,
  _payments jsonb DEFAULT '[]'::jsonb,
  _register_id uuid DEFAULT NULL,
  _warehouse_id uuid DEFAULT NULL
) RETURNS public.sales
LANGUAGE plpgsql SET search_path = public
AS $$
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

    FOR v_batch IN
      SELECT id, expiry_date, qty_on_hand, purchase_price
        FROM public.batches
       WHERE tenant_id = _tenant_id
         AND product_id = v_product_id
         AND qty_on_hand > 0
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
$$;
GRANT EXECUTE ON FUNCTION public.pos_checkout(uuid,uuid,uuid,text,numeric,text,uuid,jsonb,jsonb,uuid,uuid) TO authenticated;

-- 4. warehouse_kpis: per-warehouse dashboard numbers
CREATE OR REPLACE FUNCTION public.warehouse_kpis(_tenant_id uuid, _warehouse_id uuid)
RETURNS TABLE(stock_value numeric, low_stock_count integer, out_of_stock_count integer, expiring_count integer, sales_today numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT SUM(b.qty_on_hand * COALESCE(b.purchase_price,0))
      FROM public.batches b WHERE b.tenant_id=_tenant_id AND b.warehouse_id=_warehouse_id
    ),0)::numeric AS stock_value,
    COALESCE((
      SELECT COUNT(DISTINCT b.product_id)::int FROM public.batches b
      JOIN public.products p ON p.id=b.product_id
      WHERE b.tenant_id=_tenant_id AND b.warehouse_id=_warehouse_id
        AND COALESCE(p.reorder_level,0) > 0 AND b.qty_on_hand <= p.reorder_level AND b.qty_on_hand > 0
    ),0) AS low_stock_count,
    COALESCE((
      SELECT COUNT(DISTINCT b.product_id)::int FROM public.batches b
      WHERE b.tenant_id=_tenant_id AND b.warehouse_id=_warehouse_id AND b.qty_on_hand <= 0
    ),0) AS out_of_stock_count,
    COALESCE((
      SELECT COUNT(*)::int FROM public.batches b
      WHERE b.tenant_id=_tenant_id AND b.warehouse_id=_warehouse_id
        AND b.qty_on_hand > 0 AND b.expiry_date IS NOT NULL
        AND b.expiry_date <= (CURRENT_DATE + INTERVAL '30 days')
    ),0) AS expiring_count,
    COALESCE((
      SELECT SUM(total) FROM public.sales
      WHERE tenant_id=_tenant_id AND warehouse_id=_warehouse_id
        AND created_at >= date_trunc('day', now())
    ),0)::numeric AS sales_today;
$$;
GRANT EXECUTE ON FUNCTION public.warehouse_kpis(uuid,uuid) TO authenticated;
