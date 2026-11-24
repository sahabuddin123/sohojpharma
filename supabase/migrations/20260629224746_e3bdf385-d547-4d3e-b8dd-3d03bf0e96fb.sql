CREATE OR REPLACE FUNCTION public.process_product_import_chunk_v2(_job uuid, _batch integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _job_row public.import_jobs_v2%ROWTYPE;
  _processed int := 0; _imported int := 0; _failed int := 0; _skipped int := 0;
  _row record; _new_product_id uuid; _barcode text;
  _opening numeric; _avg_cost numeric; _mrp numeric;
  _branch uuid; _warehouse uuid; _batch_id uuid; _expiry date;
  _mv_id uuid;
  _existing_qty numeric;
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
      _opening := COALESCE((_row.normalized->>'opening_stock')::numeric, 0);
      _avg_cost := COALESCE((_row.normalized->>'purchase_price')::numeric, 0);
      _mrp := COALESCE((_row.normalized->>'mrp')::numeric, 0);

      SELECT product_id INTO _new_product_id FROM public.import_staging_rows WHERE id = _row.id;
      IF _new_product_id IS NULL THEN
        INSERT INTO public.products(
          tenant_id, sku, barcode, name, name_bn,
          manufacturer_id, generic_id, category_id, medicine_type_id, dosage_form_id,
          unit_id, country_id, tax_class_id, therapeutic_class_id,
          medicine_type, strength, volume,
          purchase_price, retail_price, mrp, opening_stock, average_cost,
          is_prescription_required, status, import_batch_id, created_by
        ) VALUES (
          _job_row.tenant_id,
          COALESCE(NULLIF(_row.normalized->>'sku',''), 'SKU-'||_row.row_number||'-'||substr(_job::text,1,8)),
          _barcode, _row.normalized->>'name', _row.normalized->>'name_bn',
          NULLIF(_row.normalized->>'manufacturer_id','')::uuid,
          NULLIF(_row.normalized->>'generic_id','')::uuid,
          NULLIF(_row.normalized->>'category_id','')::uuid,
          NULLIF(_row.normalized->>'medicine_type_id','')::uuid,
          NULLIF(_row.normalized->>'dosage_form_id','')::uuid,
          NULLIF(_row.normalized->>'unit_id','')::uuid,
          NULLIF(_row.normalized->>'country_id','')::uuid,
          NULLIF(_row.normalized->>'tax_class_id','')::uuid,
          NULLIF(_row.normalized->>'therapeutic_class_id','')::uuid,
          _row.normalized->>'medicine_type', _row.normalized->>'strength', _row.normalized->>'volume',
          _avg_cost,
          COALESCE((_row.normalized->>'retail_price')::numeric, 0),
          _mrp, _opening, _avg_cost,
          COALESCE((_row.normalized->>'is_prescription_required')::boolean, false),
          'active', _job_row.batch_id, _job_row.created_by
        ) RETURNING id INTO _new_product_id;

        UPDATE public.import_staging_rows SET product_id = _new_product_id WHERE id = _row.id;
      END IF;

      INSERT INTO public.product_barcodes(tenant_id, product_id, barcode, barcode_type, is_primary, import_batch_id, created_by)
      VALUES (_job_row.tenant_id, _new_product_id, _barcode, 'EAN13', true, _job_row.batch_id, _job_row.created_by)
      ON CONFLICT (tenant_id, barcode) WHERE deleted_at IS NULL DO NOTHING;

      _branch := NULLIF(_row.normalized->>'branch_id','')::uuid;
      IF _branch IS NULL THEN
        _branch := public.resolve_user_branch(_job_row.tenant_id, _job_row.created_by);
      END IF;
      IF _branch IS NULL THEN
        SELECT id INTO _branch FROM public.branches
         WHERE tenant_id=_job_row.tenant_id AND is_active=true AND deleted_at IS NULL
         ORDER BY is_main DESC, created_at ASC LIMIT 1;
      END IF;

      IF _opening > 0 THEN
        IF _branch IS NULL THEN
          RAISE EXCEPTION 'Please select a branch (opening stock > 0 requires a branch)';
        END IF;

        SELECT id INTO _warehouse FROM public.warehouses
         WHERE tenant_id=_job_row.tenant_id AND branch_id=_branch
           AND is_active=true AND deleted_at IS NULL
         ORDER BY is_default DESC, created_at ASC LIMIT 1;

        _expiry := DATE '2099-12-31';
        _batch_id := NULL;
        _existing_qty := NULL;

        SELECT id, qty_on_hand INTO _batch_id, _existing_qty
          FROM public.batches
         WHERE tenant_id = _job_row.tenant_id
           AND product_id = _new_product_id
           AND is_opening = true
           AND deleted_at IS NULL
         LIMIT 1;

        IF _batch_id IS NOT NULL THEN
          -- Cost is locked once stock exists. Refresh only non-cost fields on retry.
          -- purchase_price / unit_cost are intentionally NOT updated here.
          UPDATE public.batches
             SET qty_on_hand    = _opening,
                 branch_id      = _branch,
                 warehouse_id   = _warehouse,
                 expiry_date    = _expiry,
                 mrp            = _mrp,
                 import_batch_id= _job_row.batch_id,
                 updated_at     = now()
           WHERE id = _batch_id;
        ELSE
          INSERT INTO public.batches(
            tenant_id, product_id, batch_no, expiry_date, purchase_price, unit_cost, qty_on_hand,
            branch_id, warehouse_id, is_opening, mrp, source, import_batch_id, created_by, status
          ) VALUES (
            _job_row.tenant_id, _new_product_id, 'OPENING', _expiry, _avg_cost, _avg_cost, _opening,
            _branch, _warehouse, true, _mrp, 'import', _job_row.batch_id, _job_row.created_by, 'active'
          ) RETURNING id INTO _batch_id;
        END IF;

        SELECT id INTO _mv_id
          FROM public.stock_movements
         WHERE tenant_id = _job_row.tenant_id
           AND product_id = _new_product_id
           AND batch_id = _batch_id
           AND movement_type = 'opening'
           AND reference_no = 'IMPORT'
         LIMIT 1;

        IF _mv_id IS NOT NULL THEN
          UPDATE public.stock_movements
             SET qty_change = _opening,
                 qty_after  = _opening,
                 branch_id  = _branch,
                 warehouse_id = _warehouse
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
      END IF;

      UPDATE public.import_staging_rows
         SET status='imported', product_id=_new_product_id, processed_at=now()
       WHERE id = _row.id;
      _imported := _imported + 1;

    EXCEPTION WHEN OTHERS THEN
      _failed := _failed + 1;
      UPDATE public.import_staging_rows
         SET status='error', error=SQLERRM, processed_at=now()
       WHERE id = _row.id;
      INSERT INTO public.import_errors_v2(job_id, tenant_id, row_number, product_name, error_code, error_message, reason)
      VALUES (_job, _job_row.tenant_id, _row.row_number, _row.normalized->>'name', SQLSTATE, SQLERRM, SQLERRM);
    END;
  END LOOP;

  UPDATE public.import_jobs_v2
     SET processed_rows = COALESCE(processed_rows,0) + _processed,
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
              THEN EXTRACT(EPOCH FROM (now() - COALESCE(started_at, now())))*1000
              ELSE duration_ms END
   WHERE id = _job;

  RETURN jsonb_build_object(
    'processed', _processed, 'imported', _imported, 'failed', _failed, 'skipped', _skipped,
    'has_more', EXISTS(SELECT 1 FROM public.import_staging_rows WHERE job_id=_job AND status IN ('ready','error'))
  );
END $function$;
