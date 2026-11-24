
-- =============================================================================
-- PHASE 11.6 RC1 — Backfill, Reconciliation, GL Reports
-- =============================================================================

-- 1) Historical backfill (dry-run + commit) ----------------------------------
CREATE OR REPLACE FUNCTION public.backfill_historical_journals(
  _tenant_id uuid,
  _dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member boolean;
  v_sales_pending bigint := 0;
  v_returns_pending bigint := 0;
  v_collections_pending bigint := 0;
  v_grn_pending bigint := 0;
  v_preturns_pending bigint := 0;
  v_sales_done bigint := 0;
  v_returns_done bigint := 0;
  v_collections_done bigint := 0;
  v_grn_done bigint := 0;
  v_preturns_done bigint := 0;
  v_errors jsonb := '[]'::jsonb;
  r record;
BEGIN
  -- Authorize
  SELECT is_tenant_member(auth.uid(), _tenant_id) INTO v_is_member;
  IF NOT COALESCE(v_is_member, false) THEN
    RAISE EXCEPTION 'Forbidden: not a member of tenant %', _tenant_id;
  END IF;

  -- Count pending (records without a non-reversal journal)
  SELECT count(*) INTO v_sales_pending FROM sales s
   WHERE s.tenant_id = _tenant_id AND COALESCE(s.status,'') <> 'void'
     AND NOT EXISTS (SELECT 1 FROM journal_entries je
                      WHERE je.tenant_id=_tenant_id AND je.ref_table='sales'
                        AND je.ref_id=s.id AND je.is_reversal=false);

  SELECT count(*) INTO v_returns_pending FROM sales_returns r
   WHERE r.tenant_id = _tenant_id
     AND NOT EXISTS (SELECT 1 FROM journal_entries je
                      WHERE je.tenant_id=_tenant_id AND je.ref_table='sales_returns'
                        AND je.ref_id=r.id AND je.is_reversal=false);

  SELECT count(*) INTO v_collections_pending FROM customer_payments p
   WHERE p.tenant_id = _tenant_id
     AND NOT EXISTS (SELECT 1 FROM journal_entries je
                      WHERE je.tenant_id=_tenant_id AND je.ref_table='customer_payments'
                        AND je.ref_id=p.id AND je.is_reversal=false);

  SELECT count(*) INTO v_grn_pending FROM goods_receipts g
   WHERE g.tenant_id = _tenant_id
     AND NOT EXISTS (SELECT 1 FROM journal_entries je
                      WHERE je.tenant_id=_tenant_id AND je.ref_table='goods_receipts'
                        AND je.ref_id=g.id AND je.is_reversal=false);

  SELECT count(*) INTO v_preturns_pending FROM purchase_returns pr
   WHERE pr.tenant_id = _tenant_id
     AND NOT EXISTS (SELECT 1 FROM journal_entries je
                      WHERE je.tenant_id=_tenant_id AND je.ref_table='purchase_returns'
                        AND je.ref_id=pr.id AND je.is_reversal=false);

  IF _dry_run THEN
    RETURN jsonb_build_object(
      'mode','dry_run',
      'pending', jsonb_build_object(
        'sales', v_sales_pending,
        'sales_returns', v_returns_pending,
        'customer_payments', v_collections_pending,
        'goods_receipts', v_grn_pending,
        'purchase_returns', v_preturns_pending,
        'total', v_sales_pending+v_returns_pending+v_collections_pending+v_grn_pending+v_preturns_pending
      )
    );
  END IF;

  -- COMMIT MODE: post each pending record, log failures
  FOR r IN SELECT s.id FROM sales s
            WHERE s.tenant_id=_tenant_id AND COALESCE(s.status,'')<>'void'
              AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.tenant_id=_tenant_id AND je.ref_table='sales' AND je.ref_id=s.id AND je.is_reversal=false)
  LOOP
    BEGIN PERFORM post_sale_journal(_tenant_id, r.id); v_sales_done := v_sales_done + 1;
    EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('table','sales','id',r.id,'error',SQLERRM); END;
  END LOOP;

  FOR r IN SELECT x.id FROM sales_returns x
            WHERE x.tenant_id=_tenant_id
              AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.tenant_id=_tenant_id AND je.ref_table='sales_returns' AND je.ref_id=x.id AND je.is_reversal=false)
  LOOP
    BEGIN PERFORM post_return_journal(_tenant_id, r.id); v_returns_done := v_returns_done + 1;
    EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('table','sales_returns','id',r.id,'error',SQLERRM); END;
  END LOOP;

  FOR r IN SELECT x.id FROM customer_payments x
            WHERE x.tenant_id=_tenant_id
              AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.tenant_id=_tenant_id AND je.ref_table='customer_payments' AND je.ref_id=x.id AND je.is_reversal=false)
  LOOP
    BEGIN PERFORM post_collection_journal(_tenant_id, r.id); v_collections_done := v_collections_done + 1;
    EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('table','customer_payments','id',r.id,'error',SQLERRM); END;
  END LOOP;

  FOR r IN SELECT x.id FROM goods_receipts x
            WHERE x.tenant_id=_tenant_id
              AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.tenant_id=_tenant_id AND je.ref_table='goods_receipts' AND je.ref_id=x.id AND je.is_reversal=false)
  LOOP
    BEGIN PERFORM post_grn_journal(_tenant_id, r.id); v_grn_done := v_grn_done + 1;
    EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('table','goods_receipts','id',r.id,'error',SQLERRM); END;
  END LOOP;

  FOR r IN SELECT x.id FROM purchase_returns x
            WHERE x.tenant_id=_tenant_id
              AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.tenant_id=_tenant_id AND je.ref_table='purchase_returns' AND je.ref_id=x.id AND je.is_reversal=false)
  LOOP
    BEGIN PERFORM post_purchase_return_journal(_tenant_id, r.id); v_preturns_done := v_preturns_done + 1;
    EXCEPTION WHEN OTHERS THEN v_errors := v_errors || jsonb_build_object('table','purchase_returns','id',r.id,'error',SQLERRM); END;
  END LOOP;

  -- Audit
  INSERT INTO audit_log(tenant_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (_tenant_id, auth.uid(), 'journal.backfill', 'tenant', _tenant_id,
          jsonb_build_object('sales',v_sales_done,'returns',v_returns_done,'collections',v_collections_done,'grn',v_grn_done,'purchase_returns',v_preturns_done,'errors',v_errors));

  RETURN jsonb_build_object(
    'mode','commit',
    'posted', jsonb_build_object(
      'sales', v_sales_done,
      'sales_returns', v_returns_done,
      'customer_payments', v_collections_done,
      'goods_receipts', v_grn_done,
      'purchase_returns', v_preturns_done
    ),
    'errors', v_errors,
    'error_count', jsonb_array_length(v_errors)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_historical_journals(uuid, boolean) TO authenticated;

-- 2) Financial reconciliation -------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_financials(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member boolean;
  v_inv_value numeric := 0;
  v_inv_gl numeric := 0;
  v_ar_subledger numeric := 0;
  v_ar_gl numeric := 0;
  v_ap_subledger numeric := 0;
  v_ap_gl numeric := 0;
  v_cash_register numeric := 0;
  v_cash_gl numeric := 0;
  v_vat_out_gl numeric := 0;
BEGIN
  SELECT is_tenant_member(auth.uid(), _tenant_id) INTO v_is_member;
  IF NOT COALESCE(v_is_member, false) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Inventory subledger: sum(qty_on_hand * cost) from batches
  SELECT COALESCE(SUM(GREATEST(COALESCE(b.qty_on_hand,0),0) * COALESCE(b.cost_price,0)),0)
    INTO v_inv_value FROM batches b WHERE b.tenant_id=_tenant_id;

  -- GL balances by account code
  SELECT COALESCE(SUM(jl.debit - jl.credit),0) INTO v_inv_gl
    FROM journal_lines jl JOIN chart_of_accounts c ON c.id=jl.account_id
   WHERE jl.tenant_id=_tenant_id AND c.code='1200';

  SELECT COALESCE(SUM(GREATEST(s.total - COALESCE(s.paid_amount,0),0)),0) INTO v_ar_subledger
    FROM sales s WHERE s.tenant_id=_tenant_id AND COALESCE(s.status,'')<>'void';
  SELECT COALESCE(SUM(jl.debit - jl.credit),0) INTO v_ar_gl
    FROM journal_lines jl JOIN chart_of_accounts c ON c.id=jl.account_id
   WHERE jl.tenant_id=_tenant_id AND c.code='1100';

  SELECT COALESCE(SUM(pl.balance),0) INTO v_ap_subledger
    FROM party_ledger pl WHERE pl.tenant_id=_tenant_id AND pl.party_type='supplier';
  SELECT COALESCE(SUM(jl.credit - jl.debit),0) INTO v_ap_gl
    FROM journal_lines jl JOIN chart_of_accounts c ON c.id=jl.account_id
   WHERE jl.tenant_id=_tenant_id AND c.code='2000';

  SELECT COALESCE(SUM(CASE WHEN crt.transaction_type IN ('sale','cash_in','opening') THEN crt.amount
                           WHEN crt.transaction_type IN ('sale_refund','cash_out','expense','closing') THEN -crt.amount
                           ELSE 0 END),0)
    INTO v_cash_register
    FROM cash_register_transactions crt WHERE crt.tenant_id=_tenant_id;
  SELECT COALESCE(SUM(jl.debit - jl.credit),0) INTO v_cash_gl
    FROM journal_lines jl JOIN chart_of_accounts c ON c.id=jl.account_id
   WHERE jl.tenant_id=_tenant_id AND c.code='1000';

  SELECT COALESCE(SUM(jl.credit - jl.debit),0) INTO v_vat_out_gl
    FROM journal_lines jl JOIN chart_of_accounts c ON c.id=jl.account_id
   WHERE jl.tenant_id=_tenant_id AND c.code='2100';

  RETURN jsonb_build_object(
    'inventory', jsonb_build_object('subledger', v_inv_value, 'gl', v_inv_gl, 'variance', v_inv_value - v_inv_gl),
    'accounts_receivable', jsonb_build_object('subledger', v_ar_subledger, 'gl', v_ar_gl, 'variance', v_ar_subledger - v_ar_gl),
    'accounts_payable', jsonb_build_object('subledger', v_ap_subledger, 'gl', v_ap_gl, 'variance', v_ap_subledger - v_ap_gl),
    'cash', jsonb_build_object('subledger', v_cash_register, 'gl', v_cash_gl, 'variance', v_cash_register - v_cash_gl),
    'vat_output_payable', v_vat_out_gl,
    'generated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_financials(uuid) TO authenticated;

-- 3) GL Reporting views -------------------------------------------------------
-- Trial Balance
CREATE OR REPLACE VIEW public.v_trial_balance AS
SELECT
  c.tenant_id,
  c.id   AS account_id,
  c.code AS account_code,
  c.name AS account_name,
  c.type AS account_type,
  COALESCE(SUM(jl.debit),0)  AS total_debit,
  COALESCE(SUM(jl.credit),0) AS total_credit,
  CASE WHEN c.type IN ('asset','expense','cogs')
       THEN COALESCE(SUM(jl.debit - jl.credit),0)
       ELSE COALESCE(SUM(jl.credit - jl.debit),0) END AS balance
FROM chart_of_accounts c
LEFT JOIN journal_lines jl ON jl.account_id = c.id
LEFT JOIN journal_entries je ON je.id = jl.journal_id AND je.posted = true
GROUP BY c.tenant_id, c.id, c.code, c.name, c.type;

GRANT SELECT ON public.v_trial_balance TO authenticated;

-- General Ledger (line-level with running balance per account)
CREATE OR REPLACE VIEW public.v_general_ledger AS
SELECT
  je.tenant_id,
  je.id            AS journal_id,
  je.entry_no,
  je.entry_date,
  je.ref_table,
  je.ref_no,
  je.notes,
  je.is_reversal,
  c.id             AS account_id,
  c.code           AS account_code,
  c.name           AS account_name,
  c.type           AS account_type,
  jl.debit,
  jl.credit,
  jl.description,
  SUM(
    CASE WHEN c.type IN ('asset','expense','cogs') THEN jl.debit - jl.credit
         ELSE jl.credit - jl.debit END
  ) OVER (PARTITION BY je.tenant_id, c.id
          ORDER BY je.entry_date, je.entry_no, jl.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
FROM journal_entries je
JOIN journal_lines jl ON jl.journal_id = je.id
JOIN chart_of_accounts c ON c.id = jl.account_id
WHERE je.posted = true;

GRANT SELECT ON public.v_general_ledger TO authenticated;

-- Balance Sheet rollup
CREATE OR REPLACE VIEW public.v_balance_sheet AS
SELECT
  tenant_id,
  account_type,
  SUM(balance) AS total
FROM public.v_trial_balance
WHERE account_type IN ('asset','liability','equity')
GROUP BY tenant_id, account_type;

GRANT SELECT ON public.v_balance_sheet TO authenticated;

-- Cash Flow (cash account 1000 + bank 1010 movements)
CREATE OR REPLACE VIEW public.v_cash_flow AS
SELECT
  je.tenant_id,
  date_trunc('month', je.entry_date)::date AS month,
  c.code AS account_code,
  c.name AS account_name,
  SUM(jl.debit)  AS inflow,
  SUM(jl.credit) AS outflow,
  SUM(jl.debit - jl.credit) AS net_change
FROM journal_entries je
JOIN journal_lines jl ON jl.journal_id = je.id
JOIN chart_of_accounts c ON c.id = jl.account_id
WHERE je.posted = true AND c.code IN ('1000','1010','1020','1030','1040','1050')
GROUP BY je.tenant_id, date_trunc('month', je.entry_date), c.code, c.name;

GRANT SELECT ON public.v_cash_flow TO authenticated;

-- Equity changes
CREATE OR REPLACE VIEW public.v_equity_changes AS
SELECT
  je.tenant_id,
  date_trunc('month', je.entry_date)::date AS month,
  c.code AS account_code,
  c.name AS account_name,
  SUM(jl.credit - jl.debit) AS net_change
FROM journal_entries je
JOIN journal_lines jl ON jl.journal_id = je.id
JOIN chart_of_accounts c ON c.id = jl.account_id
WHERE je.posted = true AND c.type = 'equity'
GROUP BY je.tenant_id, date_trunc('month', je.entry_date), c.code, c.name;

GRANT SELECT ON public.v_equity_changes TO authenticated;
