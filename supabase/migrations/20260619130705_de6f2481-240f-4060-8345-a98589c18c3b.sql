
-- E8: Supplier-side double-entry posting (reuses existing post_journal framework)

-- 1) Purchase received  →  DR 1200 / CR 2000
CREATE OR REPLACE FUNCTION public.post_po_journal(_tenant_id uuid, _po_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_po public.purchase_orders; v_je public.journal_entries; v_jno text;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = _po_id AND tenant_id = _tenant_id;
  IF NOT FOUND OR COALESCE(v_po.total,0) <= 0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries
             WHERE tenant_id=_tenant_id AND ref_table='purchase_orders'
               AND ref_id=_po_id AND NOT is_reversal) THEN RETURN NULL; END IF;

  v_jno := generate_journal_no(_tenant_id);
  v_je := post_journal(_tenant_id, v_jno, COALESCE(v_po.received_at::date, CURRENT_DATE),
    'Purchase ' || v_po.po_number, 'purchase_orders', _po_id, v_po.po_number,
    jsonb_build_array(
      jsonb_build_object('account_code','1200','debit',v_po.total,'credit',0,
        'description','PO ' || v_po.po_number || ' — inventory in'),
      jsonb_build_object('account_code','2000','debit',0,'credit',v_po.total,
        'description','PO ' || v_po.po_number || ' — supplier payable')
    ));
  RETURN v_je.id;
END $$;
GRANT EXECUTE ON FUNCTION public.post_po_journal(uuid,uuid) TO authenticated, service_role;

-- 2) Supplier payment  →  DR 2000 / CR cash/bank/...
CREATE OR REPLACE FUNCTION public.post_supplier_payment_journal(_tenant_id uuid, _payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay public.supplier_payments; v_je public.journal_entries; v_jno text; v_acct text;
BEGIN
  SELECT * INTO v_pay FROM supplier_payments WHERE id = _payment_id AND tenant_id = _tenant_id;
  IF NOT FOUND OR COALESCE(v_pay.amount,0) <= 0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries
             WHERE tenant_id=_tenant_id AND ref_table='supplier_payments'
               AND ref_id=_payment_id AND NOT is_reversal) THEN RETURN NULL; END IF;

  v_acct := payment_method_account_code(v_pay.method);
  v_jno := generate_journal_no(_tenant_id);
  v_je := post_journal(_tenant_id, v_jno, v_pay.payment_date,
    'Supplier payment ' || COALESCE(v_pay.reference,''), 'supplier_payments', _payment_id, v_pay.reference,
    jsonb_build_array(
      jsonb_build_object('account_code','2000','debit',v_pay.amount,'credit',0,
        'description','Pay supplier — AP reduction'),
      jsonb_build_object('account_code',v_acct,'debit',0,'credit',v_pay.amount,
        'description','Pay via ' || v_pay.method)
    ));
  RETURN v_je.id;
END $$;
GRANT EXECUTE ON FUNCTION public.post_supplier_payment_journal(uuid,uuid) TO authenticated, service_role;

-- 3) Supplier return (ad-hoc — no purchase_returns row in our flow)  →  DR 2000 / CR 1200
CREATE OR REPLACE FUNCTION public.post_supplier_return_adhoc_journal(
  _tenant_id uuid, _ref_no text, _value numeric, _date date DEFAULT CURRENT_DATE
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_je public.journal_entries; v_jno text;
BEGIN
  IF COALESCE(_value,0) <= 0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries
             WHERE tenant_id=_tenant_id AND ref_table='stock_movements'
               AND ref_no=_ref_no AND NOT is_reversal) THEN RETURN NULL; END IF;

  v_jno := generate_journal_no(_tenant_id);
  v_je := post_journal(_tenant_id, v_jno, _date,
    'Supplier return ' || _ref_no, 'stock_movements', NULL, _ref_no,
    jsonb_build_array(
      jsonb_build_object('account_code','2000','debit',_value,'credit',0,
        'description','SR ' || _ref_no || ' — AP reversal'),
      jsonb_build_object('account_code','1200','debit',0,'credit',_value,
        'description','SR ' || _ref_no || ' — inventory out')
    ));
  RETURN v_je.id;
END $$;
GRANT EXECUTE ON FUNCTION public.post_supplier_return_adhoc_journal(uuid,text,numeric,date) TO authenticated, service_role;

-- 4) Supplier opening balance  →  DR 3000 (Owner Equity) / CR 2000
CREATE OR REPLACE FUNCTION public.post_supplier_opening_journal(_tenant_id uuid, _supplier_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sup public.suppliers; v_je public.journal_entries; v_jno text; v_amt numeric;
BEGIN
  SELECT * INTO v_sup FROM suppliers WHERE id = _supplier_id AND tenant_id = _tenant_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_amt := COALESCE(v_sup.opening_balance,0);
  IF v_amt <= 0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM journal_entries
             WHERE tenant_id=_tenant_id AND ref_table='suppliers'
               AND ref_id=_supplier_id AND ref_no='OPENING' AND NOT is_reversal) THEN
    RETURN NULL;
  END IF;

  v_jno := generate_journal_no(_tenant_id);
  v_je := post_journal(_tenant_id, v_jno, v_sup.created_at::date,
    'Opening balance — ' || v_sup.name, 'suppliers', _supplier_id, 'OPENING',
    jsonb_build_array(
      jsonb_build_object('account_code','3000','debit',v_amt,'credit',0,
        'description','Opening AP — equity offset'),
      jsonb_build_object('account_code','2000','debit',0,'credit',v_amt,
        'description','Opening AP — ' || v_sup.name)
    ));
  RETURN v_je.id;
END $$;
GRANT EXECUTE ON FUNCTION public.post_supplier_opening_journal(uuid,uuid) TO authenticated, service_role;

-- 5) Backfill — historical purchases / payments / openings (idempotent)
CREATE OR REPLACE FUNCTION public.backfill_supplier_journals(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_opening int := 0; v_purchase int := 0; v_payment int := 0; v_id uuid;
BEGIN
  -- Openings
  FOR r IN SELECT id FROM suppliers
            WHERE tenant_id=_tenant_id AND COALESCE(opening_balance,0) > 0 LOOP
    v_id := post_supplier_opening_journal(_tenant_id, r.id);
    IF v_id IS NOT NULL THEN v_opening := v_opening + 1; END IF;
  END LOOP;
  -- Purchases (received / partially_received)
  FOR r IN SELECT id FROM purchase_orders
            WHERE tenant_id=_tenant_id AND supplier_id IS NOT NULL
              AND status IN ('received','partially_received')
              AND COALESCE(total,0) > 0 LOOP
    v_id := post_po_journal(_tenant_id, r.id);
    IF v_id IS NOT NULL THEN v_purchase := v_purchase + 1; END IF;
  END LOOP;
  -- Payments
  FOR r IN SELECT id FROM supplier_payments WHERE tenant_id=_tenant_id LOOP
    v_id := post_supplier_payment_journal(_tenant_id, r.id);
    IF v_id IS NOT NULL THEN v_payment := v_payment + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('opening',v_opening,'purchase',v_purchase,'payment',v_payment);
END $$;
GRANT EXECUTE ON FUNCTION public.backfill_supplier_journals(uuid) TO authenticated, service_role;
