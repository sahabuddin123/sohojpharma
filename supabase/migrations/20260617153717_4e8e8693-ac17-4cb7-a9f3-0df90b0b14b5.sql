
-- Add missing enum value (the existing pos_checkout RPC already references it)
ALTER TYPE public.sale_status ADD VALUE IF NOT EXISTS 'partial';

-- ============================================================
-- View: v_customer_due
-- ============================================================
CREATE OR REPLACE VIEW public.v_customer_due
WITH (security_invoker = on) AS
WITH ledger AS (
  SELECT tenant_id, party_id,
         SUM(debit) - SUM(credit) AS net_due,
         MAX(entry_date) FILTER (WHERE entry_type IN ('collection','payment')) AS last_payment_at
    FROM public.party_ledger
   WHERE party_type = 'customer'
   GROUP BY tenant_id, party_id
), sales_agg AS (
  SELECT tenant_id, customer_id,
         COUNT(*) FILTER (WHERE status NOT IN ('void','returned'))                    AS sales_count,
         COALESCE(SUM(total) FILTER (WHERE status NOT IN ('void','returned')), 0)     AS total_sales,
         COALESCE(SUM(paid)  FILTER (WHERE status NOT IN ('void','returned')), 0)     AS total_paid_on_sales,
         COALESCE(SUM(due)   FILTER (WHERE status NOT IN ('void','returned') AND due > 0), 0) AS open_due,
         MAX(created_at) AS last_purchase_at
    FROM public.sales
   WHERE customer_id IS NOT NULL
   GROUP BY tenant_id, customer_id
), payments_agg AS (
  SELECT tenant_id, customer_id,
         COALESCE(SUM(amount), 0) AS total_collected,
         MAX(payment_date) AS last_collected_on
    FROM public.customer_payments
   GROUP BY tenant_id, customer_id
)
SELECT c.id                                  AS customer_id,
       c.tenant_id,
       c.name,
       c.phone,
       c.email,
       c.credit_limit,
       COALESCE(sa.total_sales, 0)           AS total_sales,
       COALESCE(sa.total_paid_on_sales, 0)   AS total_paid_on_sales,
       COALESCE(pa.total_collected, 0)       AS total_collected,
       COALESCE(l.net_due, 0)                AS net_due,
       COALESCE(sa.open_due, 0)              AS open_invoice_due,
       sa.sales_count,
       sa.last_purchase_at,
       COALESCE(l.last_payment_at, pa.last_collected_on::timestamptz) AS last_payment_at
  FROM public.customers c
  LEFT JOIN ledger       l  ON l.tenant_id = c.tenant_id AND l.party_id     = c.id
  LEFT JOIN sales_agg    sa ON sa.tenant_id = c.tenant_id AND sa.customer_id = c.id
  LEFT JOIN payments_agg pa ON pa.tenant_id = c.tenant_id AND pa.customer_id = c.id;

GRANT SELECT ON public.v_customer_due TO authenticated;

-- ============================================================
-- RPC: collect_customer_due
-- ============================================================
CREATE OR REPLACE FUNCTION public.collect_customer_due(
  _tenant_id     uuid,
  _customer_id   uuid,
  _amount        numeric,
  _method        text DEFAULT 'cash',
  _reference     text DEFAULT NULL,
  _notes         text DEFAULT NULL,
  _payment_date  date DEFAULT NULL,
  _sale_id       uuid DEFAULT NULL,
  _register_id   uuid DEFAULT NULL,
  _client_op_id  uuid DEFAULT NULL
) RETURNS public.customer_payments
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_pay        public.customer_payments;
  v_existing   public.customer_payments;
  v_method_pm  public.payment_method;
  v_remaining  numeric;
  v_take       numeric;
  v_sale       record;
  v_reg        public.cash_registers;
  v_no         text;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0' USING ERRCODE='22023';
  END IF;
  IF _customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id required' USING ERRCODE='22023';
  END IF;

  IF _client_op_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.customer_payments
      WHERE client_op_id = _client_op_id AND tenant_id = _tenant_id;
    IF FOUND THEN RETURN v_existing; END IF;
  END IF;

  v_method_pm := COALESCE(lower(_method),'cash')::public.payment_method;

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
    _amount, v_method_pm, _reference, _notes, _client_op_id, auth.uid()
  ) RETURNING * INTO v_pay;

  v_no := 'RCPT-' || to_char(now(),'YYYYMMDDHH24MISS') || '-' || substr(v_pay.id::text,1,4);

  v_remaining := _amount;
  FOR v_sale IN
    SELECT id, due
      FROM public.sales
     WHERE tenant_id = _tenant_id
       AND customer_id = _customer_id
       AND due > 0
       AND status NOT IN ('void','returned')
       AND ( _sale_id IS NULL OR id = _sale_id )
     ORDER BY created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_sale.due);
    UPDATE public.sales
       SET paid = paid + v_take,
           due  = GREATEST(due - v_take, 0),
           status = CASE WHEN due - v_take <= 0.001
                         THEN 'completed'::sale_status
                         ELSE 'partial'::sale_status END
     WHERE id = v_sale.id;
    v_remaining := v_remaining - v_take;
  END LOOP;

  PERFORM public.post_ledger_entry(
    _tenant_id, 'customer'::party_type, _customer_id, 'collection'::ledger_entry_type,
    0, _amount, 'customer_payments', v_pay.id, v_no,
    'Due collection [' || _method || ']' || COALESCE(' — '||_notes,'')
  );

  IF _register_id IS NOT NULL THEN
    INSERT INTO public.cash_register_transactions(
      tenant_id, register_id, transaction_type, amount,
      payment_method, notes, reference_table, reference_id, reference_no, created_by
    ) VALUES (
      _tenant_id, _register_id, 'due_collection', _amount,
      _method, COALESCE(_notes,'Due collection'),
      'customer_payments', v_pay.id, v_no, auth.uid()
    );
  END IF;

  PERFORM public.audit_log_event(
    _tenant_id, 'due.collection', 'customer_payments', v_pay.id, NULL,
    jsonb_build_object(
      'customer_id', _customer_id, 'amount', _amount, 'method', _method,
      'sale_id', _sale_id, 'register_id', _register_id, 'receipt_no', v_no,
      'unallocated', v_remaining
    )
  );

  RETURN v_pay;
END $$;

GRANT EXECUTE ON FUNCTION public.collect_customer_due(uuid,uuid,numeric,text,text,text,date,uuid,uuid,uuid)
  TO authenticated;
