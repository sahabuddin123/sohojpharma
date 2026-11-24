
-- F10-A  COST IMMUTABILITY
CREATE TABLE IF NOT EXISTS public.inventory_revaluation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  old_cost numeric(14,2) NOT NULL,
  new_cost numeric(14,2) NOT NULL,
  reason text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.inventory_revaluation_log TO authenticated;
GRANT ALL ON public.inventory_revaluation_log TO service_role;
ALTER TABLE public.inventory_revaluation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reval_tenant_read" ON public.inventory_revaluation_log;
CREATE POLICY "reval_tenant_read" ON public.inventory_revaluation_log
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX IF NOT EXISTS idx_reval_batch ON public.inventory_revaluation_log(tenant_id, batch_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_batch_cost_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.purchase_price IS DISTINCT FROM OLD.purchase_price
     AND COALESCE(OLD.is_opening,false) = false
     AND COALESCE(current_setting('app.allow_batch_cost_change', true),'') <> '1' THEN
    RAISE EXCEPTION 'Batch cost is immutable for batch % — use revalue_batch_cost()', OLD.id
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_batch_cost_immutable ON public.batches;
CREATE TRIGGER trg_batch_cost_immutable
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.tg_batch_cost_immutable();

CREATE OR REPLACE FUNCTION public.revalue_batch_cost(
  _tenant_id uuid, _batch_id uuid, _new_cost numeric, _reason text
) RETURNS public.inventory_revaluation_log
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old numeric; v_row public.inventory_revaluation_log;
BEGIN
  IF NOT public.is_tenant_manager_or_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden: manager role required' USING ERRCODE='42501';
  END IF;
  IF _new_cost IS NULL OR _new_cost < 0 THEN
    RAISE EXCEPTION 'new_cost must be >= 0' USING ERRCODE='22023';
  END IF;
  IF COALESCE(_reason,'') = '' THEN
    RAISE EXCEPTION 'reason is required' USING ERRCODE='22023';
  END IF;
  SELECT purchase_price INTO v_old FROM public.batches
   WHERE id=_batch_id AND tenant_id=_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'batch not found' USING ERRCODE='23503'; END IF;
  IF v_old = _new_cost THEN
    RAISE EXCEPTION 'new_cost equals old_cost' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('app.allow_batch_cost_change','1', true);
  UPDATE public.batches SET purchase_price=_new_cost, updated_at=now(), updated_by=auth.uid()
   WHERE id=_batch_id;
  PERFORM set_config('app.allow_batch_cost_change','0', true);
  INSERT INTO public.inventory_revaluation_log(tenant_id, batch_id, old_cost, new_cost, reason, created_by)
  VALUES (_tenant_id, _batch_id, v_old, _new_cost, _reason, auth.uid())
  RETURNING * INTO v_row;
  PERFORM public.audit_log_event(_tenant_id,'inventory.revalue','batches',_batch_id,NULL,
    jsonb_build_object('old_cost',v_old,'new_cost',_new_cost,'reason',_reason));
  RETURN v_row;
END $$;

-- F10-F  GRN IDEMPOTENCY
ALTER TABLE public.goods_receipts ADD COLUMN IF NOT EXISTS client_op_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_grn_client_op
  ON public.goods_receipts(tenant_id, client_op_id) WHERE client_op_id IS NOT NULL;

-- F10-E  LOCK-FREE JOURNAL NUMBERING
CREATE OR REPLACE FUNCTION public.generate_journal_no(_tenant_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN public.generate_next_number(_tenant_id, 'journal');
END $$;

INSERT INTO public.tenant_number_sequences(tenant_id, doc_type, sequence_name, prefix, start_value)
SELECT t.id, 'journal',
       'seq_' || replace(t.id::text,'-','') || '_journal',
       'JRN',
       GREATEST(1000, COALESCE(
         (SELECT MAX((regexp_match(je.entry_no, '(\d+)$'))[1]::bigint)
            FROM public.journal_entries je WHERE je.tenant_id=t.id), 0) + 1)
  FROM public.tenants t
 WHERE NOT EXISTS (SELECT 1 FROM public.tenant_number_sequences
                    WHERE tenant_id=t.id AND doc_type='journal');

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT sequence_name, start_value FROM public.tenant_number_sequences WHERE doc_type='journal' LOOP
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I START %s MINVALUE %s CACHE 50',
                   r.sequence_name, r.start_value, r.start_value);
  END LOOP;
END $$;

-- F10-H  FINANCIAL DRIFT ENGINE
CREATE TABLE IF NOT EXISTS public.financial_drift_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  check_name text NOT NULL,
  expected numeric,
  actual numeric,
  variance numeric,
  details jsonb,
  ran_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.financial_drift_log TO authenticated;
GRANT ALL ON public.financial_drift_log TO service_role;
ALTER TABLE public.financial_drift_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "drift_tenant_read" ON public.financial_drift_log;
CREATE POLICY "drift_tenant_read" ON public.financial_drift_log
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE INDEX IF NOT EXISTS idx_drift_tenant_time ON public.financial_drift_log(tenant_id, ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_drift_variance ON public.financial_drift_log(tenant_id, check_name) WHERE variance <> 0;

CREATE OR REPLACE FUNCTION public.reconcile_cash_drawer(_tenant_id uuid)
RETURNS TABLE(register_id uuid, expected numeric, actual numeric, variance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH agg AS (
    SELECT r.id,
      COALESCE(r.opening_amount,0)
        + COALESCE(SUM(ct.amount) FILTER (WHERE ct.transaction_type IN ('sale','cash_in') AND ct.payment_method='cash'),0)
        - COALESCE(SUM(ct.amount) FILTER (WHERE ct.transaction_type IN ('sale_refund','cash_out') AND ct.payment_method='cash'),0)
        AS expected_amt,
      COALESCE(r.actual_closing_amount, r.opening_amount) AS actual_amt
    FROM public.cash_registers r
    LEFT JOIN public.cash_register_transactions ct
      ON ct.register_id=r.id AND ct.tenant_id=r.tenant_id
    WHERE r.tenant_id=_tenant_id AND r.status='closed'
    GROUP BY r.id, r.opening_amount, r.actual_closing_amount
  )
  SELECT id, expected_amt, actual_amt, (actual_amt - expected_amt) FROM agg;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_financials(_tenant_id uuid, _persist boolean DEFAULT true)
RETURNS TABLE(check_name text, expected numeric, actual numeric, variance numeric, details jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT 'sales_journal_orphans'::text,
    (SELECT count(*)::numeric FROM public.sales s WHERE s.tenant_id=_tenant_id
       AND COALESCE(s.status::text,'') <> 'void'),
    (SELECT count(*)::numeric FROM public.sales s WHERE s.tenant_id=_tenant_id
       AND COALESCE(s.status::text,'') <> 'void'
       AND EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.tenant_id=_tenant_id
                    AND je.ref_table='sales' AND je.ref_id=s.id AND je.is_reversal=false)),
    NULL::numeric, NULL::jsonb;

  RETURN QUERY
  SELECT 'returns_journal_orphans'::text,
    (SELECT count(*)::numeric FROM public.sales_returns r WHERE r.tenant_id=_tenant_id),
    (SELECT count(*)::numeric FROM public.sales_returns r WHERE r.tenant_id=_tenant_id
       AND EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.tenant_id=_tenant_id
                    AND je.ref_table='sales_returns' AND je.ref_id=r.id AND je.is_reversal=false)),
    NULL, NULL;

  RETURN QUERY
  SELECT 'grn_journal_orphans'::text,
    (SELECT count(*)::numeric FROM public.goods_receipts g WHERE g.tenant_id=_tenant_id AND g.status='approved'),
    (SELECT count(*)::numeric FROM public.goods_receipts g WHERE g.tenant_id=_tenant_id AND g.status='approved'
       AND EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.tenant_id=_tenant_id
                    AND je.ref_table='goods_receipts' AND je.ref_id=g.id AND je.is_reversal=false)),
    NULL, NULL;

  RETURN QUERY
  SELECT 'vat_audit_match'::text,
    COALESCE((SELECT SUM(vat) FROM public.sales WHERE tenant_id=_tenant_id),0),
    COALESCE((SELECT SUM(vat_amount) FROM public.sale_tax_audit
               WHERE tenant_id=_tenant_id AND direction='sale'),0),
    NULL, NULL;

  RETURN QUERY
  SELECT 'cash_drawer_variance'::text, NULL::numeric, NULL::numeric,
    COALESCE((SELECT SUM(variance) FROM public.reconcile_cash_drawer(_tenant_id)),0),
    NULL;

  RETURN QUERY
  WITH mv AS (
    SELECT batch_id, SUM(qty_change) AS net FROM public.stock_movements
     WHERE tenant_id=_tenant_id AND batch_id IS NOT NULL GROUP BY batch_id
  )
  SELECT 'stock_movement_drift'::text,
    COALESCE((SELECT SUM(b.qty_on_hand) FROM public.batches b WHERE b.tenant_id=_tenant_id),0),
    COALESCE((SELECT SUM(b.qty_on_hand) FROM public.batches b
                LEFT JOIN mv ON mv.batch_id=b.id WHERE b.tenant_id=_tenant_id),0),
    NULL, NULL;

  RETURN QUERY
  SELECT 'negative_stock'::text, 0::numeric,
    (SELECT count(*)::numeric FROM public.batches WHERE tenant_id=_tenant_id AND qty_on_hand<0),
    NULL, NULL;
END $$;

CREATE OR REPLACE FUNCTION public.run_financial_drift_scan(_tenant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count int := 0; r RECORD; v_var numeric;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  FOR r IN SELECT * FROM public.reconcile_financials(_tenant_id, true) LOOP
    v_var := COALESCE(r.variance, COALESCE(r.actual,0) - COALESCE(r.expected,0));
    INSERT INTO public.financial_drift_log(tenant_id, check_name, expected, actual, variance, details)
    VALUES (_tenant_id, r.check_name, r.expected, r.actual, v_var, r.details);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
