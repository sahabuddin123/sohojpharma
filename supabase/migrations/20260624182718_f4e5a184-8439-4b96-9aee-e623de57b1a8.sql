CREATE OR REPLACE FUNCTION public.increment_supplier_due_balance(_supplier_id uuid, _amount numeric)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.suppliers
     SET due_balance = COALESCE(due_balance, 0) + _amount,
         updated_at = now()
   WHERE id = _supplier_id
  RETURNING due_balance;
$$;

GRANT EXECUTE ON FUNCTION public.increment_supplier_due_balance(uuid, numeric) TO authenticated, service_role;