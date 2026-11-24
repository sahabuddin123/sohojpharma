CREATE OR REPLACE FUNCTION public.provision_catalog_for_tenant(_tenant_id uuid, _branch_id uuid, _limit int DEFAULT 5000)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Ensure Manufacturers exist for this tenant by copying from global_manufacturers
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

  -- 2. Ensure Generics exist for this tenant by copying from global_generics
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

  -- 3. Insert Products for this tenant using the mapped local manufacturers and generics
  INSERT INTO public.products (
    tenant_id, branch_id, name, strength, medicine_type,
    manufacturer_id, generic_id, global_medicine_id,
    status, is_active, sku, barcode, retail_price, purchase_price, unit, pack_size, qty_per_box
  )
  SELECT 
    _tenant_id,
    _branch_id,
    gm.brand_name,
    gm.strength,
    gm.dosage_form,
    (SELECT m.id FROM public.manufacturers m WHERE m.tenant_id = _tenant_id AND lower(m.name) = lower(gm_mfr.name) AND m.deleted_at IS NULL LIMIT 1),
    (SELECT g.id FROM public.generics g WHERE g.tenant_id = _tenant_id AND lower(g.name) = lower(gm_gen.name) AND g.deleted_at IS NULL LIMIT 1),
    gm.id,
    'active',
    true,
    'GM-' || gm.id || '-' || substr(_tenant_id::text, 1, 4),
    (SELECT barcode FROM public.global_barcodes gb WHERE gb.global_medicine_id = gm.id LIMIT 1),
    0, 0, 'Pcs', 1, 1
  FROM public.global_medicines gm
  LEFT JOIN public.global_manufacturers gm_mfr ON gm_mfr.id = gm.manufacturer_id
  LEFT JOIN public.global_generics gm_gen ON gm_gen.id = gm.generic_id
  WHERE gm.approved = true
  AND NOT EXISTS (
    SELECT 1 FROM public.products p 
    WHERE p.tenant_id = _tenant_id 
    AND lower(p.name) = lower(gm.brand_name)
    AND COALESCE(lower(p.strength), '') = COALESCE(lower(gm.strength), '')
    AND p.global_medicine_id IS NOT NULL
    AND p.deleted_at IS NULL
  )
  LIMIT _limit
  ON CONFLICT (tenant_id, name, COALESCE(strength, '')) WHERE deleted_at IS NULL
  DO UPDATE SET 
    global_medicine_id = EXCLUDED.global_medicine_id,
    manufacturer_id = COALESCE(public.products.manufacturer_id, EXCLUDED.manufacturer_id),
    generic_id = COALESCE(public.products.generic_id, EXCLUDED.generic_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_catalog_for_tenant(uuid, uuid, int) TO service_role;
