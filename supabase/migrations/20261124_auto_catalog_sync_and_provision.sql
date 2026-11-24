-- Migration: 20261124_auto_catalog_sync_and_provision.sql
-- Description: Automatic catalog migration on store setup and 2-way real-time sync for Generics, Companies, and Medicines

-- 1. Ensure expression indexes for fast lookups during sync & provisioning
CREATE INDEX IF NOT EXISTS idx_products_tenant_global_active 
  ON public.products (tenant_id, global_medicine_id) 
  WHERE (deleted_at IS NULL AND global_medicine_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_products_tenant_name_strength_active 
  ON public.products (tenant_id, lower(btrim(name)), lower(coalesce(btrim(strength), ''))) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_manufacturers_tenant_lower_name 
  ON public.manufacturers (tenant_id, lower(btrim(name))) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_generics_tenant_lower_name 
  ON public.generics (tenant_id, lower(btrim(name))) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_global_medicines_name_strength 
  ON public.global_medicines (lower(btrim(brand_name)), lower(coalesce(btrim(strength), '')));

-- ============================================================================
-- 2. TWO-WAY GENERICS AUTO-SYNC
-- ============================================================================

-- A. When a generic is added in ANY tenant, sync to global_generics and all other tenants
CREATE OR REPLACE FUNCTION public.sync_tenant_generic_to_global_and_all()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_global_gen_id uuid;
  t record;
  v_norm_name text := btrim(NEW.name);
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF current_setting('session_replication_role', true) = 'replica' THEN RETURN NEW; END IF;
  IF v_norm_name IS NULL OR v_norm_name = '' THEN RETURN NEW; END IF;

  -- 1. Ensure in global_generics
  SELECT id INTO v_global_gen_id
  FROM public.global_generics
  WHERE lower(btrim(name)) = lower(v_norm_name)
  LIMIT 1;

  IF v_global_gen_id IS NULL THEN
    INSERT INTO public.global_generics (name)
    VALUES (v_norm_name)
    ON CONFLICT (name) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_global_gen_id;
  END IF;

  -- 2. Propagate to all other active tenants
  FOR t IN
    SELECT id FROM public.tenants
    WHERE id <> NEW.tenant_id
      AND status NOT IN ('rejected', 'suspended')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.generics g
      WHERE g.tenant_id = t.id
        AND lower(btrim(g.name)) = lower(v_norm_name)
        AND g.deleted_at IS NULL
    ) THEN
      INSERT INTO public.generics (tenant_id, name, description, status)
      VALUES (t.id, v_norm_name, NEW.description, 'active')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generics_sync_to_global_and_all ON public.generics;
CREATE TRIGGER trg_generics_sync_to_global_and_all
  AFTER INSERT ON public.generics
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_generic_to_global_and_all();

-- B. When a generic is added in global_generics, sync to all tenants
CREATE OR REPLACE FUNCTION public.sync_global_generic_to_all_tenants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  v_norm_name text := btrim(NEW.name);
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF current_setting('session_replication_role', true) = 'replica' THEN RETURN NEW; END IF;
  IF v_norm_name IS NULL OR v_norm_name = '' THEN RETURN NEW; END IF;

  FOR t IN
    SELECT id FROM public.tenants
    WHERE status NOT IN ('rejected', 'suspended')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.generics g
      WHERE g.tenant_id = t.id
        AND lower(btrim(g.name)) = lower(v_norm_name)
        AND g.deleted_at IS NULL
    ) THEN
      INSERT INTO public.generics (tenant_id, name, status)
      VALUES (t.id, v_norm_name, 'active')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_global_generics_sync_all ON public.global_generics;
CREATE TRIGGER trg_global_generics_sync_all
  AFTER INSERT ON public.global_generics
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_global_generic_to_all_tenants();

-- ============================================================================
-- 3. TWO-WAY COMPANY / MANUFACTURER AUTO-SYNC
-- ============================================================================

-- A. When a manufacturer is added in ANY tenant, sync to global_manufacturers and all other tenants
CREATE OR REPLACE FUNCTION public.sync_tenant_manufacturer_to_global_and_all()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_global_mfr_id uuid;
  t record;
  v_norm_name text := btrim(NEW.name);
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF current_setting('session_replication_role', true) = 'replica' THEN RETURN NEW; END IF;
  IF v_norm_name IS NULL OR v_norm_name = '' THEN RETURN NEW; END IF;

  -- 1. Ensure in global_manufacturers
  SELECT id INTO v_global_mfr_id
  FROM public.global_manufacturers
  WHERE lower(btrim(name)) = lower(v_norm_name)
  LIMIT 1;

  IF v_global_mfr_id IS NULL THEN
    INSERT INTO public.global_manufacturers (name, country, code)
    VALUES (v_norm_name, NEW.country, NEW.code)
    ON CONFLICT (name) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_global_mfr_id;
  END IF;

  -- 2. Propagate to all other active tenants
  FOR t IN
    SELECT id FROM public.tenants
    WHERE id <> NEW.tenant_id
      AND status NOT IN ('rejected', 'suspended')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.manufacturers m
      WHERE m.tenant_id = t.id
        AND lower(btrim(m.name)) = lower(v_norm_name)
        AND m.deleted_at IS NULL
    ) THEN
      INSERT INTO public.manufacturers (tenant_id, name, country, code, address, phone, email, status)
      VALUES (t.id, v_norm_name, NEW.country, NEW.code, NEW.address, NEW.phone, NEW.email, 'active')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_manufacturers_sync_to_global_and_all ON public.manufacturers;
CREATE TRIGGER trg_manufacturers_sync_to_global_and_all
  AFTER INSERT ON public.manufacturers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_tenant_manufacturer_to_global_and_all();

-- B. When a manufacturer is added in global_manufacturers, sync to all tenants
CREATE OR REPLACE FUNCTION public.sync_global_manufacturer_to_all_tenants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  v_norm_name text := btrim(NEW.name);
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF current_setting('session_replication_role', true) = 'replica' THEN RETURN NEW; END IF;
  IF v_norm_name IS NULL OR v_norm_name = '' THEN RETURN NEW; END IF;

  FOR t IN
    SELECT id FROM public.tenants
    WHERE status NOT IN ('rejected', 'suspended')
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.manufacturers m
      WHERE m.tenant_id = t.id
        AND lower(btrim(m.name)) = lower(v_norm_name)
        AND m.deleted_at IS NULL
    ) THEN
      INSERT INTO public.manufacturers (tenant_id, name, country, code, status)
      VALUES (t.id, v_norm_name, NEW.country, NEW.code, 'active')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_global_manufacturers_sync_all ON public.global_manufacturers;
CREATE TRIGGER trg_global_manufacturers_sync_all
  AFTER INSERT ON public.global_manufacturers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_global_manufacturer_to_all_tenants();

-- ============================================================================
-- 4. TWO-WAY MEDICINE / PRODUCT AUTO-SYNC
-- ============================================================================

-- Enhanced sync_global_medicine_to_tenant: Works even if branch is null, assigns to main branch if available
CREATE OR REPLACE FUNCTION public.sync_global_medicine_to_tenant(_gm_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gm public.global_medicines%ROWTYPE;
  v_branch uuid;
  v_mfr_name text;
  v_gen_name text;
  v_mfr uuid;
  v_gen uuid;
  v_price numeric;
BEGIN
  SELECT * INTO gm FROM public.global_medicines WHERE id = _gm_id;
  IF NOT FOUND OR gm.approved IS NOT TRUE THEN RETURN false; END IF;

  -- Skip if tenant already has this global medicine linked
  IF EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.tenant_id = _tenant_id AND p.global_medicine_id = gm.id AND p.deleted_at IS NULL
  ) THEN
    RETURN false;
  END IF;

  -- Resolve default branch for tenant if available (or null)
  SELECT id INTO v_branch FROM public.branches
   WHERE tenant_id = _tenant_id AND deleted_at IS NULL
   ORDER BY is_main DESC NULLS LAST, created_at ASC LIMIT 1;

  -- Link an existing unlinked local product matching name & strength instead of creating duplicate
  UPDATE public.products p
     SET global_medicine_id = gm.id
   WHERE p.tenant_id = _tenant_id
     AND p.deleted_at IS NULL
     AND p.global_medicine_id IS NULL
     AND lower(btrim(p.name)) = lower(btrim(gm.brand_name))
     AND lower(coalesce(btrim(p.strength), '')) = lower(coalesce(btrim(gm.strength), ''));
  IF FOUND THEN RETURN false; END IF;

  -- Resolve Manufacturer for this tenant
  SELECT name INTO v_mfr_name FROM public.global_manufacturers WHERE id = gm.manufacturer_id;
  IF v_mfr_name IS NOT NULL THEN
    SELECT id INTO v_mfr FROM public.manufacturers
     WHERE tenant_id = _tenant_id AND lower(btrim(name)) = lower(btrim(v_mfr_name)) AND deleted_at IS NULL LIMIT 1;
    IF v_mfr IS NULL THEN
      INSERT INTO public.manufacturers (tenant_id, name) VALUES (_tenant_id, v_mfr_name)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_mfr;
      IF v_mfr IS NULL THEN
        SELECT id INTO v_mfr FROM public.manufacturers
         WHERE tenant_id = _tenant_id AND lower(btrim(name)) = lower(btrim(v_mfr_name)) AND deleted_at IS NULL LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- Resolve Generic for this tenant
  SELECT name INTO v_gen_name FROM public.global_generics WHERE id = gm.generic_id;
  IF v_gen_name IS NOT NULL THEN
    SELECT id INTO v_gen FROM public.generics
     WHERE tenant_id = _tenant_id AND lower(btrim(name)) = lower(btrim(v_gen_name)) AND deleted_at IS NULL LIMIT 1;
    IF v_gen IS NULL THEN
      INSERT INTO public.generics (tenant_id, name) VALUES (_tenant_id, v_gen_name)
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_gen;
      IF v_gen IS NULL THEN
        SELECT id INTO v_gen FROM public.generics
         WHERE tenant_id = _tenant_id AND lower(btrim(name)) = lower(btrim(v_gen_name)) AND deleted_at IS NULL LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- Reuse price from another store if available
  SELECT max(retail_price) INTO v_price
    FROM public.products
   WHERE global_medicine_id = gm.id AND deleted_at IS NULL AND coalesce(retail_price, 0) > 0;

  -- Insert Product for tenant
  INSERT INTO public.products (
    tenant_id, branch_id, name, strength, medicine_type,
    manufacturer_id, generic_id, global_medicine_id,
    status, is_active, sku, barcode, retail_price, purchase_price, unit, pack_size, qty_per_box
  ) VALUES (
    _tenant_id, v_branch, gm.brand_name, gm.strength, gm.dosage_form,
    v_mfr, v_gen, gm.id, 'active', true,
    'GM-' || gm.id || '-' || substr(_tenant_id::text, 1, 4),
    (SELECT barcode FROM public.global_barcodes gb WHERE gb.global_medicine_id = gm.id LIMIT 1),
    coalesce(v_price, 0), 0, 'Pcs', 1, 1
  )
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

-- Global medicine insert trigger to sync to ALL tenants
CREATE OR REPLACE FUNCTION public.tg_auto_sync_global_medicine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
BEGIN
  IF NEW.approved IS NOT TRUE THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.approved IS TRUE THEN RETURN NEW; END IF;

  FOR t IN
    SELECT id FROM public.tenants
     WHERE status NOT IN ('rejected', 'suspended')
  LOOP
    BEGIN
      PERFORM public.sync_global_medicine_to_tenant(NEW.id, t.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

-- When ANY tenant inserts a new product, sync to global_medicines and all other stores
CREATE OR REPLACE FUNCTION public.auto_contribute_product_to_global()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_generic_name text;
  v_mfr_name text;
  v_global_generic_id uuid;
  v_global_mfr_id uuid;
  v_global_med_id uuid;
  v_norm_name text := btrim(NEW.name);
  v_norm_strength text := btrim(coalesce(NEW.strength, ''));
  v_norm_type text := btrim(coalesce(NEW.medicine_type, ''));
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF current_setting('session_replication_role', true) = 'replica' THEN RETURN NEW; END IF;
  IF NEW.global_medicine_id IS NOT NULL THEN RETURN NEW; END IF;
  IF v_norm_name IS NULL OR v_norm_name = '' THEN RETURN NEW; END IF;

  -- 1. Check if matching global medicine already exists
  SELECT id INTO v_global_med_id
  FROM public.global_medicines
  WHERE lower(btrim(brand_name)) = lower(v_norm_name)
    AND lower(btrim(coalesce(strength, ''))) = lower(v_norm_strength)
    AND (
      v_norm_type = '' OR dosage_form IS NULL OR lower(btrim(dosage_form)) = lower(v_norm_type)
    )
  LIMIT 1;

  -- 2. If it does not exist in global_medicines, create it!
  IF v_global_med_id IS NULL THEN
    -- Resolve Generic in global_generics
    IF NEW.generic_id IS NOT NULL THEN
      SELECT name INTO v_generic_name FROM public.generics WHERE id = NEW.generic_id;
      IF v_generic_name IS NOT NULL THEN
        SELECT id INTO v_global_generic_id FROM public.global_generics WHERE lower(btrim(name)) = lower(btrim(v_generic_name)) LIMIT 1;
        IF v_global_generic_id IS NULL THEN
          INSERT INTO public.global_generics (name)
          VALUES (btrim(v_generic_name))
          ON CONFLICT (name) DO UPDATE SET updated_at = now()
          RETURNING id INTO v_global_generic_id;
        END IF;
      END IF;
    END IF;

    -- Resolve Manufacturer in global_manufacturers
    IF NEW.manufacturer_id IS NOT NULL THEN
      SELECT name INTO v_mfr_name FROM public.manufacturers WHERE id = NEW.manufacturer_id;
      IF v_mfr_name IS NOT NULL THEN
        SELECT id INTO v_global_mfr_id FROM public.global_manufacturers WHERE lower(btrim(name)) = lower(btrim(v_mfr_name)) LIMIT 1;
        IF v_global_mfr_id IS NULL THEN
          INSERT INTO public.global_manufacturers (name)
          VALUES (btrim(v_mfr_name))
          ON CONFLICT (name) DO UPDATE SET updated_at = now()
          RETURNING id INTO v_global_mfr_id;
        END IF;
      END IF;
    END IF;

    -- Insert into global_medicines with approved = true
    -- (This fires tg_auto_sync_global_medicine to propagate to all other stores!)
    INSERT INTO public.global_medicines (
      brand_name,
      generic_id,
      manufacturer_id,
      strength,
      dosage_form,
      created_by_tenant,
      approved
    ) VALUES (
      v_norm_name,
      v_global_generic_id,
      v_global_mfr_id,
      NULLIF(v_norm_strength, ''),
      NULLIF(v_norm_type, ''),
      NEW.tenant_id,
      true
    )
    RETURNING id INTO v_global_med_id;

    -- If product has barcode, record in global_barcodes
    IF NEW.barcode IS NOT NULL AND btrim(NEW.barcode) <> '' THEN
      INSERT INTO public.global_barcodes (global_medicine_id, barcode)
      VALUES (v_global_med_id, btrim(NEW.barcode))
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- 3. Link this local product to the global medicine
  IF v_global_med_id IS NOT NULL THEN
    UPDATE public.products
    SET global_medicine_id = v_global_med_id
    WHERE id = NEW.id AND global_medicine_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_contribute_on_product ON public.products;
CREATE TRIGGER trg_auto_contribute_on_product
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_contribute_product_to_global();

-- ============================================================================
-- 5. CANONICAL PROVISIONING FUNCTION FOR STORE SETUP
-- ============================================================================

DROP FUNCTION IF EXISTS public.provision_catalog_for_tenant(uuid, uuid);
DROP FUNCTION IF EXISTS public.provision_catalog_for_tenant(uuid, uuid, integer);

CREATE OR REPLACE FUNCTION public.provision_catalog_for_tenant(
  _tenant_id uuid,
  _branch_id uuid DEFAULT NULL,
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
  v_actual_branch uuid := _branch_id;
BEGIN
  -- If branch_id is null, find the main branch of this tenant
  IF v_actual_branch IS NULL THEN
    SELECT id INTO v_actual_branch 
    FROM public.branches 
    WHERE tenant_id = _tenant_id AND deleted_at IS NULL 
    ORDER BY is_main DESC NULLS LAST, created_at ASC 
    LIMIT 1;
  END IF;

  -- 1. Provision default Units
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

  -- 2. Provision default Categories
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
      AND lower(btrim(m.name)) = lower(btrim(gm_mfr.name))
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
      AND lower(btrim(g.name)) = lower(btrim(gm_gen.name))
      AND g.deleted_at IS NULL
  )
  ON CONFLICT DO NOTHING;

  -- 5. Copy Global Medicines into Tenant Products (fast batch copy)
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
    mrp,
    unit,
    pack_size,
    qty_per_box
  )
  SELECT
    _tenant_id,
    v_actual_branch,
    gm.brand_name,
    gm.strength,
    gm.dosage_form,
    cat.id,
    lm.id,
    lg.id,
    gm.id,
    'active',
    true,
    'GM-' || gm.id || '-' || substr(_tenant_id::text, 1, 4),
    gb.barcode,
    COALESCE(gm.retail_price, 0),
    COALESCE(gm.purchase_price, 0),
    COALESCE(gm.mrp, gm.retail_price, 0),
    COALESCE(gm.unit, 'Box'),
    1,
    1
  FROM public.global_medicines gm
  LEFT JOIN public.global_manufacturers gm_mfr ON gm_mfr.id = gm.manufacturer_id
  LEFT JOIN public.global_generics gm_gen ON gm_gen.id = gm.generic_id
  LEFT JOIN public.manufacturers lm ON lm.tenant_id = _tenant_id AND lower(btrim(lm.name)) = lower(btrim(gm_mfr.name)) AND lm.deleted_at IS NULL
  LEFT JOIN public.generics lg ON lg.tenant_id = _tenant_id AND lower(btrim(lg.name)) = lower(btrim(gm_gen.name)) AND lg.deleted_at IS NULL
  LEFT JOIN public.categories cat ON cat.tenant_id = _tenant_id AND lower(btrim(cat.name)) = lower(btrim(gm.dosage_form)) AND cat.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT barcode FROM public.global_barcodes gb WHERE gb.global_medicine_id = gm.id LIMIT 1
  ) gb ON true
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

  -- 6. Link any unlinked products or branchless products
  IF v_actual_branch IS NOT NULL THEN
    UPDATE public.products
    SET branch_id = v_actual_branch
    WHERE tenant_id = _tenant_id AND branch_id IS NULL AND deleted_at IS NULL;
  END IF;

END;
$$;

-- Trigger on branches: when a branch is created with is_main = true, auto-provision
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

DROP TRIGGER IF EXISTS trg_branches_auto_provision ON public.branches;
CREATE TRIGGER trg_branches_auto_provision
  AFTER INSERT ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_provision_tenant_catalog_via_branch();

GRANT EXECUTE ON FUNCTION public.provision_catalog_for_tenant(uuid, uuid, integer) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION public.sync_global_medicine_to_tenant(uuid, uuid) TO authenticated, service_role, anon;
