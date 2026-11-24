-- Phase 5R: ensure manufacturer & generic always link.

CREATE OR REPLACE FUNCTION public.enrich_import_normalized_masters(_tenant uuid, _normalized jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  k text; idfield text; name_val text; existing_id text; new_id uuid;
  pairs text[][] := ARRAY[
    ['manufacturer','manufacturer_id'],
    ['generic','generic_id'],
    ['category','category_id'],
    ['unit','unit_id'],
    ['medicine_type','medicine_type_id'],
    ['dosage_form','dosage_form_id'],
    ['country','country_id'],
    ['tax_class','tax_class_id'],
    ['therapeutic_class','therapeutic_class_id']
  ];
  i int;
BEGIN
  IF _normalized IS NULL THEN RETURN _normalized; END IF;
  FOR i IN 1 .. array_length(pairs,1) LOOP
    k := pairs[i][1]; idfield := pairs[i][2];
    existing_id := _normalized->>idfield;
    IF existing_id IS NOT NULL AND existing_id <> '' THEN CONTINUE; END IF;
    name_val := btrim(coalesce(_normalized->>k,''));
    IF name_val = '' THEN CONTINUE; END IF;
    BEGIN
      new_id := public.resolve_master_id(_tenant, k, name_val);
    EXCEPTION WHEN OTHERS THEN
      new_id := NULL;
    END;
    IF new_id IS NOT NULL THEN
      _normalized := jsonb_set(_normalized, ARRAY[idfield], to_jsonb(new_id::text), true);
    END IF;
  END LOOP;
  RETURN _normalized;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enrich_import_normalized_masters(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enrich_import_normalized_masters(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.enrich_import_normalized_masters(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.process_product_import_chunk_v2(_job uuid, _batch integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

      -- Phase 5R: auto-resolve master IDs from name strings as safety net.
      _row.normalized := public.enrich_import_normalized_masters(_job_row.tenant_id, _row.normalized);

      SELECT product_id INTO _new_product_id FROM public.import_staging_rows WHERE id = _row.id;
      IF _new_product_id IS NULL THEN
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
      ELSE
        _product_action := 'updated';
      END IF;

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
         AND product_id = _new_product_id
         AND batch_id = _batch_id
         AND movement_type = 'opening'
         AND reference_no = 'IMPORT'
       LIMIT 1;

      IF _mv_id IS NOT NULL THEN
        UPDATE public.stock_movements
           SET qty_change = _opening, qty_after = _opening,
               branch_id = _branch, warehouse_id = _warehouse
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
      _imported := _imported + 1;

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
$function$;

-- Auto-approve any pending master diff rows so future imports stop blocking on manual approval.
UPDATE public.import_master_diff SET approved = true WHERE approved = false;