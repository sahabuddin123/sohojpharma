-- 1) Per-tenant auto-sync switch
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS auto_sync_global_catalog boolean NOT NULL DEFAULT true;

-- 2) Copy one global medicine into one tenant
CREATE OR REPLACE FUNCTION public.sync_global_medicine_to_tenant(_gm_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF EXISTS (SELECT 1 FROM public.products p
             WHERE p.tenant_id = _tenant_id AND p.global_medicine_id = gm.id AND p.deleted_at IS NULL) THEN
    RETURN false;
  END IF;

  SELECT id INTO v_branch FROM public.branches
   WHERE tenant_id = _tenant_id AND deleted_at IS NULL
   ORDER BY is_main DESC NULLS LAST, created_at ASC LIMIT 1;
  IF v_branch IS NULL THEN RETURN false; END IF;

  -- link an existing unlinked local product instead of duplicating
  UPDATE public.products p
     SET global_medicine_id = gm.id
   WHERE p.tenant_id = _tenant_id
     AND p.deleted_at IS NULL
     AND p.global_medicine_id IS NULL
     AND lower(btrim(p.name)) = lower(btrim(gm.brand_name))
     AND lower(coalesce(btrim(p.strength), '')) = lower(coalesce(btrim(gm.strength), ''));
  IF FOUND THEN RETURN false; END IF;

  SELECT name INTO v_mfr_name FROM public.global_manufacturers WHERE id = gm.manufacturer_id;
  SELECT name INTO v_gen_name FROM public.global_generics WHERE id = gm.generic_id;

  IF v_mfr_name IS NOT NULL THEN
    SELECT id INTO v_mfr FROM public.manufacturers
     WHERE tenant_id = _tenant_id AND lower(name) = lower(v_mfr_name) AND deleted_at IS NULL LIMIT 1;
    IF v_mfr IS NULL THEN
      INSERT INTO public.manufacturers (tenant_id, name) VALUES (_tenant_id, v_mfr_name)
      RETURNING id INTO v_mfr;
    END IF;
  END IF;

  IF v_gen_name IS NOT NULL THEN
    SELECT id INTO v_gen FROM public.generics
     WHERE tenant_id = _tenant_id AND lower(name) = lower(v_gen_name) AND deleted_at IS NULL LIMIT 1;
    IF v_gen IS NULL THEN
      INSERT INTO public.generics (tenant_id, name) VALUES (_tenant_id, v_gen_name)
      RETURNING id INTO v_gen;
    END IF;
  END IF;

  -- reuse a price already known for this medicine in another store
  SELECT max(retail_price) INTO v_price
    FROM public.products
   WHERE global_medicine_id = gm.id AND deleted_at IS NULL AND coalesce(retail_price,0) > 0;

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

REVOKE ALL ON FUNCTION public.sync_global_medicine_to_tenant(uuid, uuid) FROM public, anon, authenticated;

-- 3) Trigger: push newly approved medicines to all opted-in stores
CREATE OR REPLACE FUNCTION public.tg_auto_sync_global_medicine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE t record;
BEGIN
  IF NEW.approved IS NOT TRUE THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.approved IS TRUE THEN RETURN NEW; END IF;

  FOR t IN
    SELECT id FROM public.tenants
     WHERE auto_sync_global_catalog = true
       AND coalesce(status, 'active') <> 'suspended'
  LOOP
    BEGIN
      PERFORM public.sync_global_medicine_to_tenant(NEW.id, t.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_sync_global_medicine ON public.global_medicines;
CREATE TRIGGER trg_auto_sync_global_medicine
AFTER INSERT OR UPDATE OF approved ON public.global_medicines
FOR EACH ROW EXECUTE FUNCTION public.tg_auto_sync_global_medicine();

-- 4) Catch-up sync (admin): pull anything a store is still missing
CREATE OR REPLACE FUNCTION public.sync_missing_global_medicines(_tenant_id uuid, _limit integer DEFAULT 2000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; n integer := 0;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR r IN
    SELECT gm.id
      FROM public.global_medicines gm
     WHERE gm.approved = true
       AND NOT EXISTS (
         SELECT 1 FROM public.products p
          WHERE p.tenant_id = _tenant_id AND p.global_medicine_id = gm.id AND p.deleted_at IS NULL)
     ORDER BY gm.created_at
     LIMIT _limit
  LOOP
    IF public.sync_global_medicine_to_tenant(r.id, _tenant_id) THEN n := n + 1; END IF;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_missing_global_medicines(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sync_missing_global_medicines(uuid, integer) TO authenticated;