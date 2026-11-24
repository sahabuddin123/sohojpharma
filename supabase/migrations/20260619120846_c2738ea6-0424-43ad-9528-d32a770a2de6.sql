
-- =========================================================
-- P1: Duplicate protection (DB-level, race-safe)
-- =========================================================
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_barcode_uidx
  ON public.products (tenant_id, barcode)
  WHERE barcode IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_barcodes_tenant_barcode_uidx
  ON public.product_barcodes (tenant_id, barcode)
  WHERE deleted_at IS NULL;

-- =========================================================
-- P2: Import batch tracking
-- =========================================================
ALTER TABLE public.products         ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.batches          ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE public.product_barcodes ADD COLUMN IF NOT EXISTS import_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_products_import_batch         ON public.products(import_batch_id)         WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_batches_import_batch          ON public.batches(import_batch_id)          WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_barcodes_import_batch ON public.product_barcodes(import_batch_id) WHERE import_batch_id IS NOT NULL;

ALTER TABLE public.product_import_logs
  ADD COLUMN IF NOT EXISTS import_batch_id uuid UNIQUE DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS started_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS finished_at    timestamptz,
  ADD COLUMN IF NOT EXISTS duration_ms    integer,
  ADD COLUMN IF NOT EXISTS rolled_back_at timestamptz,
  ADD COLUMN IF NOT EXISTS rolled_back_by uuid;

-- Backfill any pre-existing rows so the UNIQUE constraint holds
UPDATE public.product_import_logs SET import_batch_id = gen_random_uuid() WHERE import_batch_id IS NULL;

-- =========================================================
-- P4: Rollback function (24-hour window, audited)
-- =========================================================
CREATE OR REPLACE FUNCTION public.rollback_product_import(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log         public.product_import_logs%ROWTYPE;
  v_uid         uuid := auth.uid();
  v_products    integer := 0;
  v_batches     integer := 0;
  v_barcodes    integer := 0;
BEGIN
  SELECT * INTO v_log FROM public.product_import_logs WHERE import_batch_id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import batch not found'; END IF;

  IF NOT public.is_tenant_member(v_uid, v_log.tenant_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_log.rolled_back_at IS NOT NULL THEN
    RAISE EXCEPTION 'Import has already been rolled back';
  END IF;

  IF v_log.finished_at IS NULL OR v_log.finished_at < now() - interval '24 hours' THEN
    RAISE EXCEPTION 'Rollback window (24 hours) has expired';
  END IF;

  UPDATE public.product_barcodes
     SET deleted_at = now(), deleted_by = v_uid
   WHERE import_batch_id = p_batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_barcodes = ROW_COUNT;

  UPDATE public.batches
     SET deleted_at = now(), deleted_by = v_uid, qty_on_hand = 0
   WHERE import_batch_id = p_batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_batches = ROW_COUNT;

  UPDATE public.products
     SET deleted_at = now(), deleted_by = v_uid, is_active = false
   WHERE import_batch_id = p_batch_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_products = ROW_COUNT;

  UPDATE public.product_import_logs
     SET rolled_back_at = now(), rolled_back_by = v_uid, status = 'failed', updated_by = v_uid
   WHERE import_batch_id = p_batch_id;

  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (v_log.tenant_id, v_uid, 'inventory.import.rollback', 'product_import_logs', v_log.id,
          jsonb_build_object('batch_id', p_batch_id, 'products', v_products, 'batches', v_batches, 'barcodes', v_barcodes));

  RETURN jsonb_build_object('ok', true, 'products', v_products, 'batches', v_batches, 'barcodes', v_barcodes);
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_product_import(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_product_import(uuid) TO authenticated;
