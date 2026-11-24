CREATE OR REPLACE FUNCTION public.tg_lock_batch_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  IF NEW.purchase_price IS NOT DISTINCT FROM OLD.purchase_price THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.qty_on_hand, 0) = 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.app_admins WHERE user_id = auth.uid()
    ) INTO v_is_admin;
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Batch cost cannot be modified after stock creation';
END;
$$;

DROP TRIGGER IF EXISTS tg_lock_batch_cost ON public.batches;
CREATE TRIGGER tg_lock_batch_cost
BEFORE UPDATE OF purchase_price ON public.batches
FOR EACH ROW
EXECUTE FUNCTION public.tg_lock_batch_cost();