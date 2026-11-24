
-- 1) Robust branch resolver (used by several journals)
CREATE OR REPLACE FUNCTION public.resolve_user_branch(_tenant_id uuid, _user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT cr.branch_id FROM public.cash_registers cr
      WHERE cr.tenant_id = _tenant_id AND cr.user_id = _user_id AND cr.branch_id IS NOT NULL
      ORDER BY cr.opened_at DESC NULLS LAST LIMIT 1),
    (SELECT tm.default_branch_id FROM public.tenant_members tm
      WHERE tm.tenant_id = _tenant_id AND tm.user_id = _user_id AND tm.default_branch_id IS NOT NULL
      LIMIT 1),
    (SELECT s.branch_id FROM public.staff s
      WHERE s.tenant_id = _tenant_id AND s.user_id = _user_id AND s.branch_id IS NOT NULL
      LIMIT 1),
    (SELECT b.id FROM public.branches b
      WHERE b.tenant_id = _tenant_id
      ORDER BY b.created_at ASC LIMIT 1)
  )
$$;

-- 2) Sale journal: never insert NULL branch_id
CREATE OR REPLACE FUNCTION public.post_sale_journal(_tenant_id uuid, _sale_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.sales; v_pay record; v_lines jsonb := '[]'::jsonb;
  v_cogs numeric := 0; v_je public.journal_entries; v_cogs_je public.journal_entries;
  v_jno text; v_branch uuid;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id AND tenant_id = _tenant_id;
  IF NOT FOUND OR v_sale.total <= 0 OR v_sale.status = 'void' THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id=_tenant_id AND ref_table='sales' AND ref_id=_sale_id AND NOT is_reversal) THEN
    RETURN NULL;
  END IF;

  v_branch := COALESCE(
    (SELECT w.branch_id FROM public.warehouses w
      WHERE w.id = v_sale.warehouse_id AND w.tenant_id = _tenant_id AND w.branch_id IS NOT NULL),
    public.resolve_user_branch(_tenant_id, v_sale.cashier_id),
    (SELECT b.id FROM public.branches b WHERE b.tenant_id = _tenant_id ORDER BY b.created_at ASC LIMIT 1)
  );

  IF v_branch IS NULL THEN
    RAISE EXCEPTION 'no branch configured for tenant % — create a branch before posting sales', _tenant_id
      USING ERRCODE='23502';
  END IF;

  FOR v_pay IN SELECT method::text AS method, SUM(amount) AS amt FROM public.sale_payments
    WHERE sale_id = _sale_id GROUP BY method LOOP
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', public.payment_method_account_code(v_pay.method),
      'debit', v_pay.amt, 'credit', 0,
      'description', 'Sale ' || v_sale.invoice_no || ' — ' || v_pay.method));
  END LOOP;

  IF v_sale.due > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code','1100','debit',v_sale.due,'credit',0,
      'description','Sale ' || v_sale.invoice_no || ' — on account'));
  END IF;
  IF COALESCE(v_sale.discount,0) > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code','4090','debit',v_sale.discount,'credit',0,
      'description','Discount allowed on ' || v_sale.invoice_no));
  END IF;
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code','4000','debit',0,'credit',v_sale.subtotal,
    'description','Sales revenue ' || v_sale.invoice_no));
  IF COALESCE(v_sale.vat,0) > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code','2100','debit',0,'credit',v_sale.vat,
      'description','Output VAT ' || v_sale.invoice_no));
  END IF;

  v_jno := public.generate_journal_no(_tenant_id);
  v_je := public.post_journal_with_branch(_tenant_id, v_jno, v_sale.sale_date::date,
    'Sale ' || v_sale.invoice_no, 'sales'::text, _sale_id, v_sale.invoice_no, v_lines, v_branch);
  UPDATE public.journal_entries SET warehouse_id = v_sale.warehouse_id WHERE id = v_je.id;

  SELECT COALESCE(SUM(COALESCE(unit_cost,0) * qty),0) INTO v_cogs
    FROM public.sale_items WHERE sale_id = _sale_id;
  IF v_cogs > 0 THEN
    v_jno := public.generate_journal_no(_tenant_id);
    v_cogs_je := public.post_journal_with_branch(_tenant_id, v_jno, v_sale.sale_date::date,
      'COGS for ' || v_sale.invoice_no, 'sales'::text, _sale_id, v_sale.invoice_no,
      jsonb_build_array(
        jsonb_build_object('account_code','5000','debit',v_cogs,'credit',0,'description','COGS ' || v_sale.invoice_no),
        jsonb_build_object('account_code','1200','debit',0,'credit',v_cogs,'description','Inventory out ' || v_sale.invoice_no)),
      v_branch);
    UPDATE public.journal_entries SET warehouse_id = v_sale.warehouse_id WHERE id = v_cogs_je.id;
  ELSE
    PERFORM public.audit_log_event(_tenant_id, 'journal.cogs_skipped', 'sales', _sale_id, NULL,
      jsonb_build_object('sale_id', _sale_id, 'reason','missing_cost'));
  END IF;

  PERFORM public.audit_log_event(_tenant_id, 'journal.sale', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('sale_id', _sale_id, 'invoice_no', v_sale.invoice_no, 'total', v_sale.total,
                       'cogs', v_cogs, 'branch_id', v_branch, 'warehouse_id', v_sale.warehouse_id));
  RETURN v_je.id;
END $function$;

-- 3) Auto-fill cash_registers.branch_id on insert/update when missing
CREATE OR REPLACE FUNCTION public.tg_cash_registers_fill_branch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    NEW.branch_id := (
      SELECT b.id FROM public.branches b
      WHERE b.tenant_id = NEW.tenant_id
      ORDER BY b.created_at ASC LIMIT 1
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cash_registers_fill_branch ON public.cash_registers;
CREATE TRIGGER cash_registers_fill_branch
  BEFORE INSERT OR UPDATE ON public.cash_registers
  FOR EACH ROW EXECUTE FUNCTION public.tg_cash_registers_fill_branch();

-- 4) Backfill: any register without branch_id gets the tenant's first branch
UPDATE public.cash_registers cr
   SET branch_id = (SELECT b.id FROM public.branches b
                     WHERE b.tenant_id = cr.tenant_id
                     ORDER BY b.created_at ASC LIMIT 1)
 WHERE branch_id IS NULL;
