
-- ============================================
-- E19 BI VIEWS
-- ============================================

CREATE OR REPLACE VIEW public.v_bi_sales_daily
WITH (security_invoker = on) AS
SELECT
  s.tenant_id,
  s.warehouse_id,
  date_trunc('day', s.sale_date)::date AS day,
  COUNT(*) AS txn_count,
  COALESCE(SUM(s.total), 0) AS revenue,
  COALESCE(SUM(s.subtotal), 0) AS subtotal,
  COALESCE(SUM(s.discount), 0) AS discount,
  COALESCE(SUM(s.vat), 0) AS vat,
  COALESCE(SUM(si.gross_profit), 0) AS gross_profit,
  CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(s.total), 0) / COUNT(*) ELSE 0 END AS avg_basket
FROM public.sales s
LEFT JOIN (
  SELECT sale_id, SUM((unit_price - COALESCE(unit_cost,0)) * qty - COALESCE(discount,0)) AS gross_profit
  FROM public.sale_items GROUP BY sale_id
) si ON si.sale_id = s.id
GROUP BY s.tenant_id, s.warehouse_id, date_trunc('day', s.sale_date);

GRANT SELECT ON public.v_bi_sales_daily TO authenticated;

CREATE OR REPLACE VIEW public.v_bi_product_perf_30d
WITH (security_invoker = on) AS
SELECT
  p.tenant_id,
  p.id AS product_id,
  p.name,
  p.sku,
  COALESCE(SUM(si.qty), 0) AS qty_sold_30d,
  COALESCE(SUM(si.line_total), 0) AS revenue_30d,
  COALESCE(SUM((si.unit_price - COALESCE(si.unit_cost,0)) * si.qty), 0) AS profit_30d,
  CASE WHEN COALESCE(SUM(si.line_total),0) > 0
    THEN (COALESCE(SUM((si.unit_price - COALESCE(si.unit_cost,0)) * si.qty),0) / SUM(si.line_total)) * 100
    ELSE 0 END AS margin_pct,
  MAX(s.sale_date) AS last_sold_at
FROM public.products p
LEFT JOIN public.sale_items si ON si.product_id = p.id
LEFT JOIN public.sales s ON s.id = si.sale_id AND s.sale_date >= now() - interval '30 days'
GROUP BY p.tenant_id, p.id, p.name, p.sku;

GRANT SELECT ON public.v_bi_product_perf_30d TO authenticated;

CREATE OR REPLACE VIEW public.v_bi_inventory_aging
WITH (security_invoker = on) AS
SELECT
  b.tenant_id,
  b.warehouse_id,
  b.product_id,
  p.name AS product_name,
  SUM(CASE WHEN (CURRENT_DATE - b.created_at::date) BETWEEN 0 AND 30 THEN 1 ELSE 0 END) AS aging_0_30,
  SUM(CASE WHEN (CURRENT_DATE - b.created_at::date) BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS aging_31_60,
  SUM(CASE WHEN (CURRENT_DATE - b.created_at::date) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS aging_61_90,
  SUM(CASE WHEN (CURRENT_DATE - b.created_at::date) > 90 THEN 1 ELSE 0 END) AS aging_90_plus,
  COUNT(*) AS batch_count
FROM public.batches b
JOIN public.products p ON p.id = b.product_id
GROUP BY b.tenant_id, b.warehouse_id, b.product_id, p.name;

GRANT SELECT ON public.v_bi_inventory_aging TO authenticated;

CREATE OR REPLACE VIEW public.v_bi_customer_stats
WITH (security_invoker = on) AS
SELECT
  c.tenant_id,
  c.id AS customer_id,
  c.name,
  COUNT(s.id) AS purchase_count,
  COALESCE(SUM(s.total), 0) AS total_spent,
  CASE WHEN COUNT(s.id) > 0 THEN COALESCE(SUM(s.total),0) / COUNT(s.id) ELSE 0 END AS avg_order_value,
  MAX(s.sale_date) AS last_purchase_at,
  COALESCE(c.due_balance, 0) AS due_balance
FROM public.customers c
LEFT JOIN public.sales s ON s.customer_id = c.id
GROUP BY c.tenant_id, c.id, c.name, c.due_balance;

GRANT SELECT ON public.v_bi_customer_stats TO authenticated;

CREATE OR REPLACE VIEW public.v_bi_supplier_stats
WITH (security_invoker = on) AS
SELECT
  s.tenant_id,
  s.id AS supplier_id,
  s.name,
  COUNT(p.id) AS purchase_count,
  COALESCE(SUM(p.total), 0) AS total_purchased,
  COALESCE(s.due_balance, 0) AS due_exposure,
  MAX(p.purchase_date) AS last_purchase_at
FROM public.suppliers s
LEFT JOIN public.purchases p ON p.supplier_id = s.id
GROUP BY s.tenant_id, s.id, s.name, s.due_balance;

GRANT SELECT ON public.v_bi_supplier_stats TO authenticated;

-- ============================================
-- EXECUTIVE ALERTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.executive_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT,
  payload JSONB,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.executive_alerts TO authenticated;
GRANT ALL ON public.executive_alerts TO service_role;
ALTER TABLE public.executive_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read alerts" ON public.executive_alerts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = executive_alerts.tenant_id));
CREATE POLICY "tenant members ack alerts" ON public.executive_alerts
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = executive_alerts.tenant_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.tenant_id = executive_alerts.tenant_id));
CREATE POLICY "service inserts alerts" ON public.executive_alerts
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_executive_alerts_tenant ON public.executive_alerts(tenant_id, created_at DESC);
CREATE TRIGGER trg_executive_alerts_updated
  BEFORE UPDATE ON public.executive_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SCHEDULED REPORTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'weekly',
  recipients TEXT[] NOT NULL DEFAULT '{}',
  filters JSONB,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_reports TO authenticated;
GRANT ALL ON public.scheduled_reports TO service_role;
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scheduled reports" ON public.scheduled_reports
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next ON public.scheduled_reports(next_run_at) WHERE is_active = true;
CREATE TRIGGER trg_scheduled_reports_updated
  BEFORE UPDATE ON public.scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SECURITY FIXES
-- ============================================

ALTER VIEW public.v_general_ledger SET (security_invoker = on);
ALTER VIEW public.v_trial_balance_by_warehouse SET (security_invoker = on);

-- Realtime: lock notifications channel subscriptions to tenant members
DO $$ BEGIN
  ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "tenant members can subscribe to notifications channel" ON realtime.messages;
  CREATE POLICY "tenant members can subscribe to notifications channel"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    topic LIKE 'notifications:%'
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id::text = split_part(topic, ':', 2)
    )
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
