-- Fix double-counting of customer_payments (sale_id IS NULL) in customer_due_summary.
-- collect_customer_due() already allocates payments into sales.paid (reducing sales.total - sales.paid),
-- so subtracting customer_payments WHERE sale_id IS NULL again caused paid dues to show as negative (Advance).

CREATE OR REPLACE FUNCTION public.customer_due_summary(p_customer_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ROUND(
      COALESCE((SELECT opening_balance FROM customers WHERE id = p_customer_id), 0)
    + COALESCE((SELECT SUM(GREATEST(COALESCE(total,0) - COALESCE(paid,0), 0))
                  FROM sales
                  WHERE customer_id = p_customer_id
                    AND COALESCE(is_return, false) = false
                    AND status::text NOT IN ('void','draft','cancelled')), 0)
    - COALESCE((SELECT SUM(GREATEST(COALESCE(total,0) - COALESCE(refunded_amount,0), 0))
                  FROM sales_returns
                  WHERE customer_id = p_customer_id), 0)
  , 2);
$function$;

UPDATE public.customers c
SET due_balance = public.customer_due_summary(c.id);
