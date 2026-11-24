INSERT INTO public.manufacturers (tenant_id, name)
SELECT DISTINCT 'f1c63c79-32cf-4eed-b6cd-d6160184f18e'::uuid, gm_mfr.name
FROM public.global_medicines gm
JOIN public.global_manufacturers gm_mfr ON gm_mfr.id = gm.manufacturer_id
WHERE gm.approved = true
AND NOT EXISTS (
  SELECT 1 FROM public.manufacturers m 
  WHERE m.tenant_id = 'f1c63c79-32cf-4eed-b6cd-d6160184f18e'::uuid AND lower(m.name) = lower(gm_mfr.name) AND m.deleted_at IS NULL
)
ON CONFLICT DO NOTHING;

INSERT INTO public.generics (tenant_id, name)
SELECT DISTINCT 'f1c63c79-32cf-4eed-b6cd-d6160184f18e'::uuid, gm_gen.name
FROM public.global_medicines gm
JOIN public.global_generics gm_gen ON gm_gen.id = gm.generic_id
WHERE gm.approved = true
AND NOT EXISTS (
  SELECT 1 FROM public.generics g 
  WHERE g.tenant_id = 'f1c63c79-32cf-4eed-b6cd-d6160184f18e'::uuid AND lower(g.name) = lower(gm_gen.name) AND g.deleted_at IS NULL
)
ON CONFLICT DO NOTHING;

INSERT INTO public.products (
  tenant_id, branch_id, name, strength, medicine_type,
  manufacturer_id, generic_id, global_medicine_id,
  status, is_active, sku, barcode, retail_price, purchase_price, unit, pack_size, qty_per_box
)
SELECT 
  'f1c63c79-32cf-4eed-b6cd-d6160184f18e'::uuid,
  '950b36dc-1347-4ef8-8c8c-5c7bb6c2e8ac'::uuid,
  gm.brand_name,
  gm.strength,
  gm.dosage_form,
  (SELECT m.id FROM public.manufacturers m WHERE m.tenant_id = 'f1c63c79-32cf-4eed-b6cd-d6160184f18e'::uuid AND lower(m.name) = lower(gm_mfr.name) AND m.deleted_at IS NULL LIMIT 1),
  (SELECT g.id FROM public.generics g WHERE g.tenant_id = 'f1c63c79-32cf-4eed-b6cd-d6160184f18e'::uuid AND lower(g.name) = lower(gm_gen.name) AND g.deleted_at IS NULL LIMIT 1),
  gm.id,
  'active',
  true,
  'GM-' || gm.id || '-' || substr('f1c63c79-32cf-4eed-b6cd-d6160184f18e'::text, 1, 4),
  (SELECT barcode FROM public.global_barcodes gb WHERE gb.global_medicine_id = gm.id LIMIT 1),
  0, 0, 'Pcs', 1, 1
FROM public.global_medicines gm
LEFT JOIN public.global_manufacturers gm_mfr ON gm_mfr.id = gm.manufacturer_id
LEFT JOIN public.global_generics gm_gen ON gm_gen.id = gm.generic_id
WHERE gm.approved = true
AND NOT EXISTS (
  SELECT 1 FROM public.products p 
  WHERE p.tenant_id = 'f1c63c79-32cf-4eed-b6cd-d6160184f18e'::uuid 
  AND (
    p.global_medicine_id = gm.id 
    OR (lower(p.name) = lower(gm.brand_name) AND ( (p.strength IS NULL AND gm.strength IS NULL) OR (lower(p.strength) = lower(gm.strength)) ))
  )
  AND p.deleted_at IS NULL
)
LIMIT 5000;