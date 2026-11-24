CREATE OR REPLACE FUNCTION public.upsert_product_barcodes(_rows jsonb)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate tenant membership for every distinct tenant_id in payload
  FOR v_tenant IN SELECT DISTINCT (r->>'tenant_id')::uuid FROM jsonb_array_elements(_rows) r LOOP
    IF NOT public.is_tenant_member(v_uid, v_tenant) THEN
      RAISE EXCEPTION 'Forbidden: not a member of tenant %', v_tenant;
    END IF;
  END LOOP;

  RETURN QUERY
  INSERT INTO public.product_barcodes (
    tenant_id, branch_id, product_id, barcode, barcode_type,
    is_primary, status, created_by, updated_by, import_batch_id
  )
  SELECT
    (r->>'tenant_id')::uuid,
    NULLIF(r->>'branch_id','')::uuid,
    (r->>'product_id')::uuid,
    r->>'barcode',
    COALESCE(r->>'barcode_type','Code128'),
    COALESCE((r->>'is_primary')::boolean, true),
    COALESCE(r->>'status','active'),
    NULLIF(r->>'created_by','')::uuid,
    NULLIF(r->>'updated_by','')::uuid,
    NULLIF(r->>'import_batch_id','')::uuid
  FROM jsonb_array_elements(_rows) r
  ON CONFLICT (tenant_id, barcode) WHERE deleted_at IS NULL DO NOTHING
  RETURNING public.product_barcodes.id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_product_barcodes(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_product_barcodes(jsonb) TO authenticated;