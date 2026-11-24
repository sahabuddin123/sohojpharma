
CREATE OR REPLACE FUNCTION public.edit_sale_invoice(
  _tenant_id uuid, _original_sale_id uuid, _customer_id uuid, _cashier_id uuid,
  _discount numeric DEFAULT 0, _notes text DEFAULT NULL::text,
  _client_op_id uuid DEFAULT NULL::uuid,
  _items jsonb DEFAULT '[]'::jsonb, _payments jsonb DEFAULT '[]'::jsonb,
  _register_id uuid DEFAULT NULL::uuid
)
RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_orig public.sales;
  v_new  public.sales;
  v_existing public.sales;
  v_item record;
  v_qty numeric;
  v_batch_id uuid;
  v_items_out jsonb := '[]'::jsonb;
  v_in jsonb;
  v_pid uuid;
  v_override_products uuid[] := ARRAY[]::uuid[];
  v_merged jsonb;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF _client_op_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.sales
     WHERE tenant_id = _tenant_id AND client_op_id = _client_op_id LIMIT 1;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  SELECT * INTO v_orig FROM public.sales
   WHERE id = _original_sale_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'original invoice not found' USING ERRCODE='23503';
  END IF;
  IF v_orig.status IN ('void','returned','partially_returned') THEN
    RAISE EXCEPTION 'invoice cannot be edited (status: %)', v_orig.status USING ERRCODE='22023';
  END IF;
  IF COALESCE(v_orig.is_return, false) THEN
    RAISE EXCEPTION 'return invoices cannot be edited' USING ERRCODE='22023';
  END IF;

  -- Collect products that were originally sold via stock override (batch_id IS NULL)
  SELECT COALESCE(array_agg(DISTINCT product_id), ARRAY[]::uuid[])
    INTO v_override_products
    FROM public.sale_items
   WHERE sale_id = _original_sale_id AND tenant_id = _tenant_id
     AND batch_id IS NULL;

  -- Restore stock for original lines that DO have a batch_id; skip override lines (nothing to restore)
  FOR v_item IN
    SELECT id, product_id, batch_id, qty, returned_qty
      FROM public.sale_items
     WHERE sale_id = _original_sale_id AND tenant_id = _tenant_id
  LOOP
    v_qty := GREATEST(v_item.qty - COALESCE(v_item.returned_qty, 0), 0);
    IF v_qty <= 0 THEN CONTINUE; END IF;
    IF v_item.batch_id IS NULL THEN
      -- Override-origin line: log reversal movement but do NOT inflate batch stock
      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id, notes
      ) VALUES (
        _tenant_id, v_item.product_id, NULL, 'adjustment', v_qty,
        0, 'sales', _original_sale_id, v_orig.invoice_no, auth.uid(),
        'Invoice edited — override line reversed (no batch)'
      );
      CONTINUE;
    END IF;

    v_batch_id := v_item.batch_id;
    UPDATE public.batches SET qty_on_hand = qty_on_hand + v_qty WHERE id = v_batch_id;
    INSERT INTO public.stock_movements(
      tenant_id, product_id, batch_id, movement_type, qty_change,
      qty_after, reference_table, reference_id, reference_no, user_id, notes
    ) SELECT
      _tenant_id, v_item.product_id, v_batch_id, 'adjustment', v_qty,
      qty_on_hand, 'sales', _original_sale_id, v_orig.invoice_no, auth.uid(),
      'Invoice edited — stock reversed before replacement'
    FROM public.batches WHERE id = v_batch_id;
  END LOOP;

  DELETE FROM public.cash_register_transactions
   WHERE tenant_id = _tenant_id AND reference_table = 'sales' AND reference_id = _original_sale_id;

  UPDATE public.sales
     SET status = 'void', cancellation_reason = 'Replaced by invoice edit',
         cancelled_at = now(), cancelled_by = auth.uid(), due = 0
   WHERE id = _original_sale_id;

  IF v_orig.customer_id IS NOT NULL AND v_orig.due > 0 THEN
    BEGIN
      PERFORM public.post_ledger_entry(
        _tenant_id, 'customer'::public.party_type, v_orig.customer_id,
        'adjustment'::public.ledger_entry_type,
        0, v_orig.due, 'sales', _original_sale_id, v_orig.invoice_no,
        'Invoice edited — original due reversed'
      );
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END IF;

  -- Merge allow_stock_override=true into items whose product was originally override-based
  FOR v_in IN SELECT * FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) LOOP
    v_pid := (v_in->>'product_id')::uuid;
    IF v_pid = ANY(v_override_products) THEN
      v_merged := v_in || jsonb_build_object('allow_stock_override', true);
    ELSE
      v_merged := v_in;
    END IF;
    v_items_out := v_items_out || jsonb_build_array(v_merged);
  END LOOP;

  SELECT * INTO v_new
    FROM public.pos_checkout(
      _tenant_id, _customer_id, _cashier_id, NULL::text, _discount, _notes,
      _client_op_id, v_items_out, _payments, _register_id
    );

  UPDATE public.sales
     SET notes = trim(both E'\n' from COALESCE(notes,'') || E'\n[Replaces ' || v_orig.invoice_no || ']')
   WHERE id = v_new.id;
  UPDATE public.sales
     SET cancellation_reason = 'Replaced by invoice edit → ' || v_new.invoice_no
   WHERE id = _original_sale_id;

  INSERT INTO public.audit_log(
    tenant_id, user_id, action, entity_table, entity_id, before_data, after_data
  ) VALUES (
    _tenant_id, auth.uid(), 'invoice.edited', 'sales', v_new.id,
    jsonb_build_object('original_id', _original_sale_id, 'original_no', v_orig.invoice_no,
                       'original_total', v_orig.total, 'original_paid', v_orig.paid,
                       'original_due', v_orig.due, 'override_products', to_jsonb(v_override_products)),
    jsonb_build_object('new_id', v_new.id, 'new_no', v_new.invoice_no,
                       'new_total', v_new.total, 'new_paid', v_new.paid, 'new_due', v_new.due)
  );

  RETURN v_new;
END;
$function$;
