
-- Phase 5H: Idempotency indexes for inventory pipeline
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_barcodes_tenant_barcode_active
  ON public.product_barcodes(tenant_id, barcode) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_opening_batch
  ON public.stock_movements(tenant_id, batch_id) WHERE movement_type = 'opening';

-- Phase 5H: Full inventory pipeline inside process_product_import_chunk_v2
CREATE OR REPLACE FUNCTION public.process_product_import_chunk_v2(_job uuid, _batch int DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _job_row public.import_jobs_v2%ROWTYPE;
  _processed int := 0; _imported int := 0; _failed int := 0; _skipped int := 0;
  _row record; _new_product_id uuid; _barcode text;
  _opening numeric; _avg_cost numeric; _mrp numeric;
  _branch uuid; _warehouse uuid; _batch_id uuid; _expiry date;
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
      -- 1. Product (idempotent on existing staging.product_id)
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
      END IF;

      -- 2. Primary barcode (idempotent)
      INSERT INTO public.product_barcodes(tenant_id, product_id, barcode, barcode_type, is_primary, import_batch_id, created_by)
      VALUES (_job_row.tenant_id, _new_product_id, _barcode, 'EAN13', true, _job_row.batch_id, _job_row.created_by)
      ON CONFLICT (tenant_id, barcode) WHERE deleted_at IS NULL DO NOTHING;

      -- 3. Branch resolution (explicit -> user default -> tenant primary -> first active)
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

        -- Warehouse: default for branch if any
        SELECT id INTO _warehouse FROM public.warehouses
         WHERE tenant_id=_job_row.tenant_id AND branch_id=_branch
           AND is_active=true AND deleted_at IS NULL
         ORDER BY is_default DESC, created_at ASC LIMIT 1;

        _expiry := DATE '2099-12-31';

        -- 4. Opening batch (idempotent via UNIQUE tenant/product/batch_no/expiry)
        INSERT INTO public.batches(
          tenant_id, product_id, batch_no, expiry_date, purchase_price, qty_on_hand,
          branch_id, warehouse_id, is_opening, mrp, source, import_batch_id, created_by, status
        ) VALUES (
          _job_row.tenant_id, _new_product_id, 'OPENING', _expiry, _avg_cost, _opening,
          _branch, _warehouse, true, _mrp, 'import', _job_row.batch_id, _job_row.created_by, 'active'
        )
        ON CONFLICT (tenant_id, product_id, batch_no, expiry_date) DO UPDATE
          SET qty_on_hand    = EXCLUDED.qty_on_hand,
              purchase_price = EXCLUDED.purchase_price,
              branch_id      = EXCLUDED.branch_id,
              warehouse_id   = EXCLUDED.warehouse_id,
              mrp            = EXCLUDED.mrp,
              import_batch_id= EXCLUDED.import_batch_id,
              updated_at     = now()
        RETURNING id INTO _batch_id;

        -- 5. Opening stock movement (idempotent via partial unique)
        INSERT INTO public.stock_movements(
          tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
          reference_table, reference_no, branch_id, warehouse_id, user_id, notes
        ) VALUES (
          _job_row.tenant_id, _new_product_id, _batch_id, 'opening', _opening, _opening,
          'import_jobs_v2', 'IMPORT', _branch, _warehouse, _job_row.created_by, 'Opening import'
        )
        ON CONFLICT (tenant_id, batch_id) WHERE movement_type='opening' DO NOTHING;

        -- 6. Average cost
        UPDATE public.products SET average_cost = _avg_cost, updated_at = now()
         WHERE id = _new_product_id;

        -- 7. Inventory revaluation log
        INSERT INTO public.inventory_revaluation_log(tenant_id, batch_id, old_cost, new_cost, reason, created_by)
        VALUES (_job_row.tenant_id, _batch_id, 0, _avg_cost, 'opening_import', _job_row.created_by);
      ELSE
        UPDATE public.products SET average_cost = _avg_cost WHERE id = _new_product_id AND average_cost = 0;
      END IF;

      -- 8. Mark staging row imported
      UPDATE public.import_staging_rows SET status='imported', product_id=_new_product_id WHERE id=_row.id;
      _imported := _imported + 1;

      INSERT INTO public.import_audit(job_id, tenant_id, from_status, to_status, actor, detail)
      VALUES (_job, _job_row.tenant_id, 'running', 'row_imported', _job_row.created_by,
              jsonb_build_object('product_id', _new_product_id, 'batch_id', _batch_id,
                                 'branch_id', _branch, 'row', _row.row_number, 'opening', _opening));
    EXCEPTION WHEN OTHERS THEN
      _failed := _failed + 1;
      UPDATE public.import_staging_rows SET status='error' WHERE id=_row.id;
      INSERT INTO public.import_errors_v2(job_id, tenant_id, row_number, error_code, error_message, raw)
      VALUES (_job, _job_row.tenant_id, _row.row_number, SQLSTATE, SQLERRM, _row.normalized);
    END;
  END LOOP;

  UPDATE public.import_jobs_v2
     SET imported_rows = imported_rows + _imported,
         failed_rows = failed_rows + _failed,
         skipped_rows = skipped_rows + _skipped,
         cursor_row = cursor_row + _processed, updated_at = now()
   WHERE id = _job;
  IF _processed = 0 THEN
    UPDATE public.import_jobs_v2
       SET status='completed', finished_at=now(),
           duration_ms = COALESCE(EXTRACT(EPOCH FROM (now() - started_at)) * 1000, 0)::int
     WHERE id=_job AND status='running';
  END IF;
  RETURN jsonb_build_object('processed', _processed, 'imported', _imported,
                            'failed', _failed, 'skipped', _skipped, 'has_more', _processed = _batch);
END $$;

REVOKE EXECUTE ON FUNCTION public.process_product_import_chunk_v2(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_product_import_chunk_v2(uuid, int) TO authenticated, service_role;

-- Phase 5H: Extended rollback (products, barcodes, batches, stock_movements, revaluation)
CREATE OR REPLACE FUNCTION public.rollback_product_import_v2(_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _job_row public.import_jobs_v2%ROWTYPE;
  _products int := 0; _batches int := 0; _barcodes int := 0;
  _movements int := 0; _reval int := 0;
BEGIN
  SELECT * INTO _job_row FROM public.import_jobs_v2 WHERE id = _job FOR UPDATE;
  IF _job_row.id IS NULL THEN RAISE EXCEPTION 'job not found'; END IF;

  -- Delete revaluation log entries tied to import batches
  DELETE FROM public.inventory_revaluation_log
   WHERE tenant_id=_job_row.tenant_id
     AND batch_id IN (SELECT id FROM public.batches
                       WHERE tenant_id=_job_row.tenant_id AND import_batch_id=_job_row.batch_id);
  GET DIAGNOSTICS _reval = ROW_COUNT;

  -- Delete stock movements (opening only) for these batches
  DELETE FROM public.stock_movements
   WHERE tenant_id=_job_row.tenant_id
     AND batch_id IN (SELECT id FROM public.batches
                       WHERE tenant_id=_job_row.tenant_id AND import_batch_id=_job_row.batch_id);
  GET DIAGNOSTICS _movements = ROW_COUNT;

  -- Soft delete batches
  UPDATE public.batches SET deleted_at=now()
   WHERE tenant_id=_job_row.tenant_id AND import_batch_id=_job_row.batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS _batches = ROW_COUNT;

  -- Soft delete barcodes
  UPDATE public.product_barcodes SET deleted_at=now()
   WHERE tenant_id=_job_row.tenant_id AND import_batch_id=_job_row.batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS _barcodes = ROW_COUNT;

  -- Soft delete products
  UPDATE public.products SET deleted_at=now(), is_active=false
   WHERE tenant_id=_job_row.tenant_id AND import_batch_id=_job_row.batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS _products = ROW_COUNT;

  -- Reset staging counters
  UPDATE public.import_staging_rows SET status='skipped'
   WHERE job_id=_job AND status='imported';

  UPDATE public.import_jobs_v2
     SET status='rolled_back', rolled_back_at=now(),
         imported_rows=0, failed_rows=0, updated_at=now()
   WHERE id=_job;

  INSERT INTO public.import_audit(job_id, tenant_id, from_status, to_status, actor, detail)
  VALUES (_job, _job_row.tenant_id, _job_row.status, 'rolled_back', auth.uid(),
          jsonb_build_object('products', _products, 'batches', _batches, 'barcodes', _barcodes,
                             'movements', _movements, 'revaluation', _reval));
  RETURN jsonb_build_object('products', _products, 'batches', _batches, 'barcodes', _barcodes,
                            'movements', _movements, 'revaluation', _reval);
END $$;

REVOKE EXECUTE ON FUNCTION public.rollback_product_import_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_product_import_v2(uuid) TO authenticated, service_role;
