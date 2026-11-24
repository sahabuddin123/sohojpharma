CREATE OR REPLACE FUNCTION public.post_opening_stock_journal(_tenant_id uuid, _batch_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_b public.batches;
  v_value numeric;
  v_jno text;
  v_je_id uuid;
  v_acc_inv uuid;
  v_acc_eq uuid;
BEGIN
  SELECT * INTO v_b FROM public.batches WHERE id = _batch_id AND tenant_id = _tenant_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_b.branch_id IS NULL THEN
    RAISE EXCEPTION 'batch % missing branch_id', _batch_id USING ERRCODE='23502';
  END IF;

  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id=_tenant_id AND ref_table='batches' AND ref_id=_batch_id AND NOT is_reversal) THEN
    RETURN NULL;
  END IF;

  v_value := COALESCE(v_b.qty_on_hand,0) * COALESCE(v_b.purchase_price,0);
  IF v_value <= 0 THEN RETURN NULL; END IF;

  SELECT id INTO v_acc_inv FROM public.chart_of_accounts
   WHERE tenant_id=_tenant_id AND code='1200' AND is_active;
  SELECT id INTO v_acc_eq FROM public.chart_of_accounts
   WHERE tenant_id=_tenant_id AND code='3100' AND is_active;
  IF v_acc_inv IS NULL OR v_acc_eq IS NULL THEN
    RAISE EXCEPTION 'opening stock chart accounts (1200/3100) missing for tenant %', _tenant_id USING ERRCODE='23503';
  END IF;

  v_jno := public.generate_journal_no(_tenant_id);

  INSERT INTO public.journal_entries(
    tenant_id, branch_id, warehouse_id, entry_no, entry_date, notes,
    ref_table, ref_id, ref_no, total_debit, total_credit, posted_by
  ) VALUES (
    _tenant_id, v_b.branch_id, v_b.warehouse_id, v_jno, CURRENT_DATE,
    'Opening stock batch ' || COALESCE(v_b.batch_no,_batch_id::text),
    'batches', _batch_id, v_b.batch_no, v_value, v_value, auth.uid()
  ) RETURNING id INTO v_je_id;

  INSERT INTO public.journal_lines(tenant_id, journal_id, account_id, debit, credit, description)
  VALUES
    (_tenant_id, v_je_id, v_acc_inv, v_value, 0, 'Opening stock inventory'),
    (_tenant_id, v_je_id, v_acc_eq, 0, v_value, 'Opening stock equity');

  PERFORM public.audit_log_event(_tenant_id, 'journal.opening_stock', 'journal_entries', v_je_id, NULL,
    jsonb_build_object('batch_id', _batch_id, 'value', v_value,
      'warehouse_id', v_b.warehouse_id, 'branch_id', v_b.branch_id));

  RETURN v_je_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.post_opening_stock_journal(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_opening_stock_journal(uuid, uuid) TO authenticated, service_role;