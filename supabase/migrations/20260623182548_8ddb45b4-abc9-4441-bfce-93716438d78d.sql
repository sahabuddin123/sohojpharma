-- Phase B1: SECURITY DEFINER RPC for FEFO batch lookup used by the barcode module.
-- Does not relax batches RLS. Caller must be a member of the tenant and have access
-- to at least one of the batch's branches (enforced via user_can_access_branch).
CREATE OR REPLACE FUNCTION public.get_product_batch_for_barcode(
  _tenant_id uuid,
  _product_id uuid
)
RETURNS TABLE (
  batch_no text,
  expiry_date date,
  warehouse_id uuid,
  warehouse_name text,
  qty_on_hand numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RETURN QUERY SELECT NULL::text, NULL::date, NULL::uuid, NULL::text, 0::numeric;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.batch_no,
    b.expiry_date,
    b.warehouse_id,
    w.name AS warehouse_name,
    b.qty_on_hand
  FROM public.batches b
  LEFT JOIN public.warehouses w ON w.id = b.warehouse_id
  WHERE b.tenant_id = _tenant_id
    AND b.product_id = _product_id
    AND b.deleted_at IS NULL
    AND b.qty_on_hand > 0
    AND b.expiry_date >= CURRENT_DATE
    AND public.user_can_access_branch(b.tenant_id, b.branch_id)
  ORDER BY b.expiry_date ASC, b.created_at ASC
  LIMIT 1;

  -- Fallback row when nothing matched
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, NULL::date, NULL::uuid, NULL::text, 0::numeric;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_product_batch_for_barcode(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_batch_for_barcode(uuid, uuid) TO authenticated, service_role;

-- Phase B6: tenant-scoped auto barcode number generator (PHM00000001 ...)
CREATE OR REPLACE FUNCTION public.next_auto_barcode(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num bigint;
  candidate text;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  LOOP
    SELECT COALESCE(MAX(
      NULLIF(regexp_replace(barcode, '^PHM0*', ''), '')::bigint
    ), 0) + 1
      INTO next_num
    FROM public.products
    WHERE tenant_id = _tenant_id
      AND barcode ~ '^PHM[0-9]+$';

    candidate := 'PHM' || lpad(next_num::text, 8, '0');

    -- Guard against race / collisions across products + product_barcodes
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE tenant_id = _tenant_id AND barcode = candidate
    ) AND NOT EXISTS (
      SELECT 1 FROM public.product_barcodes
      WHERE tenant_id = _tenant_id AND barcode = candidate
    ) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.next_auto_barcode(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_auto_barcode(uuid) TO authenticated, service_role;
