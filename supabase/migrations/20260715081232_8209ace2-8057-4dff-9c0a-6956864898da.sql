
-- 1) Safety net: BEFORE INSERT trigger to default branch_id on journal_entries
CREATE OR REPLACE FUNCTION public.tg_journal_entries_default_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.branch_id IS NULL AND NEW.tenant_id IS NOT NULL THEN
    NEW.branch_id := public.resolve_default_branch(NEW.tenant_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_je_default_branch ON public.journal_entries;
CREATE TRIGGER tg_je_default_branch
  BEFORE INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_journal_entries_default_branch();

-- 2) Harden post_collection_journal to resolve branch robustly and set it inline
CREATE OR REPLACE FUNCTION public.post_collection_journal(_tenant_id uuid, _payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_pay public.customer_payments;
  v_je  public.journal_entries;
  v_jno text;
  v_branch uuid;
  v_wh uuid;
BEGIN
  SELECT * INTO v_pay FROM public.customer_payments WHERE id=_payment_id AND tenant_id=_tenant_id;
  IF NOT FOUND OR v_pay.amount <= 0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id=_tenant_id AND ref_table='customer_payments' AND ref_id=_payment_id AND NOT is_reversal) THEN
    RETURN NULL;
  END IF;

  v_branch := COALESCE(
    v_pay.branch_id,
    public.resolve_user_branch(_tenant_id, v_pay.collected_by),
    public.resolve_default_branch(_tenant_id)
  );

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

  UPDATE public.journal_entries
     SET branch_id = COALESCE(v_branch, branch_id),
         warehouse_id = v_wh
   WHERE id = v_je.id;

  PERFORM public.audit_log_event(_tenant_id, 'journal.due_collection', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('payment_id', _payment_id, 'amount', v_pay.amount, 'method', v_pay.method,
                       'branch_id', v_branch, 'warehouse_id', v_wh));
  RETURN v_je.id;
END $function$;
