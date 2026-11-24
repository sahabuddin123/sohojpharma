
-- Single source of truth for customer due balance.
-- Formula: opening_balance + Σ sales.total (active non-return) - Σ sales_returns.(total - refunded_amount) - Σ ALL customer_payments.amount
--
-- Previous version used SUM(sales.due) - SUM(payments WHERE sale_id IS NULL).
-- That double-counted collections: collect_customer_due() reduces sales.due AND inserts customer_payments.

CREATE OR REPLACE FUNCTION public.customer_due_summary(p_customer_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
      COALESCE((SELECT opening_balance FROM customers WHERE id = p_customer_id), 0)
    + COALESCE((SELECT SUM(total) FROM sales
                  WHERE customer_id = p_customer_id
                    AND COALESCE(is_return, false) = false
                    AND status NOT IN ('void','draft')), 0)
    - COALESCE((SELECT SUM(GREATEST(COALESCE(total,0) - COALESCE(refunded_amount,0), 0))
                  FROM sales_returns
                  WHERE customer_id = p_customer_id), 0)
    - COALESCE((SELECT SUM(amount) FROM customer_payments
                  WHERE customer_id = p_customer_id), 0);
$$;

-- Recalc trigger also for sales_returns
CREATE OR REPLACE FUNCTION public.trg_sales_returns_recalc_due()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='DELETE' THEN PERFORM public.recalc_customer_due(OLD.customer_id); RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM public.recalc_customer_due(OLD.customer_id);
  END IF;
  PERFORM public.recalc_customer_due(NEW.customer_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sales_returns_recalc_due ON public.sales_returns;
CREATE TRIGGER sales_returns_recalc_due AFTER INSERT OR UPDATE OR DELETE ON public.sales_returns
FOR EACH ROW EXECUTE FUNCTION public.trg_sales_returns_recalc_due();

-- Reconciliation view: stored_due vs calculated_due
CREATE OR REPLACE VIEW public.v_customer_due_reconciliation AS
SELECT
  c.id AS customer_id,
  c.tenant_id,
  c.name,
  c.due_balance AS stored_due,
  public.customer_due_summary(c.id) AS calculated_due,
  (c.due_balance - public.customer_due_summary(c.id)) AS variance
FROM public.customers c;

GRANT SELECT ON public.v_customer_due_reconciliation TO authenticated;

-- Backfill stored due_balance from new source of truth
UPDATE public.customers SET due_balance = public.customer_due_summary(id), updated_at = now();
