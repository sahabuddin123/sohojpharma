
CREATE OR REPLACE FUNCTION public.validate_branch_write(_tenant_id uuid, _branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok',false,'code','unauthenticated'); END IF;
  IF _tenant_id IS NULL OR _branch_id IS NULL THEN RETURN jsonb_build_object('ok',false,'code','branch_id_required'); END IF;
  IF public.is_corporate_role(_tenant_id) THEN RETURN jsonb_build_object('ok',true,'scope','corporate'); END IF;
  IF public.has_branch_access(uid,_branch_id) THEN RETURN jsonb_build_object('ok',true,'scope','branch'); END IF;
  RETURN jsonb_build_object('ok',false,'code','branch_access_denied','branch_id',_branch_id);
END $$;
GRANT EXECUTE ON FUNCTION public.validate_branch_write(uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_stock_transfer_state()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); old_s text; new_s text; allowed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL THEN NEW.status := 'requested'; END IF;
    IF NEW.status::text <> 'requested' THEN
      RAISE EXCEPTION 'transfer_invalid_initial_status: %', NEW.status USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
  END IF;
  old_s := OLD.status::text; new_s := NEW.status::text;
  IF old_s = new_s THEN RETURN NEW; END IF;
  IF old_s IN ('received','rejected','cancelled') THEN
    RAISE EXCEPTION 'transfer_state_terminal: %', old_s USING ERRCODE='check_violation';
  END IF;
  allowed := (old_s='requested'  AND new_s IN ('approved','rejected','cancelled'))
          OR (old_s='approved'   AND new_s IN ('in_transit','cancelled'))
          OR (old_s='in_transit' AND new_s='received');
  IF NOT allowed THEN
    RAISE EXCEPTION 'transfer_invalid_transition: % -> %', old_s, new_s USING ERRCODE='check_violation';
  END IF;
  IF uid IS NOT NULL AND NOT public.is_corporate_role(NEW.tenant_id) THEN
    IF new_s IN ('approved','rejected') THEN
      RAISE EXCEPTION 'transfer_requires_corporate_role' USING ERRCODE='insufficient_privilege';
    END IF;
    IF new_s = 'received' AND NOT public.has_branch_access(uid, NEW.to_branch_id) THEN
      RAISE EXCEPTION 'transfer_receive_requires_destination_access' USING ERRCODE='insufficient_privilege';
    END IF;
    IF new_s = 'in_transit' AND NOT public.has_branch_access(uid, NEW.from_branch_id) THEN
      RAISE EXCEPTION 'transfer_ship_requires_source_access' USING ERRCODE='insufficient_privilege';
    END IF;
  END IF;
  IF new_s='approved' THEN NEW.approved_at:=COALESCE(NEW.approved_at,now()); NEW.approved_by:=COALESCE(NEW.approved_by,uid);
  ELSIF new_s='in_transit' THEN NEW.shipped_at:=COALESCE(NEW.shipped_at,now());
  ELSIF new_s='received' THEN NEW.received_at:=COALESCE(NEW.received_at,now()); NEW.received_by:=COALESCE(NEW.received_by,uid);
  ELSIF new_s='rejected' THEN NEW.rejected_at:=COALESCE(NEW.rejected_at,now()); NEW.rejected_by:=COALESCE(NEW.rejected_by,uid);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stock_transfers_state ON public.stock_transfers;
CREATE TRIGGER trg_stock_transfers_state BEFORE INSERT OR UPDATE ON public.stock_transfers
FOR EACH ROW EXECUTE FUNCTION public.enforce_stock_transfer_state();

CREATE OR REPLACE VIEW public.v_sales_daily_by_branch AS
SELECT s.tenant_id, s.branch_id, date_trunc('day', s.sale_date)::date AS day,
  count(*) FILTER (WHERE NOT s.is_return) AS sales_count,
  count(*) FILTER (WHERE s.is_return) AS returns_count,
  coalesce(sum(s.total) FILTER (WHERE NOT s.is_return),0) AS gross_sales,
  coalesce(sum(s.total) FILTER (WHERE s.is_return),0) AS gross_returns,
  coalesce(sum(s.vat) FILTER (WHERE NOT s.is_return),0) AS vat_collected,
  coalesce(sum(s.discount) FILTER (WHERE NOT s.is_return),0) AS discount_total,
  coalesce(sum(s.paid),0) AS paid_total,
  coalesce(sum(s.due),0) AS due_total
FROM public.sales s
WHERE s.status::text <> 'void'
GROUP BY s.tenant_id, s.branch_id, date_trunc('day', s.sale_date);

CREATE OR REPLACE VIEW public.v_inventory_by_branch AS
SELECT ps.tenant_id, ps.branch_id, ps.product_id,
  sum(ps.qty_on_hand) AS qty_on_hand, max(ps.reorder_level) AS reorder_level
FROM public.product_stock ps WHERE ps.deleted_at IS NULL
GROUP BY ps.tenant_id, ps.branch_id, ps.product_id;

CREATE OR REPLACE VIEW public.v_purchase_summary_by_branch AS
SELECT p.tenant_id, p.branch_id, date_trunc('day', p.purchase_date)::date AS day,
  count(*) FILTER (WHERE NOT p.is_return) AS purchase_count,
  count(*) FILTER (WHERE p.is_return) AS return_count,
  coalesce(sum(p.total) FILTER (WHERE NOT p.is_return),0) AS gross_purchases,
  coalesce(sum(p.total) FILTER (WHERE p.is_return),0) AS gross_returns,
  coalesce(sum(p.paid),0) AS paid_total, coalesce(sum(p.due),0) AS due_total
FROM public.purchases p
GROUP BY p.tenant_id, p.branch_id, date_trunc('day', p.purchase_date);

CREATE OR REPLACE VIEW public.v_due_summary_by_branch AS
SELECT tenant_id, branch_id, 'customer'::text AS party_type, coalesce(sum(due),0) AS total_due
FROM public.sales WHERE status::text <> 'void' AND due > 0
GROUP BY tenant_id, branch_id
UNION ALL
SELECT tenant_id, branch_id, 'supplier'::text, coalesce(sum(due),0)
FROM public.purchases WHERE due > 0
GROUP BY tenant_id, branch_id;

CREATE OR REPLACE VIEW public.v_expiry_alert_by_branch AS
SELECT b.tenant_id, b.branch_id, b.product_id, b.id AS batch_id, b.batch_no,
  b.expiry_date, b.qty_on_hand, (b.expiry_date - current_date) AS days_to_expiry
FROM public.batches b
WHERE b.deleted_at IS NULL AND b.qty_on_hand > 0 AND b.expiry_date IS NOT NULL
  AND b.expiry_date <= current_date + INTERVAL '90 days';

CREATE OR REPLACE VIEW public.v_low_stock_by_branch AS
SELECT ps.tenant_id, ps.branch_id, ps.product_id,
  sum(ps.qty_on_hand) AS qty_on_hand, max(ps.reorder_level) AS reorder_level
FROM public.product_stock ps WHERE ps.deleted_at IS NULL
GROUP BY ps.tenant_id, ps.branch_id, ps.product_id
HAVING sum(ps.qty_on_hand) <= max(ps.reorder_level);

CREATE OR REPLACE VIEW public.v_cashflow_by_branch AS
SELECT tenant_id, branch_id, date_trunc('day', payment_date)::date AS day,
  'inflow'::text AS direction, coalesce(sum(amount),0) AS amount
FROM public.customer_payments GROUP BY tenant_id, branch_id, date_trunc('day', payment_date)
UNION ALL
SELECT tenant_id, branch_id, date_trunc('day', payment_date)::date, 'outflow', coalesce(sum(amount),0)
FROM public.supplier_payments GROUP BY tenant_id, branch_id, date_trunc('day', payment_date)
UNION ALL
SELECT tenant_id, branch_id, date_trunc('day', expense_date)::date, 'outflow', coalesce(sum(amount),0)
FROM public.expenses GROUP BY tenant_id, branch_id, date_trunc('day', expense_date)
UNION ALL
SELECT tenant_id, branch_id, date_trunc('day', income_date)::date, 'inflow', coalesce(sum(amount),0)
FROM public.incomes GROUP BY tenant_id, branch_id, date_trunc('day', income_date);

CREATE OR REPLACE VIEW public.v_profit_loss_by_branch AS
WITH rev AS (
  SELECT tenant_id, branch_id, date_trunc('month', sale_date)::date AS month,
    coalesce(sum(CASE WHEN is_return THEN -total ELSE total END),0) AS revenue
  FROM public.sales WHERE status::text <> 'void'
  GROUP BY tenant_id, branch_id, date_trunc('month', sale_date)
),
cogs AS (
  SELECT tenant_id, branch_id, date_trunc('month', purchase_date)::date AS month,
    coalesce(sum(CASE WHEN is_return THEN -total ELSE total END),0) AS cost
  FROM public.purchases
  GROUP BY tenant_id, branch_id, date_trunc('month', purchase_date)
),
exp AS (
  SELECT tenant_id, branch_id, date_trunc('month', expense_date)::date AS month,
    coalesce(sum(amount),0) AS expenses
  FROM public.expenses GROUP BY tenant_id, branch_id, date_trunc('month', expense_date)
),
inc AS (
  SELECT tenant_id, branch_id, date_trunc('month', income_date)::date AS month,
    coalesce(sum(amount),0) AS other_income
  FROM public.incomes GROUP BY tenant_id, branch_id, date_trunc('month', income_date)
)
SELECT
  coalesce(rev.tenant_id, cogs.tenant_id, exp.tenant_id, inc.tenant_id) AS tenant_id,
  coalesce(rev.branch_id, cogs.branch_id, exp.branch_id, inc.branch_id) AS branch_id,
  coalesce(rev.month, cogs.month, exp.month, inc.month) AS month,
  coalesce(rev.revenue,0) AS revenue,
  coalesce(cogs.cost,0) AS cost_of_goods,
  coalesce(exp.expenses,0) AS operating_expenses,
  coalesce(inc.other_income,0) AS other_income,
  coalesce(rev.revenue,0) - coalesce(cogs.cost,0) - coalesce(exp.expenses,0) + coalesce(inc.other_income,0) AS net_profit
FROM rev
FULL OUTER JOIN cogs USING (tenant_id, branch_id, month)
FULL OUTER JOIN exp  USING (tenant_id, branch_id, month)
FULL OUTER JOIN inc  USING (tenant_id, branch_id, month);

GRANT SELECT ON
  public.v_sales_daily_by_branch, public.v_inventory_by_branch,
  public.v_purchase_summary_by_branch, public.v_due_summary_by_branch,
  public.v_expiry_alert_by_branch, public.v_low_stock_by_branch,
  public.v_cashflow_by_branch, public.v_profit_loss_by_branch
TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_branch_isolation_coverage AS
SELECT t.table_name,
  bool_or(c.column_name='tenant_id') AS has_tenant_id,
  bool_or(c.column_name='branch_id') AS has_branch_id,
  CASE WHEN bool_or(c.column_name='branch_id') THEN 'branch_aware'
       WHEN bool_or(c.column_name='tenant_id') THEN 'tenant_only'
       ELSE 'global' END AS scope
FROM information_schema.tables t
LEFT JOIN information_schema.columns c
  ON c.table_schema=t.table_schema AND c.table_name=t.table_name
WHERE t.table_schema='public' AND t.table_type='BASE TABLE'
GROUP BY t.table_name;
GRANT SELECT ON public.v_branch_isolation_coverage TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.audit_branch_null_readiness()
RETURNS TABLE (table_name text, total_rows bigint, branch_id_null_rows bigint, ready_for_not_null boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; total bigint; nulls bigint;
BEGIN
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name=c.table_name AND t.table_schema=c.table_schema
    WHERE c.table_schema='public' AND c.column_name='branch_id' AND t.table_type='BASE TABLE'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('SELECT count(*), count(*) FILTER (WHERE branch_id IS NULL) FROM public.%I', r.table_name)
      INTO total, nulls;
    table_name := r.table_name; total_rows := total;
    branch_id_null_rows := nulls; ready_for_not_null := (nulls=0);
    RETURN NEXT;
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.audit_branch_null_readiness() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.audit_log_event(
  _action text, _entity_type text, _entity_id uuid,
  _tenant_id uuid, _branch_id uuid, _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.audit_log (tenant_id, branch_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (_tenant_id, _branch_id, auth.uid(), _action, _entity_type, _entity_id, coalesce(_metadata,'{}'::jsonb))
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;
GRANT EXECUTE ON FUNCTION public.audit_log_event(text,text,uuid,uuid,uuid,jsonb) TO authenticated, service_role;
