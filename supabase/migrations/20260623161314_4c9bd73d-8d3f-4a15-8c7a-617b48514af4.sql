
-- =========================================================
-- Global Catalog → Inventory Import System
-- =========================================================

-- 1) import_jobs table
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'global_catalog_import',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  scope text NOT NULL DEFAULT 'all'
    CHECK (scope IN ('selected','search','all')),
  medicine_ids uuid[] NOT NULL DEFAULT '{}',
  filter_q text,
  filter_rx_only boolean,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  branch_id uuid,
  warehouse_id uuid,
  total_items integer NOT NULL DEFAULT 0,
  processed_items integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_tenant_status
  ON public.import_jobs(tenant_id, status, created_at DESC);

GRANT SELECT ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_jobs_tenant_select" ON public.import_jobs;
CREATE POLICY "import_jobs_tenant_select" ON public.import_jobs
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

-- updated_at trigger (reuse existing helper if available, else inline)
CREATE OR REPLACE FUNCTION public.tg_import_jobs_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS tg_import_jobs_touch ON public.import_jobs;
CREATE TRIGGER tg_import_jobs_touch
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_import_jobs_touch();

-- Realtime
ALTER TABLE public.import_jobs REPLICA IDENTITY FULL;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.import_jobs';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================
-- 2) start_global_import_job — creates the job + counts scope
-- =========================================================
CREATE OR REPLACE FUNCTION public.start_global_import_job(
  _tenant uuid,
  _scope text,
  _medicine_ids uuid[],
  _filter_q text,
  _filter_rx_only boolean,
  _options jsonb,
  _branch uuid,
  _warehouse uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_job uuid;
  v_total int := 0;
  v_branch uuid := _branch;
  v_wh uuid := _warehouse;
BEGIN
  IF NOT public.is_tenant_member(v_uid, _tenant) THEN
    RAISE EXCEPTION 'forbidden: not a tenant member';
  END IF;
  IF _scope NOT IN ('selected','search','all') THEN
    RAISE EXCEPTION 'invalid scope';
  END IF;

  -- Resolve default branch (head office) and warehouse (default) when missing
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM public.branches
     WHERE tenant_id = _tenant AND deleted_at IS NULL
     ORDER BY (branch_role='head_office') DESC, is_main DESC, created_at ASC LIMIT 1;
  END IF;
  IF v_wh IS NULL THEN
    SELECT id INTO v_wh FROM public.warehouses
     WHERE tenant_id = _tenant AND deleted_at IS NULL
       AND (v_branch IS NULL OR branch_id = v_branch OR branch_id IS NULL)
     ORDER BY is_default DESC, is_hq DESC, created_at ASC LIMIT 1;
  END IF;

  -- Pre-compute total (not yet imported)
  IF _scope = 'selected' THEN
    SELECT count(*) INTO v_total
      FROM public.global_medicines gm
     WHERE gm.id = ANY(COALESCE(_medicine_ids,'{}'::uuid[]))
       AND NOT EXISTS (
         SELECT 1 FROM public.products p
          WHERE p.tenant_id = _tenant AND p.global_medicine_id = gm.id AND p.deleted_at IS NULL);
  ELSIF _scope = 'search' THEN
    SELECT count(*) INTO v_total
      FROM public.global_medicines gm
     WHERE gm.approved
       AND (_filter_rx_only IS NULL OR gm.prescription_required = _filter_rx_only)
       AND (COALESCE(_filter_q,'') = ''
            OR gm.brand_name ILIKE '%'||_filter_q||'%'
            OR gm.generic_name_cached ILIKE '%'||_filter_q||'%')
       AND NOT EXISTS (
         SELECT 1 FROM public.products p
          WHERE p.tenant_id = _tenant AND p.global_medicine_id = gm.id AND p.deleted_at IS NULL);
  ELSE -- all
    SELECT count(*) INTO v_total
      FROM public.global_medicines gm
     WHERE gm.approved
       AND NOT EXISTS (
         SELECT 1 FROM public.products p
          WHERE p.tenant_id = _tenant AND p.global_medicine_id = gm.id AND p.deleted_at IS NULL);
  END IF;

  INSERT INTO public.import_jobs(
    tenant_id, job_type, status, scope, medicine_ids,
    filter_q, filter_rx_only, options, branch_id, warehouse_id,
    total_items, started_at, created_by
  ) VALUES (
    _tenant, 'global_catalog_import', 'pending', _scope,
    COALESCE(_medicine_ids,'{}'::uuid[]),
    _filter_q, _filter_rx_only, COALESCE(_options,'{}'::jsonb),
    v_branch, v_wh, v_total, now(), v_uid
  ) RETURNING id INTO v_job;

  INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
  VALUES (_tenant, v_uid, 'inventory_import_started', 'import_jobs', v_job,
          jsonb_build_object('scope', _scope, 'total', v_total));

  RETURN v_job;
END $$;

REVOKE ALL ON FUNCTION public.start_global_import_job(uuid,text,uuid[],text,boolean,jsonb,uuid,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.start_global_import_job(uuid,text,uuid[],text,boolean,jsonb,uuid,uuid) TO authenticated;

-- =========================================================
-- 3) process_global_import_chunk — imports up to _batch rows
-- =========================================================
CREATE OR REPLACE FUNCTION public.process_global_import_chunk(
  _job uuid, _batch int DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  j public.import_jobs%ROWTYPE;
  v_opt jsonb;
  v_link_generic boolean;
  v_link_mfr boolean;
  v_create_cat boolean;
  v_create_barcode boolean;
  v_create_inv boolean;
  v_open_stock numeric;
  v_purchase numeric;
  v_sale numeric;
  v_status_default text;
  v_cat_id uuid;
  v_imported int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_processed_now int := 0;
  v_has_more boolean := false;
  rec record;
  v_gen_id uuid;
  v_mfr_id uuid;
  v_product_id uuid;
  v_sku text;
BEGIN
  SELECT * INTO j FROM public.import_jobs WHERE id = _job FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job not found'; END IF;
  IF NOT public.is_tenant_member(v_uid, j.tenant_id) THEN
    RAISE EXCEPTION 'forbidden: not a tenant member';
  END IF;
  IF j.status IN ('completed','failed','cancelled') THEN
    RETURN jsonb_build_object('status', j.status, 'has_more', false,
      'processed', j.processed_items, 'total', j.total_items,
      'imported', j.success_count, 'skipped', j.skipped_count, 'failed', j.failed_count);
  END IF;

  IF j.status = 'pending' THEN
    UPDATE public.import_jobs SET status='processing', started_at=COALESCE(started_at, now())
     WHERE id = _job;
  END IF;

  v_opt := j.options;
  v_link_generic   := COALESCE((v_opt->>'link_generic')::boolean, true);
  v_link_mfr       := COALESCE((v_opt->>'link_manufacturer')::boolean, true);
  v_create_cat     := COALESCE((v_opt->>'create_categories')::boolean, true);
  v_create_barcode := COALESCE((v_opt->>'create_barcodes')::boolean, true);
  v_create_inv     := COALESCE((v_opt->>'create_inventory')::boolean, true);
  v_open_stock     := COALESCE((v_opt->>'opening_stock')::numeric, 0);
  v_purchase       := COALESCE((v_opt->>'purchase_price')::numeric, 0);
  v_sale           := COALESCE((v_opt->>'sale_price')::numeric, 0);
  v_status_default := COALESCE(v_opt->>'status', 'active');

  -- Build a working query for the next chunk based on scope
  FOR rec IN
    SELECT gm.id, gm.brand_name, gm.strength, gm.dosage_form,
           gm.prescription_required,
           COALESCE(gm.generic_name_cached, gg.name) AS generic_name,
           COALESCE(gm.manufacturer_name_cached, gmf.name) AS manufacturer_name,
           gm.dosage_form AS form
      FROM public.global_medicines gm
      LEFT JOIN public.global_generics gg ON gg.id = gm.generic_id
      LEFT JOIN public.global_manufacturers gmf ON gmf.id = gm.manufacturer_id
     WHERE gm.approved
       AND (
         (j.scope = 'selected' AND gm.id = ANY(j.medicine_ids))
         OR (j.scope = 'search'
             AND (j.filter_rx_only IS NULL OR gm.prescription_required = j.filter_rx_only)
             AND (COALESCE(j.filter_q,'') = ''
                  OR gm.brand_name ILIKE '%'||j.filter_q||'%'
                  OR gm.generic_name_cached ILIKE '%'||j.filter_q||'%'))
         OR (j.scope = 'all')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.products p
          WHERE p.tenant_id = j.tenant_id AND p.global_medicine_id = gm.id AND p.deleted_at IS NULL)
     ORDER BY gm.id
     LIMIT _batch
  LOOP
    BEGIN
      -- Resolve / create generic
      v_gen_id := NULL;
      IF v_link_generic AND rec.generic_name IS NOT NULL AND length(trim(rec.generic_name)) > 0 THEN
        INSERT INTO public.generics(tenant_id, name)
          VALUES (j.tenant_id, trim(rec.generic_name))
          ON CONFLICT (tenant_id, name) DO UPDATE SET updated_at = now()
          RETURNING id INTO v_gen_id;
      END IF;

      -- Resolve / create manufacturer
      v_mfr_id := NULL;
      IF v_link_mfr AND rec.manufacturer_name IS NOT NULL AND length(trim(rec.manufacturer_name)) > 0 THEN
        SELECT id INTO v_mfr_id FROM public.manufacturers
         WHERE tenant_id = j.tenant_id AND lower(name) = lower(trim(rec.manufacturer_name))
           AND deleted_at IS NULL LIMIT 1;
        IF v_mfr_id IS NULL THEN
          INSERT INTO public.manufacturers(tenant_id, name)
            VALUES (j.tenant_id, trim(rec.manufacturer_name))
            RETURNING id INTO v_mfr_id;
        END IF;
      END IF;

      -- Category from dosage_form
      v_cat_id := NULL;
      IF v_create_cat AND rec.form IS NOT NULL AND length(trim(rec.form)) > 0 THEN
        INSERT INTO public.categories(tenant_id, name)
          VALUES (j.tenant_id, trim(rec.form))
          ON CONFLICT (tenant_id, name) DO UPDATE SET updated_at = now()
          RETURNING id INTO v_cat_id;
      END IF;

      -- Deterministic SKU
      v_sku := 'GBL-'||substr(replace(rec.id::text,'-',''),1,12);

      INSERT INTO public.products(
        tenant_id, branch_id, sku, name, generic_id, manufacturer_id, category_id,
        purchase_price, retail_price, dealer_price, wholesale_price,
        is_prescription_required, is_active, status,
        medicine_type, strength, global_medicine_id
      ) VALUES (
        j.tenant_id, j.branch_id, v_sku, rec.brand_name, v_gen_id, v_mfr_id, v_cat_id,
        v_purchase, v_sale, v_sale, v_sale,
        COALESCE(rec.prescription_required,false), (v_status_default='active'), v_status_default,
        rec.form, rec.strength, rec.id
      )
      ON CONFLICT (tenant_id, sku) DO NOTHING
      RETURNING id INTO v_product_id;

      IF v_product_id IS NULL THEN
        -- Could not insert (sku collision = treat as duplicate)
        v_skipped := v_skipped + 1;
      ELSE
        -- Barcodes
        IF v_create_barcode THEN
          INSERT INTO public.product_barcodes(tenant_id, branch_id, product_id, barcode, barcode_type, is_primary)
          SELECT j.tenant_id, j.branch_id, v_product_id, gb.barcode, gb.barcode_type, true
            FROM public.global_barcodes gb
           WHERE gb.global_medicine_id = rec.id
          ON CONFLICT DO NOTHING;
        END IF;

        -- Inventory row
        IF v_create_inv AND j.warehouse_id IS NOT NULL THEN
          INSERT INTO public.inventory(tenant_id, warehouse_id, product_id, qty_on_hand)
          VALUES (j.tenant_id, j.warehouse_id, v_product_id, v_open_stock)
          ON CONFLICT (tenant_id, warehouse_id, product_id, batch_id) DO NOTHING;
        END IF;

        v_imported := v_imported + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
    v_processed_now := v_processed_now + 1;
  END LOOP;

  -- Update job counters
  UPDATE public.import_jobs
     SET processed_items = processed_items + v_processed_now,
         success_count   = success_count + v_imported,
         skipped_count   = skipped_count + v_skipped,
         failed_count    = failed_count + v_failed
   WHERE id = _job
   RETURNING * INTO j;

  v_has_more := v_processed_now > 0 AND j.processed_items < j.total_items;

  IF NOT v_has_more THEN
    UPDATE public.import_jobs
       SET status = CASE WHEN failed_count > 0 AND success_count = 0 THEN 'failed' ELSE 'completed' END,
           completed_at = now()
     WHERE id = _job
     RETURNING * INTO j;

    INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
    VALUES (j.tenant_id, v_uid,
            CASE WHEN j.status='failed' THEN 'inventory_import_failed' ELSE 'inventory_import_completed' END,
            'import_jobs', j.id,
            jsonb_build_object('imported', j.success_count, 'skipped', j.skipped_count,
                               'failed', j.failed_count, 'total', j.total_items));
  END IF;

  RETURN jsonb_build_object(
    'status', j.status,
    'has_more', v_has_more,
    'processed', j.processed_items,
    'total', j.total_items,
    'imported', j.success_count,
    'skipped', j.skipped_count,
    'failed', j.failed_count
  );
END $$;

REVOKE ALL ON FUNCTION public.process_global_import_chunk(uuid,int) FROM public;
GRANT EXECUTE ON FUNCTION public.process_global_import_chunk(uuid,int) TO authenticated;
