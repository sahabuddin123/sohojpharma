CREATE OR REPLACE FUNCTION public.replace_sale_invoice(
  _tenant_id uuid,
  _original_sale_id uuid,
  _customer_id uuid,
  _cashier_id uuid,
  _discount numeric DEFAULT 0,
  _notes text DEFAULT NULL::text,
  _client_op_id uuid DEFAULT NULL::uuid,
  _items jsonb DEFAULT '[]'::jsonb,
  _payments jsonb DEFAULT '[]'::jsonb,
  _register_id uuid DEFAULT NULL::uuid
) RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original public.sales;
  v_replacement public.sales;
  v_existing_payment_count integer := 0;
  v_existing_paid numeric := 0;
  v_missing_paid numeric := 0;
  v_effective_payments jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
  END IF;

  IF _original_sale_id IS NULL THEN
    RAISE EXCEPTION 'original invoice id is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_original
    FROM public.sales
   WHERE id = _original_sale_id AND tenant_id = _tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'original invoice not found' USING ERRCODE = '23503';
  END IF;
  IF v_original.status = 'void' THEN
    RAISE EXCEPTION 'original invoice already cancelled' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_original.is_return, false) THEN
    RAISE EXCEPTION 'returned invoice cannot be edited' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_existing_payment_count, v_existing_paid
    FROM public.sale_payments
   WHERE tenant_id = _tenant_id
     AND sale_id = _original_sale_id
     AND method <> 'due'
     AND amount > 0;

  SELECT COALESCE(
           jsonb_agg(jsonb_build_object(
             'method', method::text,
             'amount', amount,
             'reference', reference,
             'mobile_no', mobile_no
           ) ORDER BY created_at, id),
           '[]'::jsonb
         )
    INTO v_effective_payments
    FROM public.sale_payments
   WHERE tenant_id = _tenant_id
     AND sale_id = _original_sale_id
     AND method <> 'due'
     AND amount > 0;

  v_missing_paid := GREATEST(COALESCE(v_original.paid, 0) - COALESCE(v_existing_paid, 0), 0);
  IF v_missing_paid > 0.009 THEN
    v_effective_payments := v_effective_payments || jsonb_build_array(jsonb_build_object(
      'method', 'cash',
      'amount', ROUND(v_missing_paid, 2),
      'reference', 'legacy-paid-carry-forward'
    ));
  END IF;

  v_replacement := public.pos_checkout(
    _tenant_id,
    _customer_id,
    _cashier_id,
    NULL,
    COALESCE(_discount, 0),
    _notes,
    _client_op_id,
    _items,
    v_effective_payments,
    NULL
  );

  IF v_existing_payment_count > 0 THEN
    DELETE FROM public.sale_payments
     WHERE tenant_id = _tenant_id
       AND sale_id = v_replacement.id;

    UPDATE public.sale_payments
       SET sale_id = v_replacement.id
     WHERE tenant_id = _tenant_id
       AND sale_id = _original_sale_id
       AND method <> 'due'
       AND amount > 0;

    IF v_missing_paid > 0.009 THEN
      INSERT INTO public.sale_payments(
        tenant_id, sale_id, method, amount, reference, created_by
      ) VALUES (
        _tenant_id, v_replacement.id, 'cash', ROUND(v_missing_paid, 2),
        'legacy-paid-carry-forward', _cashier_id
      );
    END IF;
  END IF;

  PERFORM public.cancel_sale_invoice(
    _tenant_id,
    _original_sale_id,
    'Replaced by invoice ' || v_replacement.invoice_no || ' via POS edit',
    true
  );

  PERFORM public.audit_log_event(
    _tenant_id,
    'pos.invoice_replaced',
    'sales',
    v_replacement.id,
    jsonb_build_object(
      'original_sale_id', v_original.id,
      'original_invoice_no', v_original.invoice_no,
      'original_total', v_original.total,
      'original_paid', v_original.paid,
      'original_due', v_original.due
    ),
    jsonb_build_object(
      'replacement_sale_id', v_replacement.id,
      'replacement_invoice_no', v_replacement.invoice_no,
      'replacement_total', v_replacement.total,
      'replacement_paid', v_replacement.paid,
      'replacement_due', v_replacement.due
    )
  );

  RETURN v_replacement;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_sale_invoice(uuid, uuid, uuid, uuid, numeric, text, uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_sale_invoice(uuid, uuid, uuid, uuid, numeric, text, uuid, jsonb, jsonb, uuid) TO authenticated, service_role;