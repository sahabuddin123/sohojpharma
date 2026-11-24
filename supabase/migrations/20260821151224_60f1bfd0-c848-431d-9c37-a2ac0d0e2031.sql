CREATE OR REPLACE FUNCTION public.provision_full_catalog_for_tenant(_tenant_id uuid, _branch_id uuid, _limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _n integer := 0;
BEGIN
  -- masters
  INSERT INTO public.manufacturers (tenant_id, name)
  SELECT DISTINCT _tenant_id, gmf.name
  FROM public.global_medicines gm
  JOIN public.global_manufacturers gmf ON gmf.id = gm.manufacturer_id
  WHERE gm.approved = true
    AND NOT EXISTS (SELECT 1 FROM public.manufacturers m WHERE m.tenant_id = _tenant_id AND lower(m.name) = lower(gmf.name) AND m.deleted_at IS NULL)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.generics (tenant_id, name)
  SELECT DISTINCT _tenant_id, gg.name
  FROM public.global_medicines gm
  JOIN public.global_generics gg ON gg.id = gm.generic_id
  WHERE gm.approved = true
    AND NOT EXISTS (SELECT 1 FROM public.generics g WHERE g.tenant_id = _tenant_id AND lower(g.name) = lower(gg.name) AND g.deleted_at IS NULL)
  ON CONFLICT DO NOTHING;

  WITH src AS (
    SELECT DISTINCT ON (lower(btrim(gm.brand_name)), lower(coalesce(btrim(gm.strength),'')), coalesce(lm.id::text,''), coalesce(lg.id::text,''))
      gm.id AS gid, gm.brand_name, gm.strength, gm.dosage_form,
      lm.id AS mfr_id, lg.id AS gen_id,
      (SELECT gb.barcode FROM public.global_barcodes gb WHERE gb.global_medicine_id = gm.id LIMIT 1) AS barcode,
      (SELECT max(op.retail_price) FROM public.products op WHERE op.global_medicine_id = gm.id AND op.tenant_id <> _tenant_id AND op.deleted_at IS NULL AND op.retail_price > 0) AS ext_retail,
      (SELECT max(op.purchase_price) FROM public.products op WHERE op.global_medicine_id = gm.id AND op.tenant_id <> _tenant_id AND op.deleted_at IS NULL AND op.purchase_price > 0) AS ext_purchase,
      (SELECT op.unit FROM public.products op WHERE op.global_medicine_id = gm.id AND op.tenant_id <> _tenant_id AND op.deleted_at IS NULL AND op.unit IS NOT NULL LIMIT 1) AS ext_unit
    FROM public.global_medicines gm
    LEFT JOIN public.global_manufacturers gmf ON gmf.id = gm.manufacturer_id
    LEFT JOIN public.global_generics gg ON gg.id = gm.generic_id
    LEFT JOIN public.manufacturers lm ON lm.tenant_id = _tenant_id AND lower(lm.name) = lower(gmf.name) AND lm.deleted_at IS NULL
    LEFT JOIN public.generics lg ON lg.tenant_id = _tenant_id AND lower(lg.name) = lower(gg.name) AND lg.deleted_at IS NULL
    WHERE gm.approved = true
      AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.tenant_id = _tenant_id AND p.deleted_at IS NULL AND p.global_medicine_id = gm.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.products p2
        WHERE p2.tenant_id = _tenant_id AND p2.deleted_at IS NULL
          AND lower(btrim(p2.name)) = lower(btrim(gm.brand_name))
          AND lower(coalesce(btrim(p2.strength),'')) = lower(coalesce(btrim(gm.strength),''))
      )
    LIMIT _limit
  ), dedup_bc AS (
    SELECT src.*,
      CASE WHEN src.barcode IS NULL THEN NULL
           WHEN EXISTS (SELECT 1 FROM public.products pb WHERE pb.tenant_id = _tenant_id AND pb.deleted_at IS NULL AND pb.barcode = src.barcode) THEN NULL
           WHEN row_number() OVER (PARTITION BY src.barcode ORDER BY src.gid) > 1 THEN NULL
           ELSE src.barcode END AS safe_barcode
    FROM src
  )
  INSERT INTO public.products (
    tenant_id, branch_id, name, strength, medicine_type,
    manufacturer_id, generic_id, global_medicine_id,
    status, is_active, sku, barcode, retail_price, purchase_price, unit, pack_size, qty_per_box
  )
  SELECT _tenant_id, _branch_id, d.brand_name, d.strength, d.dosage_form,
         d.mfr_id, d.gen_id, d.gid, 'active', true,
         'GM-' || d.gid || '-' || substr(_tenant_id::text, 1, 4),
         d.safe_barcode,
         coalesce(d.ext_retail, 0), coalesce(d.ext_purchase, 0),
         coalesce(d.ext_unit, 'Pcs'), 1, 1
  FROM dedup_bc d
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.provision_full_catalog_for_tenant(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;