-- Fix products_friendly_duplicate_check to support replica mode and global provisioning
CREATE OR REPLACE FUNCTION public.products_friendly_duplicate_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('session_replication_role', true) = 'replica' THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Barcode duplicate (active rows)
  IF NEW.barcode IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.products
    WHERE tenant_id = NEW.tenant_id
      AND barcode = NEW.barcode
      AND deleted_at IS NULL
      AND id <> NEW.id
  ) THEN
    IF NEW.global_medicine_id IS NOT NULL THEN
      NEW.barcode := NULL;
    ELSE
      RAISE EXCEPTION 'Product already exists (barcode): এই পণ্যটি ইতোমধ্যে সিস্টেমে বিদ্যমান'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  -- SKU duplicate
  IF EXISTS (
    SELECT 1 FROM public.products
    WHERE tenant_id = NEW.tenant_id
      AND sku = NEW.sku
      AND id <> NEW.id
  ) THEN
    IF NEW.global_medicine_id IS NOT NULL THEN
      NEW.sku := NEW.sku || '-' || substr(gen_random_uuid()::text, 1, 6);
    ELSE
      RAISE EXCEPTION 'Product already exists (sku): এই পণ্যটি ইতোমধ্যে সিস্টেমে বিদ্যমান'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  -- Logical duplicate
  IF EXISTS (
    SELECT 1 FROM public.products
    WHERE tenant_id = NEW.tenant_id
      AND deleted_at IS NULL
      AND id <> NEW.id
      AND lower(btrim(name)) = lower(btrim(NEW.name))
      AND COALESCE(generic_id::text, '') = COALESCE(NEW.generic_id::text, '')
      AND COALESCE(manufacturer_id::text, '') = COALESCE(NEW.manufacturer_id::text, '')
      AND lower(COALESCE(btrim(strength), '')) = lower(COALESCE(btrim(NEW.strength), ''))
  ) THEN
    IF NEW.global_medicine_id IS NOT NULL THEN
      RETURN NULL;
    ELSE
      RAISE EXCEPTION 'Product already exists: এই পণ্যটি ইতোমধ্যে সিস্টেমে বিদ্যমান'
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop any conflicting overloaded signatures
DROP FUNCTION IF EXISTS public.provision_catalog_for_tenant(uuid, uuid);
DROP FUNCTION IF EXISTS public.provision_catalog_for_tenant(uuid, uuid, integer);

-- Create single canonical provision_catalog_for_tenant function with replica configuration
CREATE OR REPLACE FUNCTION public.provision_catalog_for_tenant(
  _tenant_id uuid,
  _branch_id uuid,
  _limit integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET session_replication_role = 'replica'
AS $$
DECLARE
  v_effective_limit integer := COALESCE(_limit, 100000);
BEGIN
  -- 1. Provision default Units if none exist for tenant
  IF NOT EXISTS (SELECT 1 FROM public.units WHERE tenant_id = _tenant_id AND deleted_at IS NULL) THEN
    INSERT INTO public.units (tenant_id, code, name, is_base, is_active, status)
    VALUES
      (_tenant_id, 'pcs', 'PCS', true, true, 'active'),
      (_tenant_id, 'bottle', 'BOTTLE', false, true, 'active'),
      (_tenant_id, 'tube', 'TUBE', false, true, 'active'),
      (_tenant_id, 'box', 'BOX', false, true, 'active'),
      (_tenant_id, 'ampoule', 'AMPOULE', false, true, 'active'),
      (_tenant_id, 'vial', 'VIAL', false, true, 'active')
    ON CONFLICT DO NOTHING;
  END IF;

  -- 2. Provision default Categories if none exist for tenant
  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE tenant_id = _tenant_id AND deleted_at IS NULL) THEN
    INSERT INTO public.categories (tenant_id, name, status)
    VALUES
      (_tenant_id, 'Tablet', 'active'),
      (_tenant_id, 'Capsule', 'active'),
      (_tenant_id, 'Syrup', 'active'),
      (_tenant_id, 'Injection', 'active'),
      (_tenant_id, 'Ointment', 'active'),
      (_tenant_id, 'Drops', 'active')
    ON CONFLICT DO NOTHING;
  END IF;

  -- 3. Copy Manufacturers from Global Catalog
  INSERT INTO public.manufacturers (tenant_id, name, country, code)
  SELECT DISTINCT _tenant_id, gm_mfr.name, gm_mfr.country, gm_mfr.code
  FROM public.global_manufacturers gm_mfr
  WHERE NOT EXISTS (
    SELECT 1 FROM public.manufacturers m
    WHERE m.tenant_id = _tenant_id
      AND lower(m.name) = lower(gm_mfr.name)
      AND m.deleted_at IS NULL
  )
  ON CONFLICT DO NOTHING;

  -- 4. Copy Generics from Global Catalog
  INSERT INTO public.generics (tenant_id, name)
  SELECT DISTINCT _tenant_id, gm_gen.name
  FROM public.global_generics gm_gen
  WHERE NOT EXISTS (
    SELECT 1 FROM public.generics g
    WHERE g.tenant_id = _tenant_id
      AND lower(g.name) = lower(gm_gen.name)
      AND g.deleted_at IS NULL
  )
  ON CONFLICT DO NOTHING;

  -- 5. Copy Global Medicines into Tenant Products
  INSERT INTO public.products (
    tenant_id,
    branch_id,
    name,
    strength,
    medicine_type,
    manufacturer_id,
    generic_id,
    global_medicine_id,
    status,
    is_active,
    sku,
    barcode,
    retail_price,
    purchase_price,
    unit,
    pack_size,
    qty_per_box
  )
  SELECT DISTINCT ON (gm.brand_name, COALESCE(gm.strength, ''), COALESCE(gm.dosage_form, ''), lm.id, lg.id)
    _tenant_id,
    _branch_id,
    gm.brand_name,
    gm.strength,
    gm.dosage_form,
    lm.id,
    lg.id,
    gm.id,
    'active',
    true,
    'GM-' || gm.id || '-' || substr(_tenant_id::text, 1, 4),
    (SELECT gb.barcode FROM public.global_barcodes gb WHERE gb.global_medicine_id = gm.id LIMIT 1),
    0,
    0,
    'Pcs',
    1,
    1
  FROM public.global_medicines gm
  LEFT JOIN public.global_manufacturers gm_mfr ON gm_mfr.id = gm.manufacturer_id
  LEFT JOIN public.global_generics gm_gen ON gm_gen.id = gm.generic_id
  LEFT JOIN public.manufacturers lm ON lm.tenant_id = _tenant_id AND lower(lm.name) = lower(gm_mfr.name) AND lm.deleted_at IS NULL
  LEFT JOIN public.generics lg ON lg.tenant_id = _tenant_id AND lower(lg.name) = lower(gm_gen.name) AND lg.deleted_at IS NULL
  WHERE gm.approved = true
    AND NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.tenant_id = _tenant_id
        AND p.deleted_at IS NULL
        AND p.global_medicine_id = gm.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.products p2
      WHERE p2.tenant_id = _tenant_id
        AND p2.deleted_at IS NULL
        AND lower(btrim(p2.name)) = lower(btrim(gm.brand_name))
        AND lower(coalesce(btrim(p2.strength), '')) = lower(coalesce(btrim(gm.strength), ''))
    )
  LIMIT v_effective_limit
  ON CONFLICT DO NOTHING;

END;
$$;

-- Update trigger function on branches
CREATE OR REPLACE FUNCTION public.auto_provision_tenant_catalog_via_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_main = true THEN
    PERFORM public.provision_catalog_for_tenant(NEW.tenant_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_catalog_for_tenant(uuid, uuid, integer) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.auto_provision_tenant_catalog_via_branch() TO authenticated, service_role;
