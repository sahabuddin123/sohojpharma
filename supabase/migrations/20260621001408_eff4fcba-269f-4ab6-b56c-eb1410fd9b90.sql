
CREATE OR REPLACE FUNCTION public.customer_due_summary(p_customer_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT opening_balance FROM customers WHERE id = p_customer_id), 0)
       + COALESCE((SELECT SUM(due) FROM sales
                    WHERE customer_id = p_customer_id
                      AND COALESCE(is_return, false) = false
                      AND status NOT IN ('void','draft')), 0)
       - COALESCE((SELECT SUM(amount) FROM customer_payments
                    WHERE customer_id = p_customer_id AND sale_id IS NULL), 0);
$$;
GRANT EXECUTE ON FUNCTION public.customer_due_summary(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalc_customer_due(p_customer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_customer_id IS NULL THEN RETURN; END IF;
  UPDATE customers SET due_balance = public.customer_due_summary(p_customer_id), updated_at = now() WHERE id = p_customer_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sales_recalc_due()
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

DROP TRIGGER IF EXISTS sales_recalc_due ON public.sales;
CREATE TRIGGER sales_recalc_due AFTER INSERT OR UPDATE OR DELETE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.trg_sales_recalc_due();

CREATE OR REPLACE FUNCTION public.trg_customer_payments_recalc_due()
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

DROP TRIGGER IF EXISTS customer_payments_recalc_due ON public.customer_payments;
CREATE TRIGGER customer_payments_recalc_due AFTER INSERT OR UPDATE OR DELETE ON public.customer_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_customer_payments_recalc_due();

-- Backfill payment history (skip journal posting trigger for historical rows that lack journal accounts)
ALTER TABLE public.customer_payments DISABLE TRIGGER trg_je_collection;

INSERT INTO public.customer_payments
  (tenant_id, customer_id, sale_id, payment_date, amount, method, reference, collected_by, created_at)
SELECT sp.tenant_id, s.customer_id, sp.sale_id,
       COALESCE(sp.paid_at::date, sp.created_at::date),
       sp.amount, sp.method, sp.reference, sp.created_by, sp.created_at
FROM public.sale_payments sp
JOIN public.sales s ON s.id = sp.sale_id
LEFT JOIN public.customer_payments cp
  ON cp.sale_id = sp.sale_id AND cp.amount = sp.amount
 AND cp.method = sp.method AND COALESCE(cp.reference,'') = COALESCE(sp.reference,'')
WHERE s.customer_id IS NOT NULL AND cp.id IS NULL;

ALTER TABLE public.customer_payments ENABLE TRIGGER trg_je_collection;

UPDATE public.customers SET due_balance = public.customer_due_summary(id), updated_at = now();
