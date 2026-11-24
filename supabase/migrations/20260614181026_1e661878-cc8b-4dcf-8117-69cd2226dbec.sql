
-- ============== UNIFIED ADJUST FUNCTION ==============
CREATE OR REPLACE FUNCTION public.inventory_adjust(
  _tenant_id     uuid,
  _product_id    uuid,
  _batch_id      uuid,
  _qty_change    numeric,            -- +ve = stock in, -ve = stock out
  _movement_type movement_type,
  _reason        text DEFAULT NULL,
  _reference_no  text DEFAULT NULL
) RETURNS public.stock_movements
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_batch  public.batches;
  v_after  numeric;
  v_mv     public.stock_movements;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _qty_change = 0 THEN
    RAISE EXCEPTION 'qty_change cannot be zero' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_batch FROM public.batches
   WHERE id = _batch_id AND tenant_id = _tenant_id AND product_id = _product_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch % not found for product %', _batch_id, _product_id
      USING ERRCODE = '23503';
  END IF;

  v_after := v_batch.qty_on_hand + _qty_change;
  IF v_after < 0 THEN
    RAISE EXCEPTION 'stock would go negative (have %, change %)',
      v_batch.qty_on_hand, _qty_change USING ERRCODE = '23514';
  END IF;

  UPDATE public.batches SET qty_on_hand = v_after WHERE id = _batch_id;

  INSERT INTO public.stock_movements(
    tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
    reference_table, reference_no, user_id, notes
  )
  VALUES (
    _tenant_id, _product_id, _batch_id, _movement_type, _qty_change, v_after,
    'manual', _reference_no, auth.uid(), _reason
  )
  RETURNING * INTO v_mv;

  RETURN v_mv;
END $$;

REVOKE ALL ON FUNCTION public.inventory_adjust(uuid,uuid,uuid,numeric,movement_type,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_adjust(uuid,uuid,uuid,numeric,movement_type,text,text)
  TO authenticated, service_role;

-- ============== PHYSICAL COUNT ==============
CREATE OR REPLACE FUNCTION public.inventory_physical_count(
  _tenant_id   uuid,
  _product_id  uuid,
  _batch_id    uuid,
  _counted_qty numeric,
  _reason      text DEFAULT 'physical count'
) RETURNS public.stock_movements
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_current numeric;
  v_delta   numeric;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _counted_qty < 0 THEN
    RAISE EXCEPTION 'counted qty must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT qty_on_hand INTO v_current FROM public.batches
   WHERE id = _batch_id AND tenant_id = _tenant_id AND product_id = _product_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch not found' USING ERRCODE = '23503';
  END IF;

  v_delta := _counted_qty - v_current;
  IF v_delta = 0 THEN RETURN NULL; END IF;

  RETURN public.inventory_adjust(
    _tenant_id, _product_id, _batch_id, v_delta, 'adjustment', _reason, NULL
  );
END $$;

REVOKE ALL ON FUNCTION public.inventory_physical_count(uuid,uuid,uuid,numeric,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_physical_count(uuid,uuid,uuid,numeric,text)
  TO authenticated, service_role;

-- ============== AUTO-EXPIRE ==============
CREATE OR REPLACE FUNCTION public.inventory_expire_batches(_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT id, product_id, qty_on_hand FROM public.batches
     WHERE tenant_id = _tenant_id
       AND expiry_date < CURRENT_DATE
       AND qty_on_hand > 0
     FOR UPDATE
  LOOP
    PERFORM public.inventory_adjust(
      _tenant_id, r.product_id, r.id, -r.qty_on_hand, 'expiry',
      'auto-expired on ' || CURRENT_DATE::text, NULL
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.inventory_expire_batches(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_expire_batches(uuid) TO authenticated, service_role;

-- ============== REPORT VIEWS (RLS enforced by underlying tables) ==============

CREATE OR REPLACE VIEW public.v_stock_on_hand AS
SELECT
  b.tenant_id,
  b.product_id,
  p.sku,
  p.name             AS product_name,
  b.id               AS batch_id,
  b.batch_no,
  b.expiry_date,
  b.qty_on_hand,
  b.purchase_price,
  ROUND(b.qty_on_hand * b.purchase_price, 2) AS stock_value
FROM public.batches b
JOIN public.products p ON p.id = b.product_id
WHERE p.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.v_expiry_alert AS
SELECT
  b.tenant_id, b.product_id, p.name AS product_name,
  b.id AS batch_id, b.batch_no, b.expiry_date, b.qty_on_hand,
  (b.expiry_date - CURRENT_DATE) AS days_to_expiry,
  CASE
    WHEN b.expiry_date < CURRENT_DATE THEN 'expired'
    WHEN b.expiry_date <= CURRENT_DATE + 30 THEN '0-30'
    WHEN b.expiry_date <= CURRENT_DATE + 60 THEN '31-60'
    WHEN b.expiry_date <= CURRENT_DATE + 90 THEN '61-90'
    ELSE 'ok'
  END AS bucket
FROM public.batches b
JOIN public.products p ON p.id = b.product_id
WHERE b.qty_on_hand > 0
  AND p.deleted_at IS NULL
  AND b.expiry_date <= CURRENT_DATE + 90;

CREATE OR REPLACE VIEW public.v_low_stock AS
SELECT
  p.tenant_id, p.id AS product_id, p.sku, p.name AS product_name,
  p.reorder_level,
  COALESCE(SUM(b.qty_on_hand) FILTER (WHERE b.expiry_date >= CURRENT_DATE), 0) AS qty_available
FROM public.products p
LEFT JOIN public.batches b ON b.product_id = p.id AND b.tenant_id = p.tenant_id
WHERE p.deleted_at IS NULL AND p.is_active
GROUP BY p.tenant_id, p.id, p.sku, p.name, p.reorder_level
HAVING COALESCE(SUM(b.qty_on_hand) FILTER (WHERE b.expiry_date >= CURRENT_DATE), 0) <= p.reorder_level;

CREATE OR REPLACE VIEW public.v_stock_valuation AS
SELECT
  p.tenant_id, p.id AS product_id, p.sku, p.name AS product_name,
  COALESCE(SUM(b.qty_on_hand), 0)                                AS qty_on_hand,
  COALESCE(SUM(b.qty_on_hand * b.purchase_price), 0)::numeric(14,2) AS stock_value
FROM public.products p
LEFT JOIN public.batches b ON b.product_id = p.id AND b.tenant_id = p.tenant_id
WHERE p.deleted_at IS NULL
GROUP BY p.tenant_id, p.id, p.sku, p.name;

GRANT SELECT ON public.v_stock_on_hand, public.v_expiry_alert,
                public.v_low_stock,    public.v_stock_valuation
  TO authenticated, service_role;
