
-- STEP 1: Backfill journal_entries.branch_id
UPDATE public.journal_entries je
SET branch_id = sub.branch_id
FROM (
  SELECT DISTINCT ON (journal_id) journal_id, branch_id
  FROM public.journal_lines
  WHERE branch_id IS NOT NULL
  ORDER BY journal_id, created_at NULLS LAST
) sub
WHERE je.id = sub.journal_id AND je.branch_id IS NULL;

UPDATE public.journal_entries je
SET branch_id = sub.id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, id
  FROM public.branches
  ORDER BY tenant_id, (code = 'HQ') DESC, created_at ASC
) sub
WHERE je.branch_id IS NULL AND sub.tenant_id = je.tenant_id;

SET CONSTRAINTS ALL IMMEDIATE;

-- STEP 2: NOT NULL enforcement
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'sales','sale_items','sale_payments','sales_returns','sale_return_items',
    'purchases','purchase_items','purchase_orders','purchase_order_items',
    'purchase_returns','purchase_return_items',
    'goods_receipts','goods_receipt_items',
    'customer_payments','supplier_payments',
    'expenses','incomes',
    'journal_entries','journal_lines',
    'quotations','quotation_items',
    'stock_transfer_items',
    'cash_register_transactions',
    'prescriptions','prescription_items','clinical_audit'
  ];
  null_count bigint;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE branch_id IS NULL', t) INTO null_count;
    IF null_count > 0 THEN
      RAISE EXCEPTION 'Cannot set NOT NULL on %: % NULL rows remain', t, null_count;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN branch_id SET NOT NULL', t);
  END LOOP;
END $$;

-- STEP 3: Drop any legacy auto-derive triggers
DO $$
DECLARE
  trg text;
  triggers text[] := ARRAY[
    'tg_branch_from_warehouse','tg_branch_from_sale','tg_branch_from_purchase',
    'tg_branch_from_po','tg_branch_from_grn','tg_branch_grn_header',
    'tg_branch_from_return','tg_branch_purchase_return_header','tg_branch_sales_return_header',
    'tg_branch_from_quotation','tg_branch_from_prescription','tg_branch_from_clinical',
    'tg_branch_from_transfer','tg_branch_from_register','tg_branch_from_journal_entry',
    'tg_branch_default_hq'
  ];
  rec record;
BEGIN
  FOREACH trg IN ARRAY triggers LOOP
    FOR rec IN
      SELECT tgrelid::regclass::text AS tbl
      FROM pg_trigger
      WHERE tgname = trg AND NOT tgisinternal
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', trg, rec.tbl);
    END LOOP;
  END LOOP;
END $$;

-- STEP 4: Strict RLS — drop NULL bypass on branch_isolation_* policies
-- Skip stock_transfers (uses from_branch_id/to_branch_id and already strict)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'branch_isolation_%'
      AND tablename <> 'stock_transfers'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);

    IF r.cmd = 'SELECT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (is_corporate_role(auth.uid(), tenant_id) OR has_branch_access(auth.uid(), branch_id))',
        r.policyname, r.tablename
      );
    ELSIF r.cmd = 'INSERT' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (is_corporate_writer(auth.uid(), tenant_id) OR has_branch_access(auth.uid(), branch_id))',
        r.policyname, r.tablename
      );
    ELSIF r.cmd = 'UPDATE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE USING (is_corporate_writer(auth.uid(), tenant_id) OR has_branch_access(auth.uid(), branch_id)) WITH CHECK (is_corporate_writer(auth.uid(), tenant_id) OR has_branch_access(auth.uid(), branch_id))',
        r.policyname, r.tablename
      );
    ELSIF r.cmd = 'DELETE' THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE USING (is_corporate_writer(auth.uid(), tenant_id) OR has_branch_access(auth.uid(), branch_id))',
        r.policyname, r.tablename
      );
    END IF;
  END LOOP;
END $$;
