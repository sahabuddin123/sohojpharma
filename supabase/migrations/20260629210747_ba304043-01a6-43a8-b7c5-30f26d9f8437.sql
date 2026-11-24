CREATE OR REPLACE FUNCTION public.process_global_import_chunk(_job uuid, _batch integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  v_limit int;
  v_used int;
  v_batch_limit int := _batch;
  rec record;
  v_gen_id uuid;
  v_mfr_id uuid;
  v_product_id uuid;
  v_existing_product_id uuid;
  v_sku text;
  v_error text;
  v_master_cache jsonb := '{}'::jsonb;
  v_cache_key text;
  v_cache_code text;
BEGIN
  SELECT * INTO j FROM public.import_jobs WHERE id = _job FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'job not found'; END IF;
  IF NOT public.is_tenant_member(v_uid, j.tenant_id) THEN
    RAISE EXCEPTION 'forbidden: not a tenant member';
  END IF;
  IF j.status IN ('completed','failed','cancelled') THEN
    RETURN jsonb_build_object('status', j.status, 'has_more', false,
      'processed', j.processed_items, 'total', j.total_items,
      'imported', j.success_count, 'skipped', j.skipped_count, 'failed', j.failed_count,
      'error', j.error_message);
  END IF;

  IF j.status = 'pending' THEN
    UPDATE public.import_jobs SET status='processing', started_at=COALESCE(started_at, now())
     WHERE id = _job;
  END IF;

  SELECT c.used::int, c.max_products INTO v_used, v_limit
    FROM public.get_tenant_product_capacity(j.tenant_id) c
    LIMIT 1;
  IF v_limit IS NOT NULL THEN
    IF COALESCE(v_used, 0) >= v_limit THEN
      UPDATE public.import_jobs
         SET status='failed', completed_at=now(),
             error_message = format('plan_limit_exceeded: product limit %s reached (current=%s)', v_limit, COALESCE(v_used,0))
       WHERE id = _job
       RETURNING * INTO j;
      RETURN jsonb_build_object('status', j.status, 'has_more', false,
        'processed', j.processed_items, 'total', j.total_items,
        'imported', j.success_count, 'skipped', j.skipped_count, 'failed', j.failed_count,
        'error', j.error_message);
    END IF;
    v_batch_limit := LEAST(_batch, v_limit - COALESCE(v_used, 0));
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

  FOR rec IN
    SELECT gm.id, gm.brand_name, gm.strength, gm.dosage_form,
           gm.prescription_required,
           COALESCE(gm.generic_name_cached, gg.name) AS generic_name,
           COALESCE(gm.manufacturer_name_cached, gmf.name) AS manufacturer_name,
           gm.dosage_form AS form
      FROM public.global_medicines gm
      LEFT JOIN public.global_generics gg ON gg.id=gm.generic_id
      LEFT JOIN public.global_manufacturers gmf ON gmf.id=gm.manufacturer_id
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
     LIMIT v_batch_limit
  LOOP
    BEGIN
      v_product_id := NULL;
      v_existing_product_id := NULL;
      v_gen_id := NULL;

      IF v_link_generic AND rec.generic_name IS NOT NULL AND length(trim(rec.generic_name)) > 0 THEN
        v_cache_code := public.master_canonical_code(rec.generic_name);
        v_cache_key := 'generic|' || v_cache_code;
        IF v_master_cache ? v_cache_key THEN
          v_gen_id := (v_master_cache ->> v_cache_key)::uuid;
        ELSE
          v_gen_id := public.resolve_master_id(j.tenant_id, 'generic', rec.generic_name, NULL, v_uid, 'active');
          v_master_cache := jsonb_set(v_master_cache, ARRAY[v_cache_key], to_jsonb(v_gen_id::text), true);
        END IF;
      END IF;

      v_mfr_id := NULL;
      IF v_link_mfr AND rec.manufacturer_name IS NOT NULL AND length(trim(rec.manufacturer_name)) > 0 THEN
        v_cache_code := public.master_canonical_code(rec.manufacturer_name);
        v_cache_key := 'manufacturer|' || v_cache_code;
        IF v_master_cache ? v_cache_key THEN
          v_mfr_id := (v_master_cache ->> v_cache_key)::uuid;
        ELSE
          v_mfr_id := public.resolve_master_id(j.tenant_id, 'manufacturer', rec.manufacturer_name, NULL, v_uid, 'active');
          v_master_cache := jsonb_set(v_master_cache, ARRAY[v_cache_key], to_jsonb(v_mfr_id::text), true);
        END IF;
      END IF;

      v_cat_id := NULL;
      IF v_create_cat AND rec.form IS NOT NULL AND length(trim(rec.form)) > 0 THEN
        v_cache_code := public.master_canonical_code(rec.form);
        v_cache_key := 'category|' || v_cache_code;
        IF v_master_cache ? v_cache_key THEN
          v_cat_id := (v_master_cache ->> v_cache_key)::uuid;
        ELSE
          v_cat_id := public.resolve_master_id(j.tenant_id, 'category', rec.form, NULL, v_uid, 'active');
          v_master_cache := jsonb_set(v_master_cache, ARRAY[v_cache_key], to_jsonb(v_cat_id::text), true);
        END IF;
      END IF;

      v_sku := 'GBL-'||substr(replace(rec.id::text,'-',''),1,12);

      SELECT id INTO v_existing_product_id
        FROM public.products p
       WHERE p.tenant_id = j.tenant_id
         AND p.deleted_at IS NULL
         AND (
           p.global_medicine_id = rec.id
           OR p.sku = v_sku
           OR (
             lower(btrim(p.name)) = lower(btrim(rec.brand_name))
             AND COALESCE(p.generic_id::text, '') = COALESCE(v_gen_id::text, '')
             AND COALESCE(p.manufacturer_id::text, '') = COALESCE(v_mfr_id::text, '')
             AND lower(COALESCE(btrim(p.strength), '')) = lower(COALESCE(btrim(rec.strength), ''))
           )
         )
       ORDER BY CASE WHEN p.global_medicine_id = rec.id THEN 0 WHEN p.sku = v_sku THEN 1 ELSE 2 END
       LIMIT 1;

      IF v_existing_product_id IS NOT NULL THEN
        UPDATE public.products
           SET global_medicine_id = COALESCE(global_medicine_id, rec.id),
               generic_id = COALESCE(generic_id, v_gen_id),
               manufacturer_id = COALESCE(manufacturer_id, v_mfr_id),
               category_id = COALESCE(category_id, v_cat_id),
               medicine_type = COALESCE(medicine_type, rec.form),
               updated_by = v_uid
         WHERE id = v_existing_product_id;

        IF v_create_barcode THEN
          INSERT INTO public.product_barcodes(tenant_id, branch_id, product_id, barcode, barcode_type, is_primary)
          SELECT j.tenant_id, j.branch_id, v_existing_product_id, gb.barcode, gb.barcode_type, false
            FROM public.global_barcodes gb
           WHERE gb.global_medicine_id = rec.id
          ON CONFLICT DO NOTHING;
        END IF;

        v_skipped := v_skipped + 1;
      ELSE
        INSERT INTO public.products(
          tenant_id, branch_id, sku, name, generic_id, manufacturer_id, category_id,
          purchase_price, retail_price, dealer_price, wholesale_price,
          is_prescription_required, is_active, status,
          medicine_type, strength, global_medicine_id, created_by, updated_by, import_batch_id
        ) VALUES (
          j.tenant_id, j.branch_id, v_sku, rec.brand_name, v_gen_id, v_mfr_id, v_cat_id,
          v_purchase, v_sale, v_sale, v_sale,
          COALESCE(rec.prescription_required,false), (v_status_default='active'), v_status_default,
          rec.form, rec.strength, rec.id, v_uid, v_uid, j.id
        )
        ON CONFLICT (tenant_id, sku) DO UPDATE
          SET global_medicine_id = COALESCE(public.products.global_medicine_id, EXCLUDED.global_medicine_id),
              updated_at = now(),
              updated_by = v_uid
        RETURNING id INTO v_product_id;

        IF v_create_barcode THEN
          INSERT INTO public.product_barcodes(tenant_id, branch_id, product_id, barcode, barcode_type, is_primary)
          SELECT j.tenant_id, j.branch_id, v_product_id, gb.barcode, gb.barcode_type, true
            FROM public.global_barcodes gb
           WHERE gb.global_medicine_id = rec.id
          ON CONFLICT DO NOTHING;
        END IF;

        IF v_create_inv AND j.warehouse_id IS NOT NULL AND v_open_stock > 0 THEN
          INSERT INTO public.batches(
            tenant_id, branch_id, warehouse_id, product_id, batch_no,
            expiry_date, purchase_price, qty_on_hand, is_opening,
            created_by, updated_by, source, import_batch_id
          ) VALUES (
            j.tenant_id, j.branch_id, j.warehouse_id, v_product_id,
            'OPENING-' || substr(replace(v_product_id::text, '-', ''), 1, 12),
            '2099-12-31', v_purchase, v_open_stock, true,
            v_uid, v_uid, 'global_import', j.id
          )
          ON CONFLICT DO NOTHING;
        END IF;

        v_imported := v_imported + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_error := SQLERRM;
    END;
    v_processed_now := v_processed_now + 1;
  END LOOP;

  UPDATE public.import_jobs
     SET processed_items = LEAST(total_items, processed_items + v_processed_now),
         success_count   = success_count + v_imported,
         skipped_count   = skipped_count + v_skipped,
         failed_count    = failed_count + v_failed,
         error_message   = CASE WHEN v_failed > 0 THEN left(COALESCE(error_message || E'\n', '') || v_error, 2000) ELSE error_message END
   WHERE id = _job
   RETURNING * INTO j;

  SELECT EXISTS (
    SELECT 1 FROM public.global_medicines gm
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
  ) INTO v_has_more;

  v_has_more := v_processed_now > 0 AND v_has_more AND (v_limit IS NULL OR (SELECT COUNT(*) FROM public.products WHERE tenant_id = j.tenant_id AND deleted_at IS NULL) < v_limit);

  IF NOT v_has_more THEN
    UPDATE public.import_jobs
       SET status = CASE WHEN failed_count > 0 AND success_count = 0 AND skipped_count = 0 THEN 'failed' ELSE 'completed' END,
           completed_at = now()
     WHERE id = _job
     RETURNING * INTO j;

    INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
    VALUES (j.tenant_id, v_uid,
            CASE WHEN j.status='failed' THEN 'inventory_import_failed' ELSE 'inventory_import_completed' END,
            'import_jobs', j.id,
            jsonb_build_object('imported', j.success_count, 'skipped', j.skipped_count,
                               'failed', j.failed_count, 'total', j.total_items, 'error', j.error_message));
  END IF;

  RETURN jsonb_build_object(
    'status', j.status,
    'has_more', v_has_more,
    'processed', j.processed_items,
    'total', j.total_items,
    'imported', j.success_count,
    'skipped', j.skipped_count,
    'failed', j.failed_count,
    'error', j.error_message
  );
END;
$$;