
CREATE INDEX IF NOT EXISTS idx_pl_tenant_party_date
  ON public.party_ledger (tenant_id, party_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_name
  ON public.customers (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_products_tenant_name
  ON public.products (tenant_id, lower(name));
CREATE INDEX IF NOT EXISTS idx_sale_items_tenant_product
  ON public.sale_items (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_tenant_product
  ON public.purchase_items (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_status_date
  ON public.sales (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_tenant_status_date
  ON public.purchases (tenant_id, status, created_at DESC);

CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON public.customers USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
  ON public.customers USING gin (phone extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm
  ON public.suppliers USING gin (name extensions.gin_trgm_ops);

DROP MATERIALIZED VIEW IF EXISTS public.mv_sales_daily;
CREATE MATERIALIZED VIEW public.mv_sales_daily AS
SELECT tenant_id,
  date_trunc('day', created_at)::date AS day,
  count(*)      AS invoice_count,
  sum(subtotal) AS subtotal,
  sum(discount) AS discount,
  sum(vat)      AS vat,
  sum(total)    AS total,
  sum(paid)     AS paid,
  sum(due)      AS due
FROM public.sales
WHERE status NOT IN ('void','draft','returned')
GROUP BY tenant_id, date_trunc('day', created_at)::date;
CREATE UNIQUE INDEX IF NOT EXISTS mv_sales_daily_pk
  ON public.mv_sales_daily (tenant_id, day);

DROP MATERIALIZED VIEW IF EXISTS public.mv_inventory_summary;
CREATE MATERIALIZED VIEW public.mv_inventory_summary AS
SELECT b.tenant_id, b.product_id,
  sum(b.qty_on_hand) AS qty_on_hand,
  sum(b.qty_on_hand * b.purchase_price) AS stock_value,
  min(b.expiry_date) AS nearest_expiry,
  sum(b.qty_on_hand) FILTER (WHERE b.expiry_date < CURRENT_DATE + INTERVAL '90 days') AS qty_expiring_90d
FROM public.batches b
GROUP BY b.tenant_id, b.product_id;
CREATE UNIQUE INDEX IF NOT EXISTS mv_inventory_summary_pk
  ON public.mv_inventory_summary (tenant_id, product_id);

CREATE OR REPLACE FUNCTION public.refresh_perf_matviews()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_sales_daily;
  EXCEPTION WHEN OTHERS THEN
    REFRESH MATERIALIZED VIEW public.mv_sales_daily;
  END;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_inventory_summary;
  EXCEPTION WHEN OTHERS THEN
    REFRESH MATERIALIZED VIEW public.mv_inventory_summary;
  END;
END $$;
REVOKE ALL ON FUNCTION public.refresh_perf_matviews() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_perf_matviews() TO service_role;

REFRESH MATERIALIZED VIEW public.mv_sales_daily;
REFRESH MATERIALIZED VIEW public.mv_inventory_summary;

REVOKE ALL ON public.mv_sales_daily, public.mv_inventory_summary FROM public, anon, authenticated;
GRANT SELECT ON public.mv_sales_daily, public.mv_inventory_summary TO service_role;

CREATE OR REPLACE VIEW public.v_sales_daily WITH (security_invoker = true) AS
SELECT m.* FROM public.mv_sales_daily m
WHERE EXISTS (SELECT 1 FROM public.tenant_members tm
              WHERE tm.tenant_id = m.tenant_id AND tm.user_id = auth.uid());

CREATE OR REPLACE VIEW public.v_inventory_summary WITH (security_invoker = true) AS
SELECT m.* FROM public.mv_inventory_summary m
WHERE EXISTS (SELECT 1 FROM public.tenant_members tm
              WHERE tm.tenant_id = m.tenant_id AND tm.user_id = auth.uid());

GRANT SELECT ON public.v_sales_daily, public.v_inventory_summary TO authenticated;
