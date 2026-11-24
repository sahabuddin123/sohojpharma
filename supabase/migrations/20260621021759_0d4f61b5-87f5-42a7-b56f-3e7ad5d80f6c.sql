DROP VIEW IF EXISTS public.v_customer_due;

CREATE VIEW public.v_customer_due
WITH (security_invoker = on)
AS
WITH sales_agg AS (
  SELECT
    s.tenant_id,
    s.customer_id,
    COUNT(*) FILTER (WHERE s.status NOT IN ('void','draft')) AS sales_count,
    ROUND(COALESCE(SUM(s.total) FILTER (WHERE s.status NOT IN ('void','draft')), 0), 2) AS total_sales,
    ROUND(COALESCE(SUM(s.paid) FILTER (WHERE s.status NOT IN ('void','draft')), 0), 2) AS total_paid_on_sales,
    ROUND(COALESCE(SUM(s.due) FILTER (WHERE s.status NOT IN ('void','draft') AND s.due > 0), 0), 2) AS raw_open_invoice_due,
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
  c.customer_code,
  c.name,
  c.phone,
  c.email,
  c.nid_passport,
  c.type,
  c.due_balance AS stored_due_balance,
  public.customer_due_summary(c.id) AS due_balance,
  c.credit_limit,
  c.is_active,
  c.address,
  c.area,
  c.district,
  c.division,
  c.postal_code,
  c.country,
  c.opening_balance,
  c.payment_terms_days,
  c.created_at,
  c.date_of_birth,
  c.gender,
  c.blood_group,
  c.allergies,
  c.chronic_diseases,
  c.doctor_reference,
  c.notes,
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