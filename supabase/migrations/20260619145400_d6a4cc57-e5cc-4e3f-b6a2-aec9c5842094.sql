CREATE OR REPLACE FUNCTION public.get_store_dashboard_v2(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today timestamptz := date_trunc('day', now());
  _tomorrow timestamptz := date_trunc('day', now()) + interval '1 day';
  _yesterday timestamptz := date_trunc('day', now()) - interval '1 day';
  _last7 timestamptz := date_trunc('day', now()) - interval '6 days';
  _d30 timestamptz := date_trunc('day', now()) - interval '29 days';
  _d12mo timestamptz := date_trunc('month', now()) - interval '11 months';
  _mtd timestamptz := date_trunc('month', now());
  _in30 date := (current_date + 30);
  result jsonb;
BEGIN
  IF NOT public.is_tenant_member(_uid, _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH
  t AS (SELECT name FROM tenants WHERE id = _tenant_id),
  s_today AS (
    SELECT COALESCE(SUM(total),0)::numeric AS total, COALESCE(SUM(paid),0)::numeric AS paid
    FROM sales WHERE tenant_id = _tenant_id AND status <> 'void' AND created_at >= _today
  ),
  p_today AS (
    SELECT COALESCE(SUM(total),0)::numeric AS total
    FROM purchases WHERE tenant_id = _tenant_id AND created_at >= _today
  ),
  cash_today AS (
    SELECT COALESCE(SUM(amount) FILTER (WHERE LOWER(COALESCE(method::text,'cash')) = 'cash'),0)::numeric AS cash
    FROM sale_payments WHERE tenant_id = _tenant_id AND created_at >= _today
  ),
  due_today AS (
    SELECT COALESCE(SUM(amount),0)::numeric AS amount
    FROM customer_payments WHERE tenant_id = _tenant_id AND created_at >= _today
  ),
  counts AS (
    SELECT
      (SELECT COUNT(*) FROM customers WHERE tenant_id = _tenant_id) AS cust,
      (SELECT COUNT(*) FROM suppliers WHERE tenant_id = _tenant_id) AS sup,
      (SELECT COUNT(*) FROM products WHERE tenant_id = _tenant_id) AS prod
  ),
  batches_agg AS (
    SELECT
      COALESCE(SUM(qty_on_hand * purchase_price) FILTER (WHERE qty_on_hand > 0),0)::numeric AS inv_value,
      COUNT(*) FILTER (WHERE qty_on_hand > 0 AND expiry_date < current_date) AS expired,
      COUNT(*) FILTER (WHERE qty_on_hand > 0 AND expiry_date >= current_date AND expiry_date <= _in30) AS near_exp
    FROM batches WHERE tenant_id = _tenant_id
  ),
  prod_stock AS (
    SELECT p.id, p.name, p.sku, p.reorder_level,
           COALESCE((SELECT SUM(qty_on_hand) FROM batches b WHERE b.product_id = p.id AND b.tenant_id = _tenant_id),0)::numeric AS stock
    FROM products p WHERE p.tenant_id = _tenant_id
  ),
  low_stock_top AS (
    SELECT jsonb_agg(jsonb_build_object('name',name,'sku',sku,'stock',stock,'reorder',reorder_level)
                     ORDER BY stock ASC) AS rows,
           COUNT(*) AS cnt
    FROM (
      SELECT * FROM prod_stock WHERE reorder_level > 0 AND stock < reorder_level
      ORDER BY stock ASC LIMIT 5
    ) x
  ),
  low_stock_count AS (
    SELECT COUNT(*) AS cnt FROM prod_stock WHERE reorder_level > 0 AND stock <= reorder_level
  ),
  expiring_top AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', COALESCE(p.name,'—'),
      'batch', b.batch_no,
      'days', GREATEST(0, (b.expiry_date - current_date))
    ) ORDER BY b.expiry_date ASC), '[]'::jsonb) AS rows
    FROM (
      SELECT * FROM batches
      WHERE tenant_id = _tenant_id AND qty_on_hand > 0
        AND expiry_date >= current_date AND expiry_date <= _in30
      ORDER BY expiry_date ASC LIMIT 5
    ) b
    LEFT JOIN products p ON p.id = b.product_id
  ),
  cancelled_30 AS (
    SELECT COUNT(*) AS cnt, COALESCE(SUM(total),0)::numeric AS amount
    FROM sales WHERE tenant_id = _tenant_id AND status = 'void' AND created_at >= _d30
  ),
  sale_costs_30 AS (
    SELECT si.sale_id, SUM(si.unit_cost * si.qty)::numeric AS cost
    FROM sale_items si
    WHERE si.tenant_id = _tenant_id AND si.created_at >= _d30
    GROUP BY si.sale_id
  ),
  sales30 AS (
    SELECT date_trunc('day', s.created_at)::date AS d,
           COALESCE(SUM(s.total),0)::numeric AS sales,
           COALESCE(SUM(sc.cost),0)::numeric AS cost
    FROM sales s
    LEFT JOIN sale_costs_30 sc ON sc.sale_id = s.id
    WHERE s.tenant_id = _tenant_id AND s.status <> 'void' AND s.created_at >= _d30
    GROUP BY 1
  ),
  daily_sales AS (
    SELECT jsonb_agg(jsonb_build_object(
      'day', to_char(g.day,'MM-DD'),
      'sales', COALESCE(s.sales,0),
      'profit', GREATEST(0, COALESCE(s.sales,0) - COALESCE(s.cost,0))
    ) ORDER BY g.day) AS rows
    FROM generate_series(_d30::date, _today::date, interval '1 day') AS g(day)
    LEFT JOIN sales30 s ON s.d = g.day::date
  ),
  monthly AS (
    SELECT jsonb_agg(jsonb_build_object(
      'm', to_char(g.m,'Mon'),
      'sales', COALESCE(ms.sales,0),
      'purchase', COALESCE(mp.purchase,0),
      'profit', GREATEST(0, COALESCE(ms.sales,0) - COALESCE(mp.purchase,0))
    ) ORDER BY g.m) AS rows
    FROM generate_series(_d12mo, _mtd, interval '1 month') AS g(m)
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(total),0)::numeric AS sales FROM sales
      WHERE tenant_id = _tenant_id AND status <> 'void'
        AND created_at >= g.m AND created_at < g.m + interval '1 month'
    ) ms ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(total),0)::numeric AS purchase FROM purchases
      WHERE tenant_id = _tenant_id
        AND created_at >= g.m AND created_at < g.m + interval '1 month'
    ) mp ON true
  ),
  mtd_sales AS (
    SELECT id, total, customer_id, created_at FROM sales
    WHERE tenant_id = _tenant_id AND status <> 'void' AND created_at >= _mtd
  ),
  period_today AS (
    SELECT COALESCE(SUM(total),0)::numeric AS amount, COUNT(*) AS inv, COUNT(DISTINCT customer_id) AS cust
    FROM mtd_sales WHERE created_at >= _today AND created_at < _tomorrow
  ),
  period_yest AS (
    SELECT COALESCE(SUM(total),0)::numeric AS amount, COUNT(*) AS inv, COUNT(DISTINCT customer_id) AS cust
    FROM sales WHERE tenant_id = _tenant_id AND status <> 'void'
      AND created_at >= _yesterday AND created_at < _today
  ),
  period_l7 AS (
    SELECT COALESCE(SUM(total),0)::numeric AS amount, COUNT(*) AS inv, COUNT(DISTINCT customer_id) AS cust
    FROM sales WHERE tenant_id = _tenant_id AND status <> 'void'
      AND created_at >= _last7 AND created_at < _tomorrow
  ),
  period_mtd AS (
    SELECT COALESCE(SUM(total),0)::numeric AS amount, COUNT(*) AS inv, COUNT(DISTINCT customer_id) AS cust
    FROM mtd_sales
  ),
  recent_sales AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', s.id, 'invoice', s.invoice_no,
      'customer', COALESCE(c.name,'Walk-in'),
      'total', s.total, 'paid', s.paid, 'at', s.created_at
    ) ORDER BY s.created_at DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT * FROM sales WHERE tenant_id = _tenant_id
      ORDER BY created_at DESC LIMIT 6
    ) s LEFT JOIN customers c ON c.id = s.customer_id
  ),
  recent_purchases AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', p.id, 'invoice', p.invoice_no,
      'supplier', COALESCE(sup.name,'—'),
      'total', p.total, 'at', p.created_at
    ) ORDER BY p.created_at DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT * FROM purchases WHERE tenant_id = _tenant_id
      ORDER BY created_at DESC LIMIT 6
    ) p LEFT JOIN suppliers sup ON sup.id = p.supplier_id
  ),
  top_items_raw AS (
    SELECT p.name AS prod_name, m.name AS mfr_name,
           SUM(si.qty) AS qty, SUM(si.line_total) AS revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN products p ON p.id = si.product_id
    LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
    WHERE si.tenant_id = _tenant_id AND s.status <> 'void' AND si.created_at >= _d30
    GROUP BY p.name, m.name
  ),
  top_medicines AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', COALESCE(prod_name,'—'), 'qty', SUM(qty), 'revenue', SUM(revenue)
    ) ORDER BY SUM(revenue) DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT prod_name, SUM(qty) AS qty, SUM(revenue) AS revenue
      FROM top_items_raw GROUP BY prod_name
      ORDER BY SUM(revenue) DESC LIMIT 5
    ) x GROUP BY ()
  ),
  top_companies AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', mfr_name, 'revenue', SUM(revenue)
    ) ORDER BY SUM(revenue) DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT mfr_name, SUM(revenue) AS revenue
      FROM top_items_raw WHERE mfr_name IS NOT NULL GROUP BY mfr_name
      ORDER BY SUM(revenue) DESC LIMIT 5
    ) x GROUP BY ()
  ),
  cust_due_top AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'due',due_balance)
                              ORDER BY due_balance DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT id,name,due_balance FROM customers
      WHERE tenant_id = _tenant_id AND due_balance > 0
      ORDER BY due_balance DESC LIMIT 5
    ) x
  ),
  sup_due_top AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'due',due_balance)
                              ORDER BY due_balance DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT id,name,due_balance FROM suppliers
      WHERE tenant_id = _tenant_id AND due_balance > 0
      ORDER BY due_balance DESC LIMIT 5
    ) x
  ),
  cust_due_total AS (
    SELECT COALESCE(SUM(due_balance),0)::numeric AS total
    FROM customers WHERE tenant_id = _tenant_id AND due_balance > 0
  ),
  sup_due_total AS (
    SELECT COALESCE(SUM(due_balance),0)::numeric AS total
    FROM suppliers WHERE tenant_id = _tenant_id AND due_balance > 0
  ),
  recalled AS (
    SELECT COUNT(*) AS cnt FROM batch_recalls
    WHERE tenant_id = _tenant_id AND status <> 'completed'
  ),
  pending_po AS (
    SELECT COUNT(*) AS cnt FROM purchase_orders
    WHERE tenant_id = _tenant_id AND status IN ('draft','sent')
  ),
  pending_grn AS (
    SELECT COUNT(*) AS cnt FROM goods_receipts
    WHERE tenant_id = _tenant_id AND status = 'draft'
  ),
  pending_xfer AS (
    SELECT COUNT(*) AS cnt FROM stock_transfers
    WHERE tenant_id = _tenant_id AND status IN ('requested','in_transit')
  ),
  cat_inv AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'value', value)
                              ORDER BY value DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT COALESCE(c.name,'Uncategorized') AS name,
             SUM(b.qty_on_hand * b.purchase_price)::numeric AS value
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN batches b ON b.product_id = p.id AND b.tenant_id = _tenant_id
      WHERE p.tenant_id = _tenant_id
      GROUP BY COALESCE(c.name,'Uncategorized')
      HAVING SUM(b.qty_on_hand * b.purchase_price) > 0
      ORDER BY value DESC LIMIT 8
    ) y
  ),
  notif_unread AS (
    SELECT COUNT(*) AS cnt FROM notifications
    WHERE tenant_id = _tenant_id AND user_id = _uid AND read_at IS NULL
  ),
  notif_recent AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'type', type, 'title', title, 'body', body,
      'link', link, 'created_at', created_at,
      'read', (read_at IS NOT NULL)
    ) ORDER BY created_at DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT * FROM notifications
      WHERE tenant_id = _tenant_id AND user_id = _uid
      ORDER BY created_at DESC LIMIT 10
    ) n
  )
  SELECT jsonb_build_object(
    'tenantName', (SELECT name FROM t),
    'kpi', jsonb_build_object(
      'todaySales', (SELECT total FROM s_today),
      'todayPurchase', (SELECT total FROM p_today),
      'todayProfit', GREATEST(0, (SELECT total FROM s_today) - (SELECT total FROM p_today)),
      'cashInHand', (SELECT cash FROM cash_today),
      'dueCollection', (SELECT amount FROM due_today),
      'totalCustomers', (SELECT cust FROM counts),
      'totalSuppliers', (SELECT sup FROM counts),
      'totalProducts', (SELECT prod FROM counts),
      'lowStock', (SELECT cnt FROM low_stock_count),
      'expired', (SELECT expired FROM batches_agg),
      'nearExpiry', (SELECT near_exp FROM batches_agg),
      'cancelledCount', (SELECT cnt FROM cancelled_30),
      'cancelledAmount', (SELECT amount FROM cancelled_30),
      'customerDueTotal', (SELECT total FROM cust_due_total),
      'supplierDueTotal', (SELECT total FROM sup_due_total),
      'inventoryValue', (SELECT inv_value FROM batches_agg),
      'recalledCount', (SELECT cnt FROM recalled),
      'pendingPOs', (SELECT cnt FROM pending_po),
      'pendingGRNs', (SELECT cnt FROM pending_grn),
      'pendingTransfers', (SELECT cnt FROM pending_xfer)
    ),
    'sales', jsonb_build_object(
      'today',     jsonb_build_object('amount',(SELECT amount FROM period_today),'invoices',(SELECT inv FROM period_today),'customers',(SELECT cust FROM period_today)),
      'yesterday', jsonb_build_object('amount',(SELECT amount FROM period_yest), 'invoices',(SELECT inv FROM period_yest), 'customers',(SELECT cust FROM period_yest)),
      'last7',     jsonb_build_object('amount',(SELECT amount FROM period_l7),   'invoices',(SELECT inv FROM period_l7),   'customers',(SELECT cust FROM period_l7)),
      'mtd',       jsonb_build_object('amount',(SELECT amount FROM period_mtd),  'invoices',(SELECT inv FROM period_mtd),  'customers',(SELECT cust FROM period_mtd))
    ),
    'dailySales',        COALESCE((SELECT rows FROM daily_sales),'[]'::jsonb),
    'monthly',           COALESCE((SELECT rows FROM monthly),'[]'::jsonb),
    'lowStockTop',       COALESCE((SELECT rows FROM low_stock_top),'[]'::jsonb),
    'expiringTop',       COALESCE((SELECT rows FROM expiring_top),'[]'::jsonb),
    'recentSales',       COALESCE((SELECT rows FROM recent_sales),'[]'::jsonb),
    'recentPurchases',   COALESCE((SELECT rows FROM recent_purchases),'[]'::jsonb),
    'topMedicines',      COALESCE((SELECT rows FROM top_medicines),'[]'::jsonb),
    'topCompanies',      COALESCE((SELECT rows FROM top_companies),'[]'::jsonb),
    'categoryInventory', COALESCE((SELECT rows FROM cat_inv),'[]'::jsonb),
    'customerDueTop',    COALESCE((SELECT rows FROM cust_due_top),'[]'::jsonb),
    'supplierDueTop',    COALESCE((SELECT rows FROM sup_due_top),'[]'::jsonb),
    'notifications',     jsonb_build_object(
      'unread', (SELECT cnt FROM notif_unread),
      'items',  COALESCE((SELECT rows FROM notif_recent),'[]'::jsonb)
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_store_dashboard_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_dashboard_v2(uuid) TO authenticated, service_role;