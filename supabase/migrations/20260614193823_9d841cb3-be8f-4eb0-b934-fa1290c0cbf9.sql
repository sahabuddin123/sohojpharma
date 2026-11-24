
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS vat_no text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS bin_no text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS vat_no text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS bin_no text;

CREATE OR REPLACE FUNCTION public.compute_vat(
  _amount numeric, _rate numeric, _mode text DEFAULT 'exclusive'
) RETURNS TABLE(net numeric, vat numeric, gross numeric)
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    CASE WHEN _mode='none' OR COALESCE(_rate,0)=0 THEN _amount
         WHEN _mode='inclusive' THEN ROUND(_amount / (1 + _rate/100.0), 4)
         ELSE _amount END,
    CASE WHEN _mode='none' OR COALESCE(_rate,0)=0 THEN 0
         WHEN _mode='inclusive' THEN ROUND(_amount - _amount/(1 + _rate/100.0), 4)
         ELSE ROUND(_amount * _rate/100.0, 4) END,
    CASE WHEN _mode='none' OR COALESCE(_rate,0)=0 THEN _amount
         WHEN _mode='inclusive' THEN _amount
         ELSE ROUND(_amount * (1 + _rate/100.0), 4) END;
$$;
GRANT EXECUTE ON FUNCTION public.compute_vat(numeric,numeric,text) TO authenticated, service_role;

DROP VIEW IF EXISTS public.v_sales_vat_register CASCADE;
CREATE VIEW public.v_sales_vat_register WITH (security_invoker=on) AS
SELECT
  s.tenant_id, s.id AS sale_id, s.invoice_no, s.created_at::date AS invoice_date,
  s.customer_id, c.name AS customer_name, c.vat_no AS customer_vat_no, c.bin_no AS customer_bin_no,
  si.product_id, p.name AS product_name, p.vat_mode, p.vat_rate,
  si.qty, si.unit_price,
  (si.qty * si.unit_price - COALESCE(si.discount,0)) AS gross_line,
  cv.net, cv.vat, cv.gross
FROM public.sales s
JOIN public.sale_items si ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
JOIN public.products  p   ON p.id = si.product_id
LEFT JOIN public.customers c ON c.id = s.customer_id
CROSS JOIN LATERAL public.compute_vat(
  (si.qty * si.unit_price - COALESCE(si.discount,0)), p.vat_rate, p.vat_mode) cv
WHERE s.status NOT IN ('void','returned');
GRANT SELECT ON public.v_sales_vat_register TO authenticated, service_role;

DROP VIEW IF EXISTS public.v_purchase_vat_register CASCADE;
CREATE VIEW public.v_purchase_vat_register WITH (security_invoker=on) AS
SELECT
  g.tenant_id, g.id AS grn_id, g.grn_no, g.created_at::date AS receipt_date,
  g.supplier_id, sup.name AS supplier_name, sup.vat_no AS supplier_vat_no, sup.bin_no AS supplier_bin_no,
  gi.product_id, p.name AS product_name, p.vat_mode, p.vat_rate,
  gi.batch_no, gi.qty_received AS qty, gi.unit_cost, gi.line_total AS gross_line,
  cv.net, cv.vat, cv.gross
FROM public.goods_receipts g
JOIN public.goods_receipt_items gi ON gi.grn_id = g.id AND gi.tenant_id = g.tenant_id
JOIN public.products p ON p.id = gi.product_id
LEFT JOIN public.suppliers sup ON sup.id = g.supplier_id
CROSS JOIN LATERAL public.compute_vat(gi.line_total, p.vat_rate, p.vat_mode) cv;
GRANT SELECT ON public.v_purchase_vat_register TO authenticated, service_role;

DROP VIEW IF EXISTS public.v_musak_summary CASCADE;
CREATE VIEW public.v_musak_summary WITH (security_invoker=on) AS
WITH out_vat AS (
  SELECT tenant_id, date_trunc('month', invoice_date)::date AS period,
         SUM(net) AS sales_net, SUM(vat) AS output_vat, SUM(gross) AS sales_gross
    FROM public.v_sales_vat_register GROUP BY 1,2),
in_vat AS (
  SELECT tenant_id, date_trunc('month', receipt_date)::date AS period,
         SUM(net) AS purchase_net, SUM(vat) AS input_vat, SUM(gross) AS purchase_gross
    FROM public.v_purchase_vat_register GROUP BY 1,2)
SELECT
  COALESCE(o.tenant_id, i.tenant_id) AS tenant_id,
  COALESCE(o.period, i.period) AS period,
  COALESCE(o.sales_net,0)      AS sales_net,
  COALESCE(o.output_vat,0)     AS output_vat,
  COALESCE(o.sales_gross,0)    AS sales_gross,
  COALESCE(i.purchase_net,0)   AS purchase_net,
  COALESCE(i.input_vat,0)      AS input_vat,
  COALESCE(i.purchase_gross,0) AS purchase_gross,
  COALESCE(o.output_vat,0) - COALESCE(i.input_vat,0) AS vat_payable
FROM out_vat o FULL OUTER JOIN in_vat i ON i.tenant_id=o.tenant_id AND i.period=o.period;
GRANT SELECT ON public.v_musak_summary TO authenticated, service_role;
