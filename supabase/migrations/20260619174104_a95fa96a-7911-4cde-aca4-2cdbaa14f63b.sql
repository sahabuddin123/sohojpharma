
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_je_tenant_warehouse_date
  ON public.journal_entries(tenant_id, warehouse_id, entry_date DESC);

CREATE OR REPLACE FUNCTION public.post_sale_journal(_tenant_id uuid, _sale_id uuid)
 RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
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
  v_branch := public.resolve_user_branch(_tenant_id, v_sale.cashier_id);

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

CREATE OR REPLACE FUNCTION public.post_return_journal(_tenant_id uuid, _return_id uuid)
 RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_ret public.sales_returns; v_sale public.sales;
  v_lines jsonb := '[]'::jsonb; v_je public.journal_entries;
  v_jno text; v_branch uuid; v_cogs numeric := 0;
  v_method_code text; v_special boolean := false; v_wh uuid;
BEGIN
  SELECT * INTO v_ret FROM public.sales_returns WHERE id = _return_id AND tenant_id = _tenant_id;
  IF NOT FOUND OR v_ret.total <= 0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id=_tenant_id AND ref_table='sales_returns' AND ref_id=_return_id AND NOT is_reversal) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = v_ret.sale_id;
  v_branch := public.resolve_user_branch(_tenant_id, v_sale.cashier_id);
  v_wh := v_sale.warehouse_id;
  v_special := COALESCE(v_ret.notes,'') ~* '\[refund=(due|store_credit|adjustment)\]';
  v_method_code := CASE WHEN v_special THEN '1100'
                        ELSE public.payment_method_account_code(v_ret.refund_method::text) END;

  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code','4050','debit',v_ret.subtotal,'credit',0,
    'description','Sales return ' || v_ret.return_no));
  IF COALESCE(v_ret.vat,0) > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code','2100','debit',v_ret.vat,'credit',0,
      'description','VAT reversal ' || v_ret.return_no));
  END IF;
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code', v_method_code,'debit',0,'credit',v_ret.refunded_amount,
    'description','Refund ' || v_ret.return_no));

  v_jno := public.generate_journal_no(_tenant_id);
  v_je := public.post_journal(_tenant_id, v_jno, v_ret.return_date,
    'Sales return ' || v_ret.return_no, 'sales_returns', _return_id, v_ret.return_no, v_lines);
  UPDATE public.journal_entries SET branch_id = v_branch, warehouse_id = v_wh WHERE id = v_je.id;

  SELECT COALESCE(SUM(sri.qty * COALESCE(si.unit_cost,0)),0) INTO v_cogs
    FROM public.sale_return_items sri JOIN public.sale_items si ON si.id = sri.sale_item_id
   WHERE sri.return_id = _return_id;
  IF v_cogs > 0 THEN
    v_jno := public.generate_journal_no(_tenant_id);
    PERFORM public.post_journal(_tenant_id, v_jno, v_ret.return_date,
      'Inventory restored from ' || v_ret.return_no, 'sales_returns', _return_id, v_ret.return_no,
      jsonb_build_array(
        jsonb_build_object('account_code','1200','debit',v_cogs,'credit',0,'description','Inventory restore ' || v_ret.return_no),
        jsonb_build_object('account_code','5000','debit',0,'credit',v_cogs,'description','COGS reversal ' || v_ret.return_no)));
    UPDATE public.journal_entries SET branch_id = v_branch, warehouse_id = v_wh
      WHERE tenant_id = _tenant_id AND entry_no = v_jno;
  END IF;

  PERFORM public.audit_log_event(_tenant_id, 'journal.return', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('return_id', _return_id, 'warehouse_id', v_wh));
  RETURN v_je.id;
END $function$;

CREATE OR REPLACE FUNCTION public.post_opening_stock_journal(_tenant_id uuid, _batch_id uuid)
 RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_b public.batches; v_value numeric; v_je public.journal_entries; v_jno text;
BEGIN
  SELECT * INTO v_b FROM public.batches WHERE id = _batch_id AND tenant_id = _tenant_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id=_tenant_id AND ref_table='batches' AND ref_id=_batch_id AND NOT is_reversal) THEN
    RETURN NULL;
  END IF;
  v_value := COALESCE(v_b.qty_on_hand,0) * COALESCE(v_b.purchase_price,0);
  IF v_value <= 0 THEN RETURN NULL; END IF;
  v_jno := public.generate_journal_no(_tenant_id);
  v_je := public.post_journal(_tenant_id, v_jno, CURRENT_DATE,
    'Opening stock batch ' || COALESCE(v_b.batch_no,_batch_id::text),
    'batches', _batch_id, v_b.batch_no,
    jsonb_build_array(
      jsonb_build_object('account_code','1200','debit',v_value,'credit',0,'description','Opening stock inventory'),
      jsonb_build_object('account_code','3100','debit',0,'credit',v_value,'description','Opening stock equity')));
  UPDATE public.journal_entries SET branch_id = v_b.branch_id, warehouse_id = v_b.warehouse_id WHERE id = v_je.id;
  PERFORM public.audit_log_event(_tenant_id, 'journal.opening_stock', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('batch_id', _batch_id, 'value', v_value, 'warehouse_id', v_b.warehouse_id));
  RETURN v_je.id;
END $function$;

CREATE OR REPLACE FUNCTION public.post_collection_journal(_tenant_id uuid, _payment_id uuid)
 RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_pay public.customer_payments; v_je public.journal_entries;
  v_jno text; v_branch uuid; v_wh uuid;
BEGIN
  SELECT * INTO v_pay FROM public.customer_payments WHERE id=_payment_id AND tenant_id=_tenant_id;
  IF NOT FOUND OR v_pay.amount <= 0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id=_tenant_id AND ref_table='customer_payments' AND ref_id=_payment_id AND NOT is_reversal) THEN
    RETURN NULL;
  END IF;
  v_branch := public.resolve_user_branch(_tenant_id, v_pay.collected_by);
  BEGIN
    SELECT s.warehouse_id INTO v_wh FROM public.sales s WHERE s.id = v_pay.sale_id;
  EXCEPTION WHEN undefined_column THEN v_wh := NULL;
  END;

  v_jno := public.generate_journal_no(_tenant_id);
  v_je := public.post_journal(_tenant_id, v_jno, v_pay.payment_date,
    'Due collection', 'customer_payments', _payment_id, NULL,
    jsonb_build_array(
      jsonb_build_object('account_code', public.payment_method_account_code(v_pay.method::text),
                         'debit', v_pay.amount, 'credit', 0,
                         'description', 'Due collection [' || v_pay.method || ']'),
      jsonb_build_object('account_code','1100','debit',0,'credit',v_pay.amount,
                         'description','AR settlement')));
  UPDATE public.journal_entries SET branch_id = v_branch, warehouse_id = v_wh WHERE id = v_je.id;
  PERFORM public.audit_log_event(_tenant_id, 'journal.due_collection', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('payment_id', _payment_id, 'amount', v_pay.amount, 'method', v_pay.method, 'warehouse_id', v_wh));
  RETURN v_je.id;
END $function$;

CREATE OR REPLACE FUNCTION public.backfill_journal_warehouse(_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n_sales int := 0; n_returns int := 0; n_open int := 0; n_coll int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  WITH upd AS (
    UPDATE public.journal_entries je SET warehouse_id = s.warehouse_id
    FROM public.sales s
    WHERE je.tenant_id=_tenant_id AND je.ref_table='sales' AND je.ref_id=s.id
      AND je.warehouse_id IS NULL AND s.warehouse_id IS NOT NULL
    RETURNING 1) SELECT count(*) INTO n_sales FROM upd;

  WITH upd AS (
    UPDATE public.journal_entries je SET warehouse_id = s.warehouse_id
    FROM public.sales_returns r JOIN public.sales s ON s.id = r.sale_id
    WHERE je.tenant_id=_tenant_id AND je.ref_table='sales_returns' AND je.ref_id=r.id
      AND je.warehouse_id IS NULL AND s.warehouse_id IS NOT NULL
    RETURNING 1) SELECT count(*) INTO n_returns FROM upd;

  WITH upd AS (
    UPDATE public.journal_entries je SET warehouse_id = b.warehouse_id
    FROM public.batches b
    WHERE je.tenant_id=_tenant_id AND je.ref_table='batches' AND je.ref_id=b.id
      AND je.warehouse_id IS NULL AND b.warehouse_id IS NOT NULL
    RETURNING 1) SELECT count(*) INTO n_open FROM upd;

  BEGIN
    WITH upd AS (
      UPDATE public.journal_entries je SET warehouse_id = s.warehouse_id
      FROM public.customer_payments cp JOIN public.sales s ON s.id = cp.sale_id
      WHERE je.tenant_id=_tenant_id AND je.ref_table='customer_payments' AND je.ref_id=cp.id
        AND je.warehouse_id IS NULL AND s.warehouse_id IS NOT NULL
      RETURNING 1) SELECT count(*) INTO n_coll FROM upd;
  EXCEPTION WHEN undefined_column THEN n_coll := 0;
  END;

  RETURN jsonb_build_object(
    'sales', n_sales, 'sales_returns', n_returns,
    'opening_stock', n_open, 'customer_payments', n_coll,
    'total', n_sales + n_returns + n_open + n_coll);
END $function$;

REVOKE ALL ON FUNCTION public.backfill_journal_warehouse(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_journal_warehouse(uuid) TO authenticated, service_role;

DROP VIEW IF EXISTS public.v_general_ledger;
CREATE VIEW public.v_general_ledger AS
SELECT je.tenant_id, je.warehouse_id, je.id AS journal_id, je.entry_no, je.entry_date,
       je.ref_table, je.ref_no, je.notes, je.is_reversal,
       c.id AS account_id, c.code AS account_code, c.name AS account_name, c.type AS account_type,
       jl.debit, jl.credit, jl.description,
       sum(CASE WHEN c.type = ANY (ARRAY['asset'::account_type,'expense'::account_type,'cogs'::account_type])
                THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END)
         OVER (PARTITION BY je.tenant_id, c.id
               ORDER BY je.entry_date, je.entry_no, jl.id
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
FROM public.journal_entries je
JOIN public.journal_lines jl ON jl.journal_id = je.id
JOIN public.chart_of_accounts c ON c.id = jl.account_id
WHERE je.posted = true;

GRANT SELECT ON public.v_general_ledger TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_trial_balance_by_warehouse AS
SELECT c.tenant_id, je.warehouse_id,
       c.id AS account_id, c.code AS account_code, c.name AS account_name, c.type AS account_type,
       COALESCE(sum(jl.debit), 0) AS total_debit,
       COALESCE(sum(jl.credit), 0) AS total_credit,
       CASE WHEN c.type = ANY (ARRAY['asset'::account_type,'expense'::account_type,'cogs'::account_type])
            THEN COALESCE(sum(jl.debit - jl.credit), 0)
            ELSE COALESCE(sum(jl.credit - jl.debit), 0) END AS balance
FROM public.chart_of_accounts c
LEFT JOIN public.journal_lines jl ON jl.account_id = c.id
LEFT JOIN public.journal_entries je ON je.id = jl.journal_id AND je.posted = true
GROUP BY c.tenant_id, je.warehouse_id, c.id, c.code, c.name, c.type;

GRANT SELECT ON public.v_trial_balance_by_warehouse TO authenticated, service_role;

SELECT public.backfill_journal_warehouse(t.id) FROM public.tenants t;
