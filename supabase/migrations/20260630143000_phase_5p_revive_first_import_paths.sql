-- Phase 5P final: revive-first product resolution for every import path.
-- Do not change constraints; reuse soft-deleted product UUIDs and keep related rows idempotent.

CREATE OR REPLACE FUNCTION public.resolve_product_revive_first(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant uuid := NULLIF(_payload->>'tenant_id','')::uuid;
  v_product_id uuid;
  v_deleted_at timestamptz;
  v_action text;
  v_sku text := NULLIF(_payload->>'sku','');
  v_barcode text := NULLIF(_payload->>'barcode','');
  v_name text := NULLIF(_payload->>'name','');
  v_strength text := NULLIF(_payload->>'strength','');
  v_manufacturer_id uuid := NULLIF(_payload->>'manufacturer_id','')::uuid;
  v_generic_id uuid := NULLIF(_payload->>'generic_id','')::uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  IF v_uid IS NOT NULL AND NOT public.is_tenant_member(v_uid, v_tenant) THEN
    RAISE EXCEPTION 'Forbidden: not a member of tenant %', v_tenant;
  END IF;

  v_sku := COALESCE(v_sku, v_barcode, 'SKU-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;

  SELECT p.id, p.deleted_at
    INTO v_product_id, v_deleted_at
    FROM public.products p
   WHERE p.tenant_id = v_tenant
     AND p.sku = v_sku
   LIMIT 1;

  IF v_product_id IS NULL AND v_barcode IS NOT NULL THEN
    SELECT p.id, p.deleted_at
      INTO v_product_id, v_deleted_at
      FROM public.products p
      LEFT JOIN public.product_barcodes pb
        ON pb.tenant_id = p.tenant_id
       AND pb.product_id = p.id
       AND pb.barcode = v_barcode
     WHERE p.tenant_id = v_tenant
       AND (p.barcode = v_barcode OR pb.id IS NOT NULL)
     ORDER BY (p.deleted_at IS NULL) DESC,
              (pb.deleted_at IS NULL) DESC,
              p.updated_at DESC NULLS LAST,
              p.created_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF v_product_id IS NULL THEN
    SELECT p.id, p.deleted_at
      INTO v_product_id, v_deleted_at
      FROM public.products p
     WHERE p.tenant_id = v_tenant
       AND lower(btrim(p.name)) = lower(btrim(v_name))
       AND COALESCE(p.manufacturer_id::text, '') = COALESCE(v_manufacturer_id::text, '')
       AND COALESCE(p.generic_id::text, '') = COALESCE(v_generic_id::text, '')
       AND lower(COALESCE(btrim(p.strength), '')) = lower(COALESCE(btrim(v_strength), ''))
     ORDER BY (p.deleted_at IS NULL) DESC, p.updated_at DESC NULLS LAST, p.created_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  IF v_product_id IS NOT NULL THEN
    v_action := CASE WHEN v_deleted_at IS NOT NULL THEN 'revived' ELSE 'updated' END;

    UPDATE public.products
       SET sku = v_sku,
           barcode = CASE
             WHEN v_barcode IS NULL THEN public.products.barcode
             WHEN EXISTS (
               SELECT 1 FROM public.products p2
                WHERE p2.tenant_id = v_tenant
                  AND p2.barcode = v_barcode
                  AND p2.deleted_at IS NULL
                  AND p2.id <> v_product_id
             ) THEN public.products.barcode
             ELSE v_barcode
           END,
           name = v_name,
           name_bn = CASE WHEN _payload ? 'name_bn' THEN NULLIF(_payload->>'name_bn','') ELSE public.products.name_bn END,
           branch_id = COALESCE(NULLIF(_payload->>'branch_id','')::uuid, public.products.branch_id),
           manufacturer_id = CASE WHEN _payload ? 'manufacturer_id' THEN v_manufacturer_id ELSE public.products.manufacturer_id END,
           generic_id = CASE WHEN _payload ? 'generic_id' THEN v_generic_id ELSE public.products.generic_id END,
           category_id = CASE WHEN _payload ? 'category_id' THEN NULLIF(_payload->>'category_id','')::uuid ELSE public.products.category_id END,
           medicine_type_id = CASE WHEN _payload ? 'medicine_type_id' THEN NULLIF(_payload->>'medicine_type_id','')::uuid ELSE public.products.medicine_type_id END,
           dosage_form_id = CASE WHEN _payload ? 'dosage_form_id' THEN NULLIF(_payload->>'dosage_form_id','')::uuid ELSE public.products.dosage_form_id END,
           unit_id = CASE WHEN _payload ? 'unit_id' THEN NULLIF(_payload->>'unit_id','')::uuid ELSE public.products.unit_id END,
           country_id = CASE WHEN _payload ? 'country_id' THEN NULLIF(_payload->>'country_id','')::uuid ELSE public.products.country_id END,
           tax_class_id = CASE WHEN _payload ? 'tax_class_id' THEN NULLIF(_payload->>'tax_class_id','')::uuid ELSE public.products.tax_class_id END,
           therapeutic_class_id = CASE WHEN _payload ? 'therapeutic_class_id' THEN NULLIF(_payload->>'therapeutic_class_id','')::uuid ELSE public.products.therapeutic_class_id END,
           unit = CASE WHEN _payload ? 'unit' THEN NULLIF(_payload->>'unit','') ELSE public.products.unit END,
           base_unit = CASE WHEN _payload ? 'base_unit' THEN NULLIF(_payload->>'base_unit','') ELSE public.products.base_unit END,
           purchase_unit = CASE WHEN _payload ? 'purchase_unit' THEN NULLIF(_payload->>'purchase_unit','') ELSE public.products.purchase_unit END,
           sale_unit = CASE WHEN _payload ? 'sale_unit' THEN NULLIF(_payload->>'sale_unit','') ELSE public.products.sale_unit END,
           pack_size = COALESCE(NULLIF(_payload->>'pack_size','')::integer, public.products.pack_size),
           qty_per_box = COALESCE(NULLIF(_payload->>'qty_per_box','')::numeric, public.products.qty_per_box),
           medicine_type = CASE WHEN _payload ? 'medicine_type' THEN NULLIF(_payload->>'medicine_type','') ELSE public.products.medicine_type END,
           strength = CASE WHEN _payload ? 'strength' THEN v_strength ELSE public.products.strength END,
           volume = CASE WHEN _payload ? 'volume' THEN NULLIF(_payload->>'volume','') ELSE public.products.volume END,
           country_of_origin = CASE WHEN _payload ? 'country_of_origin' THEN NULLIF(_payload->>'country_of_origin','') ELSE public.products.country_of_origin END,
           purchase_price = COALESCE(NULLIF(_payload->>'purchase_price','')::numeric, public.products.purchase_price),
           retail_price = COALESCE(NULLIF(_payload->>'retail_price','')::numeric, public.products.retail_price),
           dealer_price = COALESCE(NULLIF(_payload->>'dealer_price','')::numeric, public.products.dealer_price),
           wholesale_price = COALESCE(NULLIF(_payload->>'wholesale_price','')::numeric, public.products.wholesale_price),
           mrp = COALESCE(NULLIF(_payload->>'mrp','')::numeric, public.products.mrp),
           average_cost = COALESCE(NULLIF(_payload->>'average_cost','')::numeric, public.products.average_cost),
           opening_stock = COALESCE(NULLIF(_payload->>'opening_stock','')::numeric, public.products.opening_stock),
           reorder_level = COALESCE(NULLIF(_payload->>'reorder_level','')::integer, public.products.reorder_level),
           is_prescription_required = COALESCE(NULLIF(_payload->>'is_prescription_required','')::boolean, public.products.is_prescription_required),
           status = CASE WHEN v_deleted_at IS NOT NULL THEN 'active' ELSE COALESCE(NULLIF(_payload->>'status',''), public.products.status) END,
           is_active = CASE WHEN v_deleted_at IS NOT NULL THEN true ELSE COALESCE(NULLIF(_payload->>'is_active','')::boolean, public.products.is_active) END,
           global_medicine_id = CASE WHEN _payload ? 'global_medicine_id' THEN NULLIF(_payload->>'global_medicine_id','')::uuid ELSE public.products.global_medicine_id END,
           import_batch_id = COALESCE(NULLIF(_payload->>'import_batch_id','')::uuid, public.products.import_batch_id),
           deleted_at = NULL,
           deleted_by = NULL,
           updated_by = COALESCE(NULLIF(_payload->>'updated_by','')::uuid, NULLIF(_payload->>'created_by','')::uuid, public.products.updated_by),
           updated_at = now()
     WHERE id = v_product_id
       AND tenant_id = v_tenant;
  ELSE
    INSERT INTO public.products(
      tenant_id, branch_id, sku, barcode, name, name_bn,
      category_id, manufacturer_id, generic_id,
      unit, pack_size, purchase_price, retail_price, dealer_price, wholesale_price,
      is_prescription_required, is_active, reorder_level,
      base_unit, purchase_unit, sale_unit,
      medicine_type, strength, volume, country_of_origin, status, qty_per_box,
      created_by, updated_by, import_batch_id, global_medicine_id,
      medicine_type_id, dosage_form_id, unit_id, tax_class_id, country_id, therapeutic_class_id,
      mrp, average_cost, opening_stock
    ) VALUES (
      v_tenant, NULLIF(_payload->>'branch_id','')::uuid, v_sku, v_barcode, v_name, NULLIF(_payload->>'name_bn',''),
      NULLIF(_payload->>'category_id','')::uuid, v_manufacturer_id, v_generic_id,
      COALESCE(NULLIF(_payload->>'unit',''), 'Box'), COALESCE(NULLIF(_payload->>'pack_size','')::integer, 1),
      COALESCE(NULLIF(_payload->>'purchase_price','')::numeric, 0), COALESCE(NULLIF(_payload->>'retail_price','')::numeric, 0),
      COALESCE(NULLIF(_payload->>'dealer_price','')::numeric, COALESCE(NULLIF(_payload->>'retail_price','')::numeric, 0)),
      COALESCE(NULLIF(_payload->>'wholesale_price','')::numeric, COALESCE(NULLIF(_payload->>'retail_price','')::numeric, 0)),
      COALESCE(NULLIF(_payload->>'is_prescription_required','')::boolean, false), COALESCE(NULLIF(_payload->>'is_active','')::boolean, true),
      COALESCE(NULLIF(_payload->>'reorder_level','')::integer, 0),
      COALESCE(NULLIF(_payload->>'base_unit',''), COALESCE(NULLIF(_payload->>'unit',''), 'Box')),
      COALESCE(NULLIF(_payload->>'purchase_unit',''), COALESCE(NULLIF(_payload->>'unit',''), 'Box')),
      COALESCE(NULLIF(_payload->>'sale_unit',''), COALESCE(NULLIF(_payload->>'unit',''), 'Box')),
      NULLIF(_payload->>'medicine_type',''), v_strength, NULLIF(_payload->>'volume',''), NULLIF(_payload->>'country_of_origin',''),
      COALESCE(NULLIF(_payload->>'status',''), 'active'), COALESCE(NULLIF(_payload->>'qty_per_box','')::numeric, 1),
      NULLIF(_payload->>'created_by','')::uuid, NULLIF(_payload->>'updated_by','')::uuid, NULLIF(_payload->>'import_batch_id','')::uuid,
      NULLIF(_payload->>'global_medicine_id','')::uuid,
      NULLIF(_payload->>'medicine_type_id','')::uuid, NULLIF(_payload->>'dosage_form_id','')::uuid, NULLIF(_payload->>'unit_id','')::uuid,
      NULLIF(_payload->>'tax_class_id','')::uuid, NULLIF(_payload->>'country_id','')::uuid, NULLIF(_payload->>'therapeutic_class_id','')::uuid,
      COALESCE(NULLIF(_payload->>'mrp','')::numeric, 0), COALESCE(NULLIF(_payload->>'average_cost','')::numeric, 0),
      COALESCE(NULLIF(_payload->>'opening_stock','')::numeric, 0)
    )
    RETURNING id INTO v_product_id;
    v_action := 'inserted';
  END IF;

  RETURN jsonb_build_object('id', v_product_id, 'action', v_action);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_product_revive_first(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_product_revive_first(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.upsert_product_barcodes(_rows jsonb)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r jsonb;
  v_tenant uuid;
  v_product_id uuid;
  v_barcode text;
  v_existing_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR v_tenant IN SELECT DISTINCT NULLIF(x->>'tenant_id','')::uuid FROM jsonb_array_elements(_rows) x LOOP
    IF v_tenant IS NULL OR NOT public.is_tenant_member(v_uid, v_tenant) THEN
      RAISE EXCEPTION 'Forbidden: not a member of tenant %', v_tenant;
    END IF;
  END LOOP;

  FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP
    v_tenant := NULLIF(r->>'tenant_id','')::uuid;
    v_product_id := NULLIF(r->>'product_id','')::uuid;
    v_barcode := NULLIF(r->>'barcode','');
    v_existing_id := NULL;
    IF v_tenant IS NULL OR v_product_id IS NULL OR v_barcode IS NULL THEN
      CONTINUE;
    END IF;

    SELECT pb.id INTO v_existing_id
      FROM public.product_barcodes pb
     WHERE pb.tenant_id = v_tenant
       AND pb.barcode = v_barcode
     ORDER BY (pb.deleted_at IS NULL) DESC, pb.updated_at DESC NULLS LAST, pb.created_at DESC NULLS LAST
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.product_barcodes pb
         SET product_id = v_product_id,
             branch_id = NULLIF(r->>'branch_id','')::uuid,
             barcode_type = COALESCE(NULLIF(r->>'barcode_type',''), pb.barcode_type, 'Code128'),
             label_size = COALESCE(NULLIF(r->>'label_size',''), pb.label_size),
             is_primary = COALESCE(NULLIF(r->>'is_primary','')::boolean, pb.is_primary, true),
             status = COALESCE(NULLIF(r->>'status',''), 'active'),
             import_batch_id = COALESCE(NULLIF(r->>'import_batch_id','')::uuid, pb.import_batch_id),
             deleted_at = NULL,
             deleted_by = NULL,
             updated_by = COALESCE(NULLIF(r->>'updated_by','')::uuid, v_uid),
             updated_at = now()
       WHERE pb.id = v_existing_id;
      id := v_existing_id;
      RETURN NEXT;
    ELSE
      INSERT INTO public.product_barcodes(
        tenant_id, branch_id, product_id, barcode, barcode_type,
        label_size, is_primary, status, created_by, updated_by, import_batch_id
      ) VALUES (
        v_tenant,
        NULLIF(r->>'branch_id','')::uuid,
        v_product_id,
        v_barcode,
        COALESCE(NULLIF(r->>'barcode_type',''), 'Code128'),
        NULLIF(r->>'label_size',''),
        COALESCE(NULLIF(r->>'is_primary','')::boolean, true),
        COALESCE(NULLIF(r->>'status',''), 'active'),
        COALESCE(NULLIF(r->>'created_by','')::uuid, v_uid),
        COALESCE(NULLIF(r->>'updated_by','')::uuid, v_uid),
        NULLIF(r->>'import_batch_id','')::uuid
      )
      ON CONFLICT (tenant_id, barcode) WHERE deleted_at IS NULL DO UPDATE
        SET product_id = EXCLUDED.product_id,
            branch_id = EXCLUDED.branch_id,
            barcode_type = EXCLUDED.barcode_type,
            is_primary = EXCLUDED.is_primary,
            status = 'active',
            updated_by = EXCLUDED.updated_by,
            updated_at = now()
      RETURNING public.product_barcodes.id INTO id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_product_barcodes(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_product_barcodes(jsonb) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.process_product_import_chunk_v2(_job uuid, _batch integer DEFAULT 500)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _job_row public.import_jobs_v2%ROWTYPE;
  _processed int := 0; _imported int := 0; _failed int := 0; _skipped int := 0;
  _row record; _new_product_id uuid; _barcode text; _sku text;
  _opening numeric; _avg_cost numeric; _mrp numeric; _retail numeric;
  _branch uuid; _warehouse uuid; _batch_id uuid; _expiry date;
  _mv_id uuid; _existing_qty numeric; _batch_deleted_at timestamptz;
  _product_res jsonb; _product_action text;
BEGIN
  SELECT * INTO _job_row FROM public.import_jobs_v2 WHERE id = _job FOR UPDATE;
  IF _job_row.id IS NULL THEN RAISE EXCEPTION 'job not found'; END IF;
  IF _job_row.status NOT IN ('running','masters_approved') THEN
    RETURN jsonb_build_object('status', _job_row.status, 'has_more', false); END IF;
  IF _job_row.status = 'masters_approved' THEN
    UPDATE public.import_jobs_v2 SET status='running', started_at=COALESCE(started_at, now()) WHERE id=_job;
  END IF;

  FOR _row IN
    SELECT id, row_number, normalized FROM public.import_staging_rows
     WHERE job_id = _job AND status IN ('ready','error')
     ORDER BY row_number LIMIT _batch FOR UPDATE SKIP LOCKED
  LOOP
    _processed := _processed + 1;
    BEGIN
      _barcode := COALESCE(NULLIF(_row.normalized->>'barcode',''), public.next_internal_barcode(_job_row.tenant_id));
      _sku := COALESCE(NULLIF(_row.normalized->>'sku',''), _barcode, 'SKU-'||_row.row_number||'-'||substr(_job::text,1,8));
      _opening := COALESCE(NULLIF(_row.normalized->>'opening_stock','')::numeric, 0);
      _avg_cost := COALESCE(NULLIF(_row.normalized->>'purchase_price','')::numeric, 0);
      _mrp := COALESCE(NULLIF(_row.normalized->>'mrp','')::numeric, 0);
      _retail := COALESCE(NULLIF(_row.normalized->>'retail_price','')::numeric, 0);

      _branch := NULLIF(_row.normalized->>'branch_id','')::uuid;
      IF _branch IS NULL THEN
        _branch := public.resolve_user_branch(_job_row.tenant_id, _job_row.created_by);
      END IF;
      IF _branch IS NULL THEN
        SELECT id INTO _branch FROM public.branches
         WHERE tenant_id=_job_row.tenant_id AND is_active=true AND deleted_at IS NULL
         ORDER BY is_main DESC, created_at ASC LIMIT 1;
      END IF;
      IF _branch IS NULL THEN
        RAISE EXCEPTION 'No branch resolvable for tenant (required for inventory initialization)';
      END IF;

      SELECT id INTO _warehouse FROM public.warehouses
       WHERE tenant_id=_job_row.tenant_id AND branch_id=_branch
         AND is_active=true AND deleted_at IS NULL
       ORDER BY is_default DESC, created_at ASC LIMIT 1;

      _product_res := public.resolve_product_revive_first(jsonb_build_object(
          'tenant_id', _job_row.tenant_id,
          'branch_id', _branch,
          'sku', _sku,
          'barcode', _barcode,
          'name', _row.normalized->>'name',
          'name_bn', _row.normalized->>'name_bn',
          'manufacturer_id', NULLIF(_row.normalized->>'manufacturer_id',''),
          'generic_id', NULLIF(_row.normalized->>'generic_id',''),
          'category_id', NULLIF(_row.normalized->>'category_id',''),
          'medicine_type_id', NULLIF(_row.normalized->>'medicine_type_id',''),
          'dosage_form_id', NULLIF(_row.normalized->>'dosage_form_id',''),
          'unit_id', NULLIF(_row.normalized->>'unit_id',''),
          'country_id', NULLIF(_row.normalized->>'country_id',''),
          'tax_class_id', NULLIF(_row.normalized->>'tax_class_id',''),
          'therapeutic_class_id', NULLIF(_row.normalized->>'therapeutic_class_id',''),
          'medicine_type', _row.normalized->>'medicine_type',
          'strength', _row.normalized->>'strength',
          'volume', _row.normalized->>'volume',
          'purchase_price', _avg_cost,
          'retail_price', _retail,
          'mrp', _mrp,
          'opening_stock', _opening,
          'average_cost', _avg_cost,
          'is_prescription_required', COALESCE(NULLIF(_row.normalized->>'is_prescription_required','')::boolean, false),
          'status', 'active',
          'is_active', true,
          'import_batch_id', _job_row.batch_id,
          'created_by', _job_row.created_by,
          'updated_by', _job_row.created_by
      ));
      _new_product_id := (_product_res->>'id')::uuid;
      _product_action := _product_res->>'action';
      UPDATE public.import_staging_rows SET product_id = _new_product_id WHERE id = _row.id;

      IF _barcode IS NOT NULL THEN
        PERFORM id FROM public.upsert_product_barcodes(jsonb_build_array(jsonb_build_object(
          'tenant_id', _job_row.tenant_id,
          'branch_id', _branch,
          'product_id', _new_product_id,
          'barcode', _barcode,
          'barcode_type', 'EAN13',
          'is_primary', true,
          'status', 'active',
          'import_batch_id', _job_row.batch_id,
          'created_by', _job_row.created_by,
          'updated_by', _job_row.created_by
        )));
      END IF;

      _expiry := DATE '2099-12-31';
      _batch_id := NULL; _existing_qty := NULL; _batch_deleted_at := NULL;

      SELECT id, qty_on_hand, deleted_at INTO _batch_id, _existing_qty, _batch_deleted_at
        FROM public.batches
       WHERE tenant_id = _job_row.tenant_id
         AND product_id = _new_product_id
         AND is_opening = true
       ORDER BY (deleted_at IS NULL) DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT 1;

      IF _batch_id IS NOT NULL THEN
        UPDATE public.batches
           SET qty_on_hand    = _opening,
               branch_id      = _branch,
               warehouse_id   = _warehouse,
               expiry_date    = _expiry,
               mrp            = _mrp,
               import_batch_id= _job_row.batch_id,
               deleted_at     = NULL,
               deleted_by     = NULL,
               status         = 'active',
               updated_by     = _job_row.created_by,
               updated_at     = now()
         WHERE id = _batch_id;
      ELSE
        INSERT INTO public.batches(
          tenant_id, product_id, batch_no, expiry_date, purchase_price, qty_on_hand,
          branch_id, warehouse_id, is_opening, mrp, source, import_batch_id, created_by, updated_by, status
        ) VALUES (
          _job_row.tenant_id, _new_product_id, 'OPENING', _expiry, _avg_cost, _opening,
          _branch, _warehouse, true, _mrp, 'import', _job_row.batch_id, _job_row.created_by, _job_row.created_by, 'active'
        ) RETURNING id INTO _batch_id;
      END IF;

      SELECT id INTO _mv_id
        FROM public.stock_movements
       WHERE tenant_id = _job_row.tenant_id
         AND batch_id = _batch_id
         AND movement_type = 'opening'
       LIMIT 1;

      IF _mv_id IS NOT NULL THEN
        UPDATE public.stock_movements
           SET product_id = _new_product_id,
               qty_change = _opening,
               qty_after = _opening,
               reference_table = 'import_jobs_v2',
               reference_no = 'IMPORT',
               branch_id = _branch,
               warehouse_id = _warehouse,
               user_id = _job_row.created_by,
               notes = 'Opening import'
         WHERE id = _mv_id;
      ELSE
        INSERT INTO public.stock_movements(
          tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
          reference_table, reference_no, branch_id, warehouse_id, user_id, notes
        ) VALUES (
          _job_row.tenant_id, _new_product_id, _batch_id, 'opening', _opening, _opening,
          'import_jobs_v2', 'IMPORT', _branch, _warehouse, _job_row.created_by, 'Opening import'
        );
      END IF;

      UPDATE public.products SET average_cost = _avg_cost, updated_at = now()
       WHERE id = _new_product_id;

      IF _existing_qty IS NULL THEN
        INSERT INTO public.inventory_revaluation_log(tenant_id, batch_id, old_cost, new_cost, reason, created_by)
        VALUES (_job_row.tenant_id, _batch_id, 0, _avg_cost, 'opening_import', _job_row.created_by);
      END IF;

      UPDATE public.import_staging_rows
         SET status='imported', product_id=_new_product_id
       WHERE id = _row.id;
      IF _product_action = 'inserted' THEN
        _imported := _imported + 1;
      ELSE
        _imported := _imported + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      _failed := _failed + 1;
      UPDATE public.import_staging_rows
         SET status='error',
             field_errors = COALESCE(field_errors,'{}'::jsonb) || jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE)
       WHERE id = _row.id;
      INSERT INTO public.import_errors_v2(job_id, tenant_id, row_number, product_name, error_code, error_message, reason)
      VALUES (_job, _job_row.tenant_id, _row.row_number, _row.normalized->>'name', SQLSTATE, SQLERRM, SQLERRM);
    END;
  END LOOP;

  UPDATE public.import_jobs_v2
     SET parsed_rows    = COALESCE(parsed_rows,0)    + _processed,
         imported_rows  = COALESCE(imported_rows,0)  + _imported,
         failed_rows    = COALESCE(failed_rows,0)    + _failed,
         skipped_rows   = COALESCE(skipped_rows,0)   + _skipped,
         status         = CASE
            WHEN (SELECT count(*) FROM public.import_staging_rows
                   WHERE job_id=_job AND status IN ('ready','error')) = 0
              THEN 'completed' ELSE 'running' END,
         finished_at    = CASE
            WHEN (SELECT count(*) FROM public.import_staging_rows
                   WHERE job_id=_job AND status IN ('ready','error')) = 0
              THEN now() ELSE finished_at END,
         duration_ms    = CASE
            WHEN (SELECT count(*) FROM public.import_staging_rows
                   WHERE job_id=_job AND status IN ('ready','error')) = 0
              THEN (EXTRACT(EPOCH FROM (now() - COALESCE(started_at, now())))*1000)::int
              ELSE duration_ms END,
         updated_at     = now()
   WHERE id = _job;

  RETURN jsonb_build_object(
    'processed', _processed, 'imported', _imported, 'failed', _failed, 'skipped', _skipped,
    'has_more', EXISTS(SELECT 1 FROM public.import_staging_rows WHERE job_id=_job AND status IN ('ready','error'))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_product_import_chunk_v2(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_product_import_chunk_v2(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.process_global_import_chunk(_job uuid, _batch integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  v_sku text;
  v_error text;
  v_master_cache jsonb := '{}'::jsonb;
  v_cache_key text;
  v_cache_code text;
  v_res jsonb;
  v_batch_id uuid;
  v_existing_qty numeric;
  v_mv_id uuid;
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
           gm.dosage_form AS form,
           (SELECT gb.barcode FROM public.global_barcodes gb WHERE gb.global_medicine_id = gm.id ORDER BY gb.verified DESC, gb.created_at ASC LIMIT 1) AS primary_barcode
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

      v_res := public.resolve_product_revive_first(jsonb_build_object(
        'tenant_id', j.tenant_id,
        'branch_id', j.branch_id,
        'sku', v_sku,
        'barcode', rec.primary_barcode,
        'name', rec.brand_name,
        'generic_id', v_gen_id,
        'manufacturer_id', v_mfr_id,
        'category_id', v_cat_id,
        'purchase_price', v_purchase,
        'retail_price', v_sale,
        'dealer_price', v_sale,
        'wholesale_price', v_sale,
        'is_prescription_required', COALESCE(rec.prescription_required,false),
        'is_active', (v_status_default='active'),
        'status', v_status_default,
        'medicine_type', rec.form,
        'strength', rec.strength,
        'global_medicine_id', rec.id,
        'import_batch_id', j.id,
        'created_by', v_uid,
        'updated_by', v_uid
      ));
      v_product_id := (v_res->>'id')::uuid;

      IF v_create_barcode THEN
        PERFORM id
          FROM public.upsert_product_barcodes(COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'tenant_id', j.tenant_id,
              'branch_id', j.branch_id,
              'product_id', v_product_id,
              'barcode', gb.barcode,
              'barcode_type', gb.barcode_type,
              'is_primary', gb.barcode = rec.primary_barcode,
              'status', 'active',
              'import_batch_id', j.id,
              'created_by', v_uid,
              'updated_by', v_uid
            ))
            FROM public.global_barcodes gb
            WHERE gb.global_medicine_id = rec.id
          ), '[]'::jsonb));
      END IF;

      IF v_create_inv AND j.warehouse_id IS NOT NULL AND v_open_stock > 0 THEN
        v_batch_id := NULL;
        v_existing_qty := NULL;
        SELECT b.id, b.qty_on_hand INTO v_batch_id, v_existing_qty
          FROM public.batches b
         WHERE b.tenant_id = j.tenant_id
           AND b.product_id = v_product_id
           AND b.is_opening = true
         ORDER BY (b.deleted_at IS NULL) DESC, b.updated_at DESC NULLS LAST, b.created_at DESC NULLS LAST
         LIMIT 1;

        IF v_batch_id IS NOT NULL THEN
          UPDATE public.batches
             SET qty_on_hand = v_open_stock,
                 branch_id = j.branch_id,
                 warehouse_id = j.warehouse_id,
                 expiry_date = '2099-12-31',
                 deleted_at = NULL,
                 deleted_by = NULL,
                 status = 'active',
                 updated_by = v_uid,
                 updated_at = now()
           WHERE id = v_batch_id;
        ELSE
          INSERT INTO public.batches(
            tenant_id, branch_id, warehouse_id, product_id, batch_no,
            expiry_date, purchase_price, qty_on_hand, is_opening,
            created_by, updated_by, source, import_batch_id
          ) VALUES (
            j.tenant_id, j.branch_id, j.warehouse_id, v_product_id,
            'OPENING-' || substr(replace(v_product_id::text, '-', ''), 1, 12),
            '2099-12-31', v_purchase, v_open_stock, true,
            v_uid, v_uid, 'global_import', j.id
          ) RETURNING id INTO v_batch_id;
        END IF;

        SELECT id INTO v_mv_id
          FROM public.stock_movements
         WHERE tenant_id = j.tenant_id
           AND batch_id = v_batch_id
           AND movement_type = 'opening'
         LIMIT 1;

        IF v_mv_id IS NOT NULL THEN
          UPDATE public.stock_movements
             SET product_id = v_product_id,
                 qty_change = v_open_stock,
                 qty_after = v_open_stock,
                 branch_id = j.branch_id,
                 warehouse_id = j.warehouse_id,
                 notes = 'Global Catalog Opening Import'
           WHERE id = v_mv_id;
        ELSE
          INSERT INTO public.stock_movements(
            tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
            reference_table, reference_id, reference_no, branch_id, warehouse_id, user_id, notes
          ) VALUES (
            j.tenant_id, v_product_id, v_batch_id, 'opening', v_open_stock, v_open_stock,
            'import_jobs', j.id, 'GLOBAL_IMPORT', j.branch_id, j.warehouse_id, v_uid, 'Global Catalog Opening Import'
          );
        END IF;

        IF v_existing_qty IS NULL THEN
          INSERT INTO public.inventory_revaluation_log(tenant_id, batch_id, old_cost, new_cost, reason, created_by)
          VALUES (j.tenant_id, v_batch_id, 0, v_purchase, 'global_opening_import', v_uid);
        END IF;
      END IF;

      IF v_res->>'action' = 'inserted' THEN
        v_imported := v_imported + 1;
      ELSE
        v_skipped := v_skipped + 1;
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

REVOKE ALL ON FUNCTION public.process_global_import_chunk(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_global_import_chunk(uuid, integer) TO authenticated, service_role;
