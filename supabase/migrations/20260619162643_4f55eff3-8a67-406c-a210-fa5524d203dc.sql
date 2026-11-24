
-- Phase E14.1: Purchase Return Approval Workflow

-- 1) Procurement settings (one row per tenant)
CREATE TABLE IF NOT EXISTS public.procurement_settings (
  tenant_id uuid PRIMARY KEY,
  require_purchase_return_approval boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_settings TO authenticated;
GRANT ALL ON public.procurement_settings TO service_role;

ALTER TABLE public.procurement_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "procurement_settings tenant access" ON public.procurement_settings;
CREATE POLICY "procurement_settings tenant access"
  ON public.procurement_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = procurement_settings.tenant_id AND tm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = procurement_settings.tenant_id AND tm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_procurement_settings_updated_at ON public.procurement_settings;
CREATE TRIGGER trg_procurement_settings_updated_at
  BEFORE UPDATE ON public.procurement_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Extend purchase_returns with status + approval columns
ALTER TABLE public.purchase_returns
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Existing rows are historical (already posted) — leave as 'approved'.
-- Set approved_at = created_at for existing rows where null.
UPDATE public.purchase_returns
   SET approved_at = created_at
 WHERE status = 'approved' AND approved_at IS NULL;

DROP INDEX IF EXISTS idx_purchase_returns_tenant_status;
CREATE INDEX idx_purchase_returns_tenant_status
  ON public.purchase_returns (tenant_id, status, created_at DESC);

-- Constraint: valid status values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_returns_status_check'
  ) THEN
    ALTER TABLE public.purchase_returns
      ADD CONSTRAINT purchase_returns_status_check
      CHECK (status IN ('draft','submitted','approved','rejected'));
  END IF;
END $$;

-- 3) Approve RPC — performs stock decrement + ledger + journal + due balance
CREATE OR REPLACE FUNCTION public.approve_purchase_return(
  _tenant_id uuid,
  _return_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr record;
  it record;
  b  record;
  new_qty numeric;
  total_val numeric := 0;
  sup_due numeric;
BEGIN
  SELECT * INTO pr FROM public.purchase_returns
    WHERE id = _return_id AND tenant_id = _tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase return not found'; END IF;

  -- Idempotent: already approved
  IF pr.status = 'approved' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF pr.status NOT IN ('submitted','draft') THEN
    RAISE EXCEPTION 'Cannot approve return in status %', pr.status;
  END IF;

  total_val := COALESCE(pr.total_value, 0);

  -- 1) Decrement batches + record stock movements
  FOR it IN
    SELECT * FROM public.purchase_return_items
     WHERE return_id = _return_id AND tenant_id = _tenant_id
  LOOP
    SELECT id, qty_on_hand, product_id INTO b
      FROM public.batches
     WHERE id = it.batch_id AND tenant_id = _tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Batch missing for line'; END IF;
    IF it.qty > b.qty_on_hand THEN
      RAISE EXCEPTION 'Return qty exceeds on-hand for batch %', b.id;
    END IF;
    new_qty := b.qty_on_hand - it.qty;
    UPDATE public.batches SET qty_on_hand = new_qty
      WHERE id = b.id AND tenant_id = _tenant_id;
    INSERT INTO public.stock_movements
      (tenant_id, product_id, batch_id, movement_type, qty_change, qty_after,
       reference_table, reference_id, reference_no, user_id, notes)
    VALUES
      (_tenant_id, b.product_id, b.id, 'purchase_return', -it.qty, new_qty,
       'purchase_returns', pr.id, pr.return_no, auth.uid(), pr.reason);
  END LOOP;

  IF total_val > 0 THEN
    -- 2) Supplier ledger
    PERFORM public.post_supplier_ledger_idempotent(
      _tenant_id := _tenant_id,
      _supplier_id := pr.supplier_id,
      _entry_type := 'purchase_return',
      _debit := total_val,
      _credit := 0,
      _ref_table := 'purchase_returns',
      _ref_id := pr.id,
      _ref_no := pr.return_no,
      _notes := COALESCE(pr.reason, 'Purchase return ' || pr.return_no)
    );

    -- 3) Supplier due_balance
    SELECT due_balance INTO sup_due FROM public.suppliers
      WHERE id = pr.supplier_id AND tenant_id = _tenant_id;
    IF FOUND THEN
      UPDATE public.suppliers
         SET due_balance = COALESCE(sup_due,0) - total_val
       WHERE id = pr.supplier_id AND tenant_id = _tenant_id;
    END IF;

    -- 4) Journal entry
    PERFORM public.post_purchase_return_journal(_tenant_id, pr.id);
  END IF;

  UPDATE public.purchase_returns
     SET status = 'approved',
         approved_at = now(),
         approved_by = auth.uid()
   WHERE id = _return_id;

  RETURN jsonb_build_object('ok', true, 'total', total_val);
END $$;

REVOKE ALL ON FUNCTION public.approve_purchase_return(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_purchase_return(uuid, uuid) TO authenticated;

-- 4) Reject RPC
CREATE OR REPLACE FUNCTION public.reject_purchase_return(
  _tenant_id uuid,
  _return_id uuid,
  _reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pr record;
BEGIN
  SELECT * INTO pr FROM public.purchase_returns
    WHERE id = _return_id AND tenant_id = _tenant_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase return not found'; END IF;
  IF pr.status = 'rejected' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF pr.status NOT IN ('submitted','draft') THEN
    RAISE EXCEPTION 'Cannot reject return in status %', pr.status;
  END IF;

  UPDATE public.purchase_returns
     SET status = 'rejected',
         rejected_at = now(),
         rejected_by = auth.uid(),
         rejection_reason = _reason
   WHERE id = _return_id;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.reject_purchase_return(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_purchase_return(uuid, uuid, text) TO authenticated;
