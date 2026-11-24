
-- ============== GRN TABLES ==============
CREATE TABLE public.goods_receipts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  grn_no        text NOT NULL,
  po_id         uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  supplier_id   uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  received_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total_value   numeric(14,2) NOT NULL DEFAULT 0,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, grn_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipts TO authenticated;
GRANT ALL ON public.goods_receipts TO service_role;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY grn_tenant_all ON public.goods_receipts FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX idx_grn_po ON public.goods_receipts(po_id);
CREATE INDEX idx_grn_tenant_date ON public.goods_receipts(tenant_id, received_at DESC);
CREATE TRIGGER trg_grn_updated BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.goods_receipt_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  grn_id        uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  po_item_id    uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  batch_id      uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  batch_no      text NOT NULL,
  mfg_date      date,
  expiry_date   date NOT NULL,
  qty_received  numeric(14,3) NOT NULL CHECK (qty_received > 0),
  unit_cost     numeric(14,2) NOT NULL DEFAULT 0,
  line_total    numeric(14,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipt_items TO authenticated;
GRANT ALL ON public.goods_receipt_items TO service_role;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY grni_tenant_all ON public.goods_receipt_items FOR ALL TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX idx_grni_grn ON public.goods_receipt_items(grn_id);
CREATE INDEX idx_grni_po_item ON public.goods_receipt_items(po_item_id);

-- ============== ATOMIC RECEIVE FUNCTION ==============
CREATE OR REPLACE FUNCTION public.grn_receive(
  _tenant_id  uuid,
  _po_id      uuid,
  _grn_no     text,
  _notes      text DEFAULT NULL,
  _allow_over boolean DEFAULT false,
  _lines      jsonb DEFAULT '[]'::jsonb  -- [{po_item_id, batch_no, mfg_date, expiry_date, qty_received, unit_cost}]
) RETURNS public.goods_receipts
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
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

  -- Insert GRN header
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

    v_qty  := (v_line->>'qty_received')::numeric;
    v_cost := COALESCE((v_line->>'unit_cost')::numeric, v_po_item.unit_cost);
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'qty_received must be > 0' USING ERRCODE='22023';
    END IF;

    v_remaining := v_po_item.qty_ordered - v_po_item.qty_received;
    IF v_qty > v_remaining AND NOT _allow_over THEN
      RAISE EXCEPTION 'over-receipt blocked: ordered %, already received %, attempting %',
        v_po_item.qty_ordered, v_po_item.qty_received, v_qty USING ERRCODE='23514';
    END IF;

    -- Find-or-create batch for (product, batch_no, expiry)
    SELECT id INTO v_batch_id FROM public.batches
     WHERE tenant_id = _tenant_id
       AND product_id = v_po_item.product_id
       AND batch_no = v_line->>'batch_no'
     FOR UPDATE;
    IF v_batch_id IS NULL THEN
      INSERT INTO public.batches(
        tenant_id, product_id, batch_no, mfg_date, expiry_date,
        purchase_price, qty_on_hand
      ) VALUES (
        _tenant_id, v_po_item.product_id, v_line->>'batch_no',
        NULLIF(v_line->>'mfg_date','')::date,
        (v_line->>'expiry_date')::date,
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
      (v_line->>'expiry_date')::date,
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

  -- Update GRN total
  UPDATE public.goods_receipts SET total_value = v_total_value
   WHERE id = v_grn.id RETURNING * INTO v_grn;

  -- Recompute PO status
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

  -- Supplier ledger (credit = amount we owe supplier)
  IF v_supplier IS NOT NULL AND v_total_value > 0 THEN
    PERFORM public.post_ledger_entry(
      _tenant_id, 'supplier'::party_type, v_supplier, 'purchase'::ledger_entry_type,
      0, v_total_value, 'goods_receipts', v_grn.id, _grn_no,
      'GRN against PO ' || v_po.po_number
    );
  END IF;

  RETURN v_grn;
END $$;

REVOKE ALL ON FUNCTION public.grn_receive(uuid,uuid,text,text,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grn_receive(uuid,uuid,text,text,boolean,jsonb) TO authenticated, service_role;
