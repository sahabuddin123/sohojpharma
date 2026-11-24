
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
    - COALESCE((SELECT SUM(cp.amount)
                  FROM customer_payments cp
                  LEFT JOIN sales s ON s.id = cp.sale_id
                  WHERE cp.customer_id = p_customer_id
                    AND (cp.sale_id IS NULL OR s.status NOT IN ('void','draft'))
               ), 0);
$$;

UPDATE public.customers SET due_balance = public.customer_due_summary(id), updated_at = now();
