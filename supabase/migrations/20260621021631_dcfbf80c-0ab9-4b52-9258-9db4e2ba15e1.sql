CREATE OR REPLACE FUNCTION public.collect_customer_due(
  _tenant_id uuid,
  _customer_id uuid,
  _amount numeric,
  _method text DEFAULT 'cash'::text,
  _reference text DEFAULT NULL::text,
  _notes text DEFAULT NULL::text,
  _payment_date date DEFAULT NULL::date,
  _sale_id uuid DEFAULT NULL::uuid,
  _register_id uuid DEFAULT NULL::uuid,
  _client_op_id uuid DEFAULT NULL::uuid
)
RETURNS public.customer_payments
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_pay        public.customer_payments;
  v_existing   public.customer_payments;
  v_method_pm  public.payment_method;
  v_remaining  numeric(18,2);
  v_take       numeric(18,2);
  v_amount     numeric(18,2);
  v_previous_due numeric(18,2);
  v_after_due numeric(18,2);
  v_sale       record;
  v_reg        public.cash_registers;
  v_no         text;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  v_amount := ROUND(COALESCE(_amount, 0)::numeric, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0' USING ERRCODE='22023';
  END IF;
  IF ROUND(COALESCE(_amount, 0)::numeric, 2) <> v_amount THEN
    RAISE EXCEPTION 'Amount mismatch' USING ERRCODE='22023';
  END IF;
  IF _customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id required' USING ERRCODE='22023';
  END IF;

  SELECT ROUND(public.customer_due_summary(_customer_id), 2) INTO v_previous_due;

  IF _client_op_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.customer_payments
      WHERE client_op_id = _client_op_id AND tenant_id = _tenant_id;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  v_method_pm := COALESCE(lower(_method), 'cash')::public.payment_method;

  IF _register_id IS NOT NULL THEN
    SELECT * INTO v_reg FROM public.cash_registers
      WHERE id = _register_id AND tenant_id = _tenant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'register not found' USING ERRCODE='23503'; END IF;
    IF v_reg.status <> 'open' THEN RAISE EXCEPTION 'register is closed' USING ERRCODE='22023'; END IF;
  END IF;

  INSERT INTO public.customer_payments(
    tenant_id, customer_id, sale_id, payment_date, amount,
    method, reference, notes, client_op_id, collected_by
  ) VALUES (
    _tenant_id, _customer_id, _sale_id, COALESCE(_payment_date, CURRENT_DATE),
    v_amount, v_method_pm, _reference, _notes, _client_op_id, auth.uid()
  ) RETURNING * INTO v_pay;

  v_no := 'RCPT-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(v_pay.id::text, 1, 4);

  v_remaining := v_amount;
  FOR v_sale IN
    SELECT id, due
      FROM public.sales
     WHERE tenant_id = _tenant_id
       AND customer_id = _customer_id
       AND due > 0
       AND status NOT IN ('void','returned')
       AND (_sale_id IS NULL OR id = _sale_id)
     ORDER BY created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_sale.due);
    UPDATE public.sales
       SET paid = ROUND(COALESCE(paid, 0) + v_take, 2),
           due  = GREATEST(ROUND(COALESCE(due, 0) - v_take, 2), 0),
           status = CASE WHEN ROUND(COALESCE(due, 0) - v_take, 2) <= 0
                         THEN 'completed'::sale_status
                         ELSE 'partial'::sale_status END
     WHERE id = v_sale.id;
    v_remaining := ROUND(v_remaining - v_take, 2);
  END LOOP;

  PERFORM public.post_ledger_entry(
    _tenant_id, 'customer'::party_type, _customer_id, 'collection'::ledger_entry_type,
    0, v_amount, 'customer_payments', v_pay.id, v_no,
    'Due collection [' || _method || ']' || COALESCE(' — ' || _notes, '')
  );

  IF _register_id IS NOT NULL THEN
    INSERT INTO public.cash_register_transactions(
      tenant_id, register_id, transaction_type, amount,
      payment_method, notes, reference_table, reference_id, reference_no, created_by
    ) VALUES (
      _tenant_id, _register_id, 'due_collection', v_amount,
      _method, COALESCE(_notes, 'Due collection'),
      'customer_payments', v_pay.id, v_no, auth.uid()
    );
  END IF;

  SELECT ROUND(public.customer_due_summary(_customer_id), 2) INTO v_after_due;
  PERFORM public.recalc_customer_due(_customer_id);

  PERFORM public.audit_log_event(
    _tenant_id, 'due.collection', 'customer_payments', v_pay.id, NULL,
    jsonb_build_object(
      'customer_id', _customer_id,
      'entered_amount', v_amount,
      'saved_amount', v_pay.amount,
      'amount', v_amount,
      'method', _method,
      'previous_due', v_previous_due,
      'remaining_due', v_after_due,
      'customer_due_summary_due', v_after_due,
      'sale_id', _sale_id,
      'register_id', _register_id,
      'receipt_no', v_no,
      'unallocated', v_remaining
    )
  );

  RETURN v_pay;
END;
$$;

GRANT EXECUTE ON FUNCTION public.collect_customer_due(uuid, uuid, numeric, text, text, text, date, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.collect_customer_due(uuid, uuid, numeric, text, text, text, date, uuid, uuid, uuid) TO service_role;