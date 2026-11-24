CREATE OR REPLACE FUNCTION public.provision_catalog_for_tenant(_tenant_id uuid, _branch_id uuid, _limit int DEFAULT 5000)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.manufacturers (tenant_id, name)
  SELECT DISTINCT _tenant_id, gm_mfr.name
  FROM public.global_medicines gm
  JOIN public.global_manufacturers gm_mfr ON gm_mfr.id = gm.manufacturer_id
  WHERE gm.approved = true
  AND NOT EXISTS (
    SELECT 1 FROM public.manufacturers m
    WHERE m.tenant_id = _tenant_id AND lower(m.name) = lower(gm_mfr.name) AND m.deleted_at IS NULL
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.generics (tenant_id, name)
  SELECT DISTINCT _tenant_id, gm_gen.name
  FROM public.global_medicines gm
  JOIN public.global_generics gm_gen ON gm_gen.id = gm.generic_id
  WHERE gm.approved = true
  AND NOT EXISTS (
    SELECT 1 FROM public.generics g
    WHERE g.tenant_id = _tenant_id AND lower(g.name) = lower(gm_gen.name) AND g.deleted_at IS NULL
  )
  ON CONFLICT DO NOTHING;

  -- Link already-existing local products to their global medicine
  UPDATE public.products p
  SET global_medicine_id = gm.id
  FROM public.global_medicines gm
  WHERE p.tenant_id = _tenant_id
    AND p.deleted_at IS NULL
    AND p.global_medicine_id IS NULL
    AND gm.approved = true
    AND lower(btrim(p.name)) = lower(btrim(gm.brand_name))
    AND lower(coalesce(btrim(p.strength), '')) = lower(coalesce(btrim(gm.strength), ''));

  -- Insert missing catalog medicines for this tenant
  INSERT INTO public.products (
    tenant_id, branch_id, name, strength, medicine_type,
    manufacturer_id, generic_id, global_medicine_id,
    status, is_active, sku, barcode, retail_price, purchase_price, unit, pack_size, qty_per_box
  )
  SELECT
    _tenant_id, _branch_id, gm.brand_name, gm.strength, gm.dosage_form,
    (SELECT m.id FROM public.manufacturers m WHERE m.tenant_id = _tenant_id AND lower(m.name) = lower(gm_mfr.name) AND m.deleted_at IS NULL LIMIT 1),
    (SELECT g.id FROM public.generics g WHERE g.tenant_id = _tenant_id AND lower(g.name) = lower(gm_gen.name) AND g.deleted_at IS NULL LIMIT 1),
    gm.id, 'active', true,
    'GM-' || gm.id || '-' || substr(_tenant_id::text, 1, 4),
    (SELECT gb.barcode FROM public.global_barcodes gb WHERE gb.global_medicine_id = gm.id LIMIT 1),
    0, 0, 'Pcs', 1, 1
  FROM public.global_medicines gm
  LEFT JOIN public.global_manufacturers gm_mfr ON gm_mfr.id = gm.manufacturer_id
  LEFT JOIN public.global_generics gm_gen ON gm_gen.id = gm.generic_id
  WHERE gm.approved = true
  AND NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.tenant_id = _tenant_id
      AND p.deleted_at IS NULL
      AND (p.global_medicine_id = gm.id
           OR (lower(btrim(p.name)) = lower(btrim(gm.brand_name))
               AND lower(coalesce(btrim(p.strength), '')) = lower(coalesce(btrim(gm.strength), ''))))
  )
  LIMIT _limit
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_catalog_for_tenant(uuid, uuid, int) TO service_role;