CREATE OR REPLACE FUNCTION public.post_ledger_entry(
  _tenant_id uuid,
  _party_type party_type,
  _party_id uuid,
  _entry_type ledger_entry_type,
  _debit numeric DEFAULT 0,
  _credit numeric DEFAULT 0,
  _ref_table text DEFAULT NULL,
  _ref_id uuid DEFAULT NULL,
  _ref_no text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS public.party_ledger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.party_ledger;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF COALESCE(_debit, 0) = 0 AND COALESCE(_credit, 0) = 0 THEN
    RAISE EXCEPTION 'debit and credit cannot both be zero' USING ERRCODE='22023';
  END IF;

  IF COALESCE(_debit, 0) > 0 AND COALESCE(_credit, 0) > 0 THEN
    RAISE EXCEPTION 'set debit OR credit, not both' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.party_ledger(
    tenant_id, party_type, party_id, entry_type, debit, credit,
    ref_table, ref_id, ref_no, notes, created_by
  ) VALUES (
    _tenant_id, _party_type, _party_id, _entry_type,
    ROUND(COALESCE(_debit, 0)::numeric, 2),
    ROUND(COALESCE(_credit, 0)::numeric, 2),
    _ref_table, _ref_id, _ref_no, _notes, auth.uid()
  ) RETURNING * INTO v_row;

  IF _party_type = 'customer' THEN
    -- Customer due is maintained only by customer_due_summary(); never incrementally
    -- mutate customers.due_balance from ledger rows, otherwise collections are deducted twice.
    PERFORM public.recalc_customer_due(_party_id);
  ELSE
    UPDATE public.suppliers
       SET due_balance = ROUND(COALESCE(due_balance, 0) + ROUND(COALESCE(_credit, 0)::numeric, 2) - ROUND(COALESCE(_debit, 0)::numeric, 2), 2)
     WHERE id = _party_id AND tenant_id = _tenant_id;
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE VIEW public.v_customer_due
WITH (security_invoker = on)
AS
WITH sales_agg AS (
  SELECT
    s.tenant_id,
    s.customer_id,
    COUNT(*) FILTER (WHERE s.status NOT IN ('void','draft')) AS sales_count,
    ROUND(COALESCE(SUM(s.total) FILTER (WHERE s.status NOT IN ('void','draft')), 0), 2) AS total_sales,
    ROUND(COALESCE(SUM(s.paid) FILTER (WHERE s.status NOT IN ('void','draft')), 0), 2) AS total_paid_on_sales,
    ROUND(COALESCE(SUM(s.due) FILTER (WHERE s.status NOT IN ('void','draft') AND s.due > 0), 0), 2) AS open_invoice_due,
    MAX(s.created_at) AS last_purchase_at
  FROM public.sales s
  WHERE s.customer_id IS NOT NULL
  GROUP BY s.tenant_id, s.customer_id
), payments_agg AS (
  SELECT
    cp.tenant_id,
    cp.customer_id,
    ROUND(COALESCE(SUM(cp.amount), 0), 2) AS total_collected,
    MAX(cp.payment_date) AS last_collected_on
  FROM public.customer_payments cp
  GROUP BY cp.tenant_id, cp.customer_id
), ledger_agg AS (
  SELECT
    pl.tenant_id,
    pl.party_id AS customer_id,
    MAX(pl.entry_date) FILTER (WHERE pl.entry_type IN ('collection','payment')) AS last_payment_at
  FROM public.party_ledger pl
  WHERE pl.party_type = 'customer'
  GROUP BY pl.tenant_id, pl.party_id
)
SELECT
  c.id AS customer_id,
  c.tenant_id,
  c.name,
  c.phone,
  c.email,
  c.credit_limit,
  COALESCE(sa.total_sales, 0::numeric) AS total_sales,
  COALESCE(sa.total_paid_on_sales, 0::numeric) AS total_paid_on_sales,
  COALESCE(pa.total_collected, 0::numeric) AS total_collected,
  public.customer_due_summary(c.id) AS net_due,
  public.customer_due_summary(c.id) AS open_invoice_due,
  COALESCE(sa.sales_count, 0::bigint) AS sales_count,
  sa.last_purchase_at,
  COALESCE(la.last_payment_at, pa.last_collected_on::timestamp with time zone) AS last_payment_at
FROM public.customers c
LEFT JOIN sales_agg sa ON sa.tenant_id = c.tenant_id AND sa.customer_id = c.id
LEFT JOIN payments_agg pa ON pa.tenant_id = c.tenant_id AND pa.customer_id = c.id
LEFT JOIN ledger_agg la ON la.tenant_id = c.tenant_id AND la.customer_id = c.id;

GRANT SELECT ON public.v_customer_due TO authenticated;
GRANT SELECT ON public.v_customer_due TO service_role;

UPDATE public.customers
   SET due_balance = public.customer_due_summary(id),
       updated_at = now();