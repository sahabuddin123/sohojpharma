
CREATE INDEX IF NOT EXISTS sales_returns_sale_id_idx ON public.sales_returns(tenant_id, sale_id);

CREATE OR REPLACE FUNCTION public.pos_return(
  _tenant_id      uuid,
  _sale_id        uuid,
  _items          jsonb DEFAULT '[]'::jsonb,
  _reason         text  DEFAULT NULL,
  _refund_method  text  DEFAULT 'cash',
  _refund_amount  numeric DEFAULT NULL,
  _notes          text  DEFAULT NULL
) RETURNS public.sales_returns
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_sale        public.sales;
  v_ret         public.sales_returns;
  v_item        jsonb;
  v_si          public.sale_items;
  v_qty         numeric;
  v_avail       numeric;
  v_subtotal    numeric := 0;
  v_vat_total   numeric := 0;
  v_total       numeric := 0;
  v_refund      numeric;
  v_method_pm   public.payment_method;
  v_special     text := NULL;
  v_return_no   text;
  v_sold_total  numeric := 0;
  v_returned_total numeric := 0;
  v_new_status  public.sale_status;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_sale FROM public.sales
   WHERE id = _sale_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sale not found' USING ERRCODE='23503'; END IF;

  IF jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'no items to return' USING ERRCODE='22023';
  END IF;

  -- Map refund method: enum values are cash/bkash/nagad/rocket/bank/card/other
  IF lower(COALESCE(_refund_method,'cash')) IN ('due','store_credit','adjustment') THEN
    v_special := lower(_refund_method);
    v_method_pm := 'other'::public.payment_method;
  ELSE
    v_method_pm := lower(COALESCE(_refund_method,'cash'))::public.payment_method;
  END IF;

  v_return_no := 'RTN-' || to_char(now(),'YYYYMMDDHH24MISS') || '-' || substr(_sale_id::text,1,4);

  INSERT INTO public.sales_returns(
    tenant_id, return_no, sale_id, customer_id, return_date, reason,
    subtotal, vat, total, refund_method, refunded_amount, notes, created_by
  ) VALUES (
    _tenant_id, v_return_no, _sale_id, v_sale.customer_id, CURRENT_DATE, _reason,
    0, 0, 0, v_method_pm, 0,
    COALESCE(_notes,'') || CASE WHEN v_special IS NOT NULL THEN ' [refund=' || v_special || ']' ELSE '' END,
    auth.uid()
  ) RETURNING * INTO v_ret;

  -- Process each return line
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO v_si FROM public.sale_items
     WHERE id = (v_item->>'sale_item_id')::uuid
       AND sale_id = _sale_id
       AND tenant_id = _tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sale_item % not found on this invoice', v_item->>'sale_item_id'
        USING ERRCODE='23503';
    END IF;

    v_qty := (v_item->>'qty')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'return qty must be > 0' USING ERRCODE='22023';
    END IF;

    v_avail := v_si.qty - COALESCE(v_si.returned_qty,0);
    IF v_qty > v_avail THEN
      RAISE EXCEPTION 'cannot return % of product % — only % available (sold % already returned %)',
        v_qty, v_si.product_id, v_avail, v_si.qty, v_si.returned_qty
        USING ERRCODE='23514';
    END IF;

    -- Restore inventory to original batch when known
    IF v_si.batch_id IS NOT NULL THEN
      UPDATE public.batches
         SET qty_on_hand = qty_on_hand + v_qty
       WHERE id = v_si.batch_id;
      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id, notes
      ) SELECT
        _tenant_id, v_si.product_id, v_si.batch_id, 'sales_return', v_qty,
        qty_on_hand, 'sales_returns', v_ret.id, v_return_no, auth.uid(), _reason
      FROM public.batches WHERE id = v_si.batch_id;
    END IF;

    UPDATE public.sale_items
       SET returned_qty = COALESCE(returned_qty,0) + v_qty
     WHERE id = v_si.id;

    -- Line refund value derived pro-rata from original line
    DECLARE
      v_line_value numeric;
      v_line_vat   numeric;
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
     SET subtotal = v_subtotal, vat = v_vat_total, total = v_total,
         refunded_amount = v_refund
   WHERE id = v_ret.id
   RETURNING * INTO v_ret;

  -- Customer ledger: due adjustment / store credit credits the customer
  IF v_sale.customer_id IS NOT NULL AND v_refund > 0 THEN
    IF v_special IN ('due','store_credit','adjustment') THEN
      PERFORM public.post_ledger_entry(
        _tenant_id, 'customer'::public.party_type, v_sale.customer_id,
        'sales_return'::public.ledger_entry_type,
        0, v_refund, 'sales_returns', v_ret.id, v_return_no,
        'Return ' || v_return_no || COALESCE(' — '||_reason,'')
      );
    END IF;
  END IF;

  -- Recompute sale status from total qty returned
  SELECT COALESCE(SUM(qty),0), COALESCE(SUM(returned_qty),0)
    INTO v_sold_total, v_returned_total
    FROM public.sale_items WHERE sale_id = _sale_id AND tenant_id = _tenant_id;

  IF v_returned_total >= v_sold_total THEN
    v_new_status := 'returned';
  ELSIF v_returned_total > 0 THEN
    v_new_status := 'partially_returned';
  ELSE
    v_new_status := v_sale.status;
  END IF;

  UPDATE public.sales SET status = v_new_status WHERE id = _sale_id;

  PERFORM public.audit_log_event(
    _tenant_id,
    CASE WHEN v_new_status = 'returned' THEN 'sale_return.full' ELSE 'sale_return.partial' END,
    'sales_returns', v_ret.id, NULL,
    jsonb_build_object(
      'return_no', v_return_no, 'sale_id', _sale_id,
      'total', v_total, 'refund', v_refund, 'method', v_method_pm,
      'special', v_special
    )
  );

  RETURN v_ret;
END $$;

REVOKE ALL ON FUNCTION public.pos_return(uuid, uuid, jsonb, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_return(uuid, uuid, jsonb, text, text, numeric, text) TO authenticated;
