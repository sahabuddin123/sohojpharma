
-- SECURITY FIX: payment_gateways secret/api key exposure
REVOKE SELECT ON public.payment_gateways FROM authenticated;
GRANT SELECT
  (id, tenant_id, provider, merchant_id, webhook_url, sandbox, status,
   created_by, created_at, updated_at)
  ON public.payment_gateways TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_gateways TO authenticated;
GRANT ALL ON public.payment_gateways TO service_role;

CREATE OR REPLACE FUNCTION public.get_payment_gateway_secrets(_gateway_id uuid)
RETURNS TABLE(api_key text, secret_key text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid;
BEGIN
  SELECT tenant_id INTO _tenant FROM public.payment_gateways WHERE id = _gateway_id;
  IF _tenant IS NULL THEN RETURN; END IF;
  IF NOT public.has_role(auth.uid(), _tenant, 'owner'::app_role) THEN
    RAISE EXCEPTION 'forbidden: owner role required';
  END IF;
  RETURN QUERY
    SELECT pg.api_key, pg.secret_key FROM public.payment_gateways pg WHERE pg.id = _gateway_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_payment_gateway_secrets(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_payment_gateway_secrets(uuid) TO authenticated;

-- PHASE 3 TABLES ---------------------------------------------------------
CREATE TABLE public.import_jobs_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  vendor text,
  file_name text NOT NULL,
  file_path text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  parsed_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'uploaded'
    CHECK (status IN ('uploaded','analyzing','analyzed','masters_pending','masters_approved',
                      'running','paused','completed','failed','cancelled','rolled_back')),
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  cursor_row integer NOT NULL DEFAULT 0,
  error_message text,
  rolled_back_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_jobs_v2_tenant ON public.import_jobs_v2(tenant_id, created_at DESC);
CREATE INDEX idx_import_jobs_v2_status ON public.import_jobs_v2(tenant_id, status);
CREATE INDEX idx_import_jobs_v2_batch  ON public.import_jobs_v2(batch_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs_v2 TO authenticated;
GRANT ALL ON public.import_jobs_v2 TO service_role;
ALTER TABLE public.import_jobs_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY import_jobs_v2_tenant_rw ON public.import_jobs_v2 FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_jobs_v2.tenant_id AND tm.user_id = auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_jobs_v2.tenant_id AND tm.user_id = auth.uid()));

CREATE TABLE public.import_staging_rows (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.import_jobs_v2(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  row_number integer NOT NULL,
  raw jsonb NOT NULL,
  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  normalized jsonb NOT NULL DEFAULT '{}'::jsonb,
  field_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','imported','updated','skipped','error')),
  product_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_staging_job_status ON public.import_staging_rows(job_id, status);
CREATE INDEX idx_staging_tenant ON public.import_staging_rows(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_staging_rows TO authenticated;
GRANT ALL ON public.import_staging_rows TO service_role;
ALTER TABLE public.import_staging_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY staging_tenant_rw ON public.import_staging_rows FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_staging_rows.tenant_id AND tm.user_id = auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_staging_rows.tenant_id AND tm.user_id = auth.uid()));

CREATE TABLE public.import_master_diff (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.import_jobs_v2(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('manufacturer','generic','category','unit',
                                     'medicine_type','dosage_form','country','tax_class','therapeutic_class')),
  raw_value text NOT NULL,
  normalized_value text NOT NULL,
  match_status text NOT NULL CHECK (match_status IN ('new','existing','duplicate')),
  target_id uuid,
  occurrences integer NOT NULL DEFAULT 1,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_master_diff_job_kind ON public.import_master_diff(job_id, kind);
CREATE UNIQUE INDEX uq_master_diff_norm ON public.import_master_diff(job_id, kind, normalized_value);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_master_diff TO authenticated;
GRANT ALL ON public.import_master_diff TO service_role;
ALTER TABLE public.import_master_diff ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_diff_tenant_rw ON public.import_master_diff FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_master_diff.tenant_id AND tm.user_id = auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_master_diff.tenant_id AND tm.user_id = auth.uid()));

CREATE TABLE public.import_errors_v2 (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.import_jobs_v2(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  row_number integer NOT NULL,
  column_name text,
  product_name text,
  error_code text,
  error_message text NOT NULL,
  reason text,
  suggested_fix text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_errors_v2_job ON public.import_errors_v2(job_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_errors_v2 TO authenticated;
GRANT ALL ON public.import_errors_v2 TO service_role;
ALTER TABLE public.import_errors_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY errors_v2_tenant_rw ON public.import_errors_v2 FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_errors_v2.tenant_id AND tm.user_id = auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_errors_v2.tenant_id AND tm.user_id = auth.uid()));

CREATE TABLE public.import_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vendor text NOT NULL,
  name text NOT NULL,
  mapping jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, vendor, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_mappings TO authenticated;
GRANT ALL ON public.import_mappings TO service_role;
ALTER TABLE public.import_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY mappings_tenant_rw ON public.import_mappings FOR ALL TO authenticated
  USING (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_mappings.tenant_id AND tm.user_id = auth.uid()))
  WITH CHECK (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_mappings.tenant_id AND tm.user_id = auth.uid()));

CREATE TABLE public.import_audit (
  id bigserial PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.import_jobs_v2(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  actor uuid,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_audit_job ON public.import_audit(job_id, created_at);
GRANT SELECT, INSERT ON public.import_audit TO authenticated;
GRANT ALL ON public.import_audit TO service_role;
ALTER TABLE public.import_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_tenant_read ON public.import_audit FOR SELECT TO authenticated
  USING (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_audit.tenant_id AND tm.user_id = auth.uid()));
CREATE POLICY audit_tenant_insert ON public.import_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = import_audit.tenant_id AND tm.user_id = auth.uid()));

CREATE TABLE public.barcode_sequences (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_code integer NOT NULL,
  next_serial bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_barcode_tenant_code ON public.barcode_sequences(tenant_code);
GRANT SELECT ON public.barcode_sequences TO authenticated;
GRANT ALL ON public.barcode_sequences TO service_role;
ALTER TABLE public.barcode_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY barcode_seq_read ON public.barcode_sequences FOR SELECT TO authenticated
  USING (public.is_app_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = barcode_sequences.tenant_id AND tm.user_id = auth.uid()));

-- EAN-13 ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ean13_checksum(_digits12 text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s int := 0; d int; i int;
BEGIN
  IF length(_digits12) <> 12 OR _digits12 !~ '^[0-9]{12}$' THEN
    RAISE EXCEPTION 'ean13_checksum expects 12 digits'; END IF;
  FOR i IN 1..12 LOOP
    d := substr(_digits12, i, 1)::int;
    s := s + CASE WHEN i % 2 = 1 THEN d ELSE d * 3 END;
  END LOOP;
  RETURN ((10 - (s % 10)) % 10)::text;
END $$;

CREATE OR REPLACE FUNCTION public.next_internal_barcode(_tenant uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.barcode_sequences%ROWTYPE; _code int; _serial bigint; _d text;
BEGIN
  INSERT INTO public.barcode_sequences(tenant_id, tenant_code)
  SELECT _tenant, COALESCE((SELECT max(tenant_code) + 1 FROM public.barcode_sequences), 1)
  ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE public.barcode_sequences SET next_serial = next_serial + 1, updated_at = now()
   WHERE tenant_id = _tenant RETURNING * INTO _row;
  _code := _row.tenant_code; _serial := _row.next_serial - 1;
  _d := '200' || lpad(_code::text, 4, '0') || lpad((_serial % 100000)::text, 5, '0');
  RETURN _d || public.ean13_checksum(_d);
END $$;
REVOKE EXECUTE ON FUNCTION public.next_internal_barcode(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_internal_barcode(uuid) TO authenticated, service_role;

-- chunk processor ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_product_import_chunk_v2(_job uuid, _batch int DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _job_row public.import_jobs_v2%ROWTYPE;
  _processed int := 0; _imported int := 0; _failed int := 0; _skipped int := 0;
  _row record; _new_product_id uuid; _barcode text;
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
     WHERE job_id = _job AND status = 'ready'
     ORDER BY row_number LIMIT _batch FOR UPDATE SKIP LOCKED
  LOOP
    _processed := _processed + 1;
    BEGIN
      _barcode := COALESCE(NULLIF(_row.normalized->>'barcode',''), public.next_internal_barcode(_job_row.tenant_id));
      INSERT INTO public.products(
        tenant_id, sku, barcode, name, name_bn,
        manufacturer_id, generic_id, category_id, medicine_type_id, dosage_form_id,
        unit_id, country_id, tax_class_id, therapeutic_class_id,
        medicine_type, strength, volume,
        purchase_price, retail_price, mrp, opening_stock,
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
        COALESCE((_row.normalized->>'purchase_price')::numeric, 0),
        COALESCE((_row.normalized->>'retail_price')::numeric, 0),
        COALESCE((_row.normalized->>'mrp')::numeric, 0),
        COALESCE((_row.normalized->>'opening_stock')::numeric, 0),
        COALESCE((_row.normalized->>'is_prescription_required')::boolean, false),
        'active', _job_row.batch_id, _job_row.created_by
      ) RETURNING id INTO _new_product_id;
      UPDATE public.import_staging_rows SET status='imported', product_id=_new_product_id WHERE id=_row.id;
      _imported := _imported + 1;
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

-- rollback ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rollback_product_import_v2(_job uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _job_row public.import_jobs_v2%ROWTYPE; _products int := 0; _batches int := 0; _barcodes int := 0;
BEGIN
  SELECT * INTO _job_row FROM public.import_jobs_v2 WHERE id = _job FOR UPDATE;
  IF _job_row.id IS NULL THEN RAISE EXCEPTION 'job not found'; END IF;
  UPDATE public.products SET deleted_at=now(), is_active=false
   WHERE tenant_id=_job_row.tenant_id AND import_batch_id=_job_row.batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS _products = ROW_COUNT;
  UPDATE public.batches SET deleted_at=now()
   WHERE tenant_id=_job_row.tenant_id
     AND product_id IN (SELECT id FROM public.products
                         WHERE tenant_id=_job_row.tenant_id AND import_batch_id=_job_row.batch_id);
  GET DIAGNOSTICS _batches = ROW_COUNT;
  DELETE FROM public.product_barcodes
   WHERE tenant_id=_job_row.tenant_id
     AND product_id IN (SELECT id FROM public.products
                         WHERE tenant_id=_job_row.tenant_id AND import_batch_id=_job_row.batch_id);
  GET DIAGNOSTICS _barcodes = ROW_COUNT;
  UPDATE public.import_jobs_v2 SET status='rolled_back', rolled_back_at=now(), updated_at=now() WHERE id=_job;
  INSERT INTO public.import_audit(job_id, tenant_id, from_status, to_status, actor, detail)
  VALUES (_job, _job_row.tenant_id, _job_row.status, 'rolled_back', auth.uid(),
          jsonb_build_object('products', _products, 'batches', _batches, 'barcodes', _barcodes));
  RETURN jsonb_build_object('products', _products, 'batches', _batches, 'barcodes', _barcodes);
END $$;
REVOKE EXECUTE ON FUNCTION public.rollback_product_import_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_product_import_v2(uuid) TO authenticated, service_role;

-- triggers
CREATE TRIGGER trg_import_jobs_v2_updated BEFORE UPDATE ON public.import_jobs_v2
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_import_mappings_updated BEFORE UPDATE ON public.import_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
