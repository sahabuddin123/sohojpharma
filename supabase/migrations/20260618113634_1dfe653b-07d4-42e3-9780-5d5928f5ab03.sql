
-- =========================================================================
-- 1) SCHEMA: journal_entries additions
-- =========================================================================
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS posted boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_reversal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversed_journal_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

-- journal_no mirrors entry_no, formatted JRN-YYYYMM-000001
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS journal_no text
    GENERATED ALWAYS AS (entry_no) STORED;

CREATE INDEX IF NOT EXISTS idx_je_branch ON public.journal_entries(branch_id);
CREATE INDEX IF NOT EXISTS idx_je_reversed ON public.journal_entries(reversed_journal_id);

-- =========================================================================
-- 2) BLOCK edit/delete on posted journals (reversal-only model)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.block_posted_journal_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.posted THEN RAISE EXCEPTION 'cannot delete posted journal % — use reverse_journal()', OLD.entry_no
      USING ERRCODE='42501'; END IF;
    RETURN OLD;
  END IF;
  -- UPDATE
  IF OLD.posted AND (
        NEW.entry_no IS DISTINCT FROM OLD.entry_no
     OR NEW.entry_date IS DISTINCT FROM OLD.entry_date
     OR NEW.total_debit IS DISTINCT FROM OLD.total_debit
     OR NEW.total_credit IS DISTINCT FROM OLD.total_credit
     OR NEW.ref_table IS DISTINCT FROM OLD.ref_table
     OR NEW.ref_id IS DISTINCT FROM OLD.ref_id
     OR NEW.posted IS DISTINCT FROM OLD.posted
  ) THEN
    RAISE EXCEPTION 'posted journal % is immutable — use reverse_journal()', OLD.entry_no
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_je_block_mutation ON public.journal_entries;
CREATE TRIGGER trg_je_block_mutation
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.block_posted_journal_mutation();

CREATE OR REPLACE FUNCTION public.block_posted_journal_line_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_posted boolean;
BEGIN
  SELECT posted INTO v_posted FROM public.journal_entries
   WHERE id = COALESCE(NEW.journal_id, OLD.journal_id);
  IF v_posted THEN
    RAISE EXCEPTION 'journal lines are immutable once posted — use reverse_journal()'
      USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_jl_block_mutation ON public.journal_lines;
CREATE TRIGGER trg_jl_block_mutation
  BEFORE UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.block_posted_journal_line_mutation();

-- =========================================================================
-- 3) HELPERS: account mapping + journal numbering
-- =========================================================================
CREATE OR REPLACE FUNCTION public.payment_method_account_code(_method text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(COALESCE(_method,'cash'))
    WHEN 'cash'   THEN '1000'
    WHEN 'bank'   THEN '1010'
    WHEN 'bkash'  THEN '1020'
    WHEN 'nagad'  THEN '1030'
    WHEN 'rocket' THEN '1040'
    WHEN 'card'   THEN '1050'
    WHEN 'due'    THEN '1100'
    WHEN 'store_credit' THEN '1100'
    WHEN 'adjustment'   THEN '1100'
    ELSE '1000'
  END
$$;

CREATE OR REPLACE FUNCTION public.generate_journal_no(_tenant_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_prefix text := 'JRN-' || to_char(now(),'YYYYMM') || '-';
  v_seq int;
BEGIN
  SELECT COALESCE(MAX((regexp_match(entry_no, '(\d+)$'))[1]::int),0)+1
    INTO v_seq
    FROM public.journal_entries
   WHERE tenant_id = _tenant_id AND entry_no LIKE v_prefix || '%';
  RETURN v_prefix || lpad(v_seq::text,6,'0');
END $$;

-- Best-effort branch resolver from a cashier/user
CREATE OR REPLACE FUNCTION public.resolve_user_branch(_tenant_id uuid, _user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT branch_id FROM public.cash_registers
   WHERE tenant_id = _tenant_id AND user_id = _user_id
   ORDER BY opened_at DESC NULLS LAST LIMIT 1
$$;

-- =========================================================================
-- 4) JOURNAL POSTERS
-- =========================================================================

-- 4a) Sale (billing + COGS)
CREATE OR REPLACE FUNCTION public.post_sale_journal(_tenant_id uuid, _sale_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_sale public.sales;
  v_pay  record;
  v_lines jsonb := '[]'::jsonb;
  v_cogs numeric := 0;
  v_je public.journal_entries;
  v_jno text;
  v_branch uuid;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id AND tenant_id = _tenant_id;
  IF NOT FOUND OR v_sale.total <= 0 OR v_sale.status = 'void' THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id = _tenant_id AND ref_table = 'sales' AND ref_id = _sale_id AND NOT is_reversal) THEN
    RETURN NULL; -- already posted
  END IF;

  v_branch := public.resolve_user_branch(_tenant_id, v_sale.cashier_id);

  -- DEBITS: payments by method
  FOR v_pay IN
    SELECT method::text AS method, SUM(amount) AS amt
      FROM public.sale_payments WHERE sale_id = _sale_id GROUP BY method
  LOOP
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', public.payment_method_account_code(v_pay.method),
      'debit', v_pay.amt, 'credit', 0,
      'description', 'Sale ' || v_sale.invoice_no || ' — ' || v_pay.method));
  END LOOP;

  -- DEBIT: AR for any unpaid balance
  IF v_sale.due > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code','1100','debit',v_sale.due,'credit',0,
      'description','Sale ' || v_sale.invoice_no || ' — on account'));
  END IF;

  -- DEBIT: Discount Allowed (contra revenue)
  IF COALESCE(v_sale.discount,0) > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code','4090','debit',v_sale.discount,'credit',0,
      'description','Discount allowed on ' || v_sale.invoice_no));
  END IF;

  -- CREDIT: Sales Revenue (gross subtotal)
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code','4000','debit',0,'credit',v_sale.subtotal,
    'description','Sales revenue ' || v_sale.invoice_no));

  -- CREDIT: Output VAT
  IF COALESCE(v_sale.vat,0) > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code','2100','debit',0,'credit',v_sale.vat,
      'description','Output VAT ' || v_sale.invoice_no));
  END IF;

  v_jno := public.generate_journal_no(_tenant_id);
  v_je := public.post_journal(_tenant_id, v_jno, v_sale.sale_date,
    'Sale ' || v_sale.invoice_no, 'sales', _sale_id, v_sale.invoice_no, v_lines);
  UPDATE public.journal_entries SET branch_id = v_branch WHERE id = v_je.id;

  -- COGS leg
  SELECT COALESCE(SUM(COALESCE(unit_cost,0) * qty),0) INTO v_cogs
    FROM public.sale_items WHERE sale_id = _sale_id;
  IF v_cogs > 0 THEN
    v_jno := public.generate_journal_no(_tenant_id);
    PERFORM public.post_journal(_tenant_id, v_jno, v_sale.sale_date,
      'COGS for ' || v_sale.invoice_no, 'sales', _sale_id, v_sale.invoice_no,
      jsonb_build_array(
        jsonb_build_object('account_code','5000','debit',v_cogs,'credit',0,'description','COGS ' || v_sale.invoice_no),
        jsonb_build_object('account_code','1200','debit',0,'credit',v_cogs,'description','Inventory out ' || v_sale.invoice_no)));
    UPDATE public.journal_entries SET branch_id = v_branch
      WHERE tenant_id = _tenant_id AND entry_no = v_jno;
  ELSE
    PERFORM public.audit_log_event(_tenant_id, 'journal.cogs_skipped', 'sales', _sale_id, NULL,
      jsonb_build_object('sale_id', _sale_id, 'reason','missing_cost'));
  END IF;

  PERFORM public.audit_log_event(_tenant_id, 'journal.sale', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('sale_id', _sale_id, 'invoice_no', v_sale.invoice_no,
                       'total', v_sale.total, 'cogs', v_cogs, 'branch_id', v_branch));
  RETURN v_je.id;
END $$;

-- 4b) Sales Return (refund + inventory reversal)
CREATE OR REPLACE FUNCTION public.post_return_journal(_tenant_id uuid, _return_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_ret public.sales_returns;
  v_sale public.sales;
  v_lines jsonb := '[]'::jsonb;
  v_je public.journal_entries;
  v_jno text;
  v_branch uuid;
  v_cogs numeric := 0;
  v_method_code text;
  v_special boolean := false;
BEGIN
  SELECT * INTO v_ret FROM public.sales_returns WHERE id = _return_id AND tenant_id = _tenant_id;
  IF NOT FOUND OR v_ret.total <= 0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id = _tenant_id AND ref_table = 'sales_returns' AND ref_id = _return_id AND NOT is_reversal) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_sale FROM public.sales WHERE id = v_ret.sale_id;
  v_branch := public.resolve_user_branch(_tenant_id, v_sale.cashier_id);

  -- detect store_credit / adjustment via notes marker
  v_special := COALESCE(v_ret.notes,'') ~* '\[refund=(due|store_credit|adjustment)\]';
  v_method_code := CASE WHEN v_special THEN '1100'
                        ELSE public.payment_method_account_code(v_ret.refund_method::text) END;

  -- DEBIT Sales Return (contra revenue) = subtotal portion
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code','4050','debit',v_ret.subtotal,'credit',0,
    'description','Sales return ' || v_ret.return_no));

  -- DEBIT Output VAT reversal
  IF COALESCE(v_ret.vat,0) > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code','2100','debit',v_ret.vat,'credit',0,
      'description','VAT reversal ' || v_ret.return_no));
  END IF;

  -- CREDIT cash/wallet/bank OR AR
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code', v_method_code,'debit',0,'credit',v_ret.refunded_amount,
    'description','Refund ' || v_ret.return_no));

  v_jno := public.generate_journal_no(_tenant_id);
  v_je := public.post_journal(_tenant_id, v_jno, v_ret.return_date,
    'Sales return ' || v_ret.return_no, 'sales_returns', _return_id, v_ret.return_no, v_lines);
  UPDATE public.journal_entries SET branch_id = v_branch WHERE id = v_je.id;

  -- Inventory reversal: sum of returned cost
  SELECT COALESCE(SUM(sri.qty * COALESCE(si.unit_cost,0)),0) INTO v_cogs
    FROM public.sale_return_items sri
    JOIN public.sale_items si ON si.id = sri.sale_item_id
   WHERE sri.return_id = _return_id;
  IF v_cogs > 0 THEN
    v_jno := public.generate_journal_no(_tenant_id);
    PERFORM public.post_journal(_tenant_id, v_jno, v_ret.return_date,
      'Inventory restored from ' || v_ret.return_no, 'sales_returns', _return_id, v_ret.return_no,
      jsonb_build_array(
        jsonb_build_object('account_code','1200','debit',v_cogs,'credit',0,'description','Inventory restore ' || v_ret.return_no),
        jsonb_build_object('account_code','5000','debit',0,'credit',v_cogs,'description','COGS reversal ' || v_ret.return_no)));
    UPDATE public.journal_entries SET branch_id = v_branch
      WHERE tenant_id = _tenant_id AND entry_no = v_jno;
  END IF;

  PERFORM public.audit_log_event(_tenant_id, 'journal.return', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('return_id', _return_id, 'return_no', v_ret.return_no,
                       'refund', v_ret.refunded_amount, 'cogs_reversed', v_cogs));
  RETURN v_je.id;
END $$;

-- 4c) Customer due collection
CREATE OR REPLACE FUNCTION public.post_collection_journal(_tenant_id uuid, _payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_pay public.customer_payments;
  v_je public.journal_entries;
  v_jno text;
  v_branch uuid;
BEGIN
  SELECT * INTO v_pay FROM public.customer_payments WHERE id = _payment_id AND tenant_id = _tenant_id;
  IF NOT FOUND OR v_pay.amount <= 0 THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id = _tenant_id AND ref_table='customer_payments' AND ref_id=_payment_id AND NOT is_reversal) THEN
    RETURN NULL;
  END IF;
  v_branch := public.resolve_user_branch(_tenant_id, v_pay.collected_by);

  v_jno := public.generate_journal_no(_tenant_id);
  v_je := public.post_journal(_tenant_id, v_jno, v_pay.payment_date,
    'Due collection', 'customer_payments', _payment_id, NULL,
    jsonb_build_array(
      jsonb_build_object('account_code', public.payment_method_account_code(v_pay.method::text),
                         'debit', v_pay.amount, 'credit', 0,
                         'description', 'Due collection [' || v_pay.method || ']'),
      jsonb_build_object('account_code','1100','debit',0,'credit',v_pay.amount,
                         'description','AR settlement')));
  UPDATE public.journal_entries SET branch_id = v_branch WHERE id = v_je.id;

  PERFORM public.audit_log_event(_tenant_id, 'journal.due_collection', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('payment_id', _payment_id, 'amount', v_pay.amount, 'method', v_pay.method));
  RETURN v_je.id;
END $$;

-- 4d) Goods receipt (purchase)
CREATE OR REPLACE FUNCTION public.post_grn_journal(_tenant_id uuid, _grn_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_grn public.goods_receipts;
  v_value numeric;
  v_vat numeric := 0;
  v_je public.journal_entries;
  v_jno text;
  v_lines jsonb;
BEGIN
  SELECT * INTO v_grn FROM public.goods_receipts WHERE id = _grn_id AND tenant_id = _tenant_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id = _tenant_id AND ref_table='goods_receipts' AND ref_id=_grn_id AND NOT is_reversal) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(qty_received * unit_cost),0) INTO v_value
    FROM public.goods_receipt_items WHERE grn_id = _grn_id;
  IF v_value <= 0 THEN RETURN NULL; END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code','1200','debit',v_value,'credit',0,'description','GRN ' || v_grn.grn_no || ' — inventory in'),
    jsonb_build_object('account_code','2000','debit',0,'credit',v_value + v_vat,'description','GRN ' || v_grn.grn_no || ' — supplier payable'));

  v_jno := public.generate_journal_no(_tenant_id);
  v_je := public.post_journal(_tenant_id, v_jno, CURRENT_DATE,
    'Goods receipt ' || v_grn.grn_no, 'goods_receipts', _grn_id, v_grn.grn_no, v_lines);

  PERFORM public.audit_log_event(_tenant_id, 'journal.purchase', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('grn_id', _grn_id, 'grn_no', v_grn.grn_no, 'value', v_value));
  RETURN v_je.id;
END $$;

-- 4e) Purchase return
CREATE OR REPLACE FUNCTION public.post_purchase_return_journal(_tenant_id uuid, _return_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_ret public.purchase_returns;
  v_value numeric;
  v_je public.journal_entries;
  v_jno text;
BEGIN
  SELECT * INTO v_ret FROM public.purchase_returns WHERE id = _return_id AND tenant_id = _tenant_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id = _tenant_id AND ref_table='purchase_returns' AND ref_id=_return_id AND NOT is_reversal) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(qty * unit_cost),0) INTO v_value
    FROM public.purchase_return_items WHERE return_id = _return_id;
  IF v_value <= 0 THEN RETURN NULL; END IF;

  v_jno := public.generate_journal_no(_tenant_id);
  v_je := public.post_journal(_tenant_id, v_jno, v_ret.return_date,
    'Purchase return ' || v_ret.return_no, 'purchase_returns', _return_id, v_ret.return_no,
    jsonb_build_array(
      jsonb_build_object('account_code','2000','debit',v_value,'credit',0,'description','PR ' || v_ret.return_no || ' — AP reversal'),
      jsonb_build_object('account_code','1200','debit',0,'credit',v_value,'description','PR ' || v_ret.return_no || ' — inventory out')));

  PERFORM public.audit_log_event(_tenant_id, 'journal.purchase_return', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('return_id', _return_id, 'value', v_value));
  RETURN v_je.id;
END $$;

-- 4f) Opening stock (called per batch by Fix 3 wizard)
CREATE OR REPLACE FUNCTION public.post_opening_stock_journal(_tenant_id uuid, _batch_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_b public.batches;
  v_value numeric;
  v_je public.journal_entries;
  v_jno text;
BEGIN
  SELECT * INTO v_b FROM public.batches WHERE id = _batch_id AND tenant_id = _tenant_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries
              WHERE tenant_id = _tenant_id AND ref_table='batches' AND ref_id=_batch_id AND NOT is_reversal) THEN
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
  UPDATE public.journal_entries SET branch_id = v_b.branch_id WHERE id = v_je.id;

  PERFORM public.audit_log_event(_tenant_id, 'journal.opening_stock', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('batch_id', _batch_id, 'value', v_value));
  RETURN v_je.id;
END $$;

-- =========================================================================
-- 5) DEFERRED CONSTRAINT TRIGGERS — fire at COMMIT, after all rows exist
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trg_post_sale_journal()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN PERFORM public.post_sale_journal(NEW.tenant_id, NEW.id); RETURN NULL; END $$;

CREATE OR REPLACE FUNCTION public.trg_post_return_journal()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN PERFORM public.post_return_journal(NEW.tenant_id, NEW.id); RETURN NULL; END $$;

CREATE OR REPLACE FUNCTION public.trg_post_collection_journal()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN PERFORM public.post_collection_journal(NEW.tenant_id, NEW.id); RETURN NULL; END $$;

CREATE OR REPLACE FUNCTION public.trg_post_grn_journal()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN PERFORM public.post_grn_journal(NEW.tenant_id, NEW.id); RETURN NULL; END $$;

CREATE OR REPLACE FUNCTION public.trg_post_purchase_return_journal()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN PERFORM public.post_purchase_return_journal(NEW.tenant_id, NEW.id); RETURN NULL; END $$;

DROP TRIGGER IF EXISTS trg_je_sale ON public.sales;
CREATE CONSTRAINT TRIGGER trg_je_sale
  AFTER INSERT ON public.sales
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_sale_journal();

DROP TRIGGER IF EXISTS trg_je_return ON public.sales_returns;
CREATE CONSTRAINT TRIGGER trg_je_return
  AFTER INSERT ON public.sales_returns
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_return_journal();

DROP TRIGGER IF EXISTS trg_je_collection ON public.customer_payments;
CREATE CONSTRAINT TRIGGER trg_je_collection
  AFTER INSERT ON public.customer_payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_collection_journal();

DROP TRIGGER IF EXISTS trg_je_grn ON public.goods_receipts;
CREATE CONSTRAINT TRIGGER trg_je_grn
  AFTER INSERT ON public.goods_receipts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_grn_journal();

DROP TRIGGER IF EXISTS trg_je_purchase_return ON public.purchase_returns;
CREATE CONSTRAINT TRIGGER trg_je_purchase_return
  AFTER INSERT ON public.purchase_returns
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_post_purchase_return_journal();

-- =========================================================================
-- 6) REVERSAL ENGINE
-- =========================================================================
CREATE OR REPLACE FUNCTION public.reverse_journal(_journal_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_orig public.journal_entries;
  v_rev  public.journal_entries;
  v_jno  text;
  v_line record;
BEGIN
  SELECT * INTO v_orig FROM public.journal_entries WHERE id = _journal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'journal not found' USING ERRCODE='23503'; END IF;
  IF NOT public.is_tenant_member(auth.uid(), v_orig.tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reversed_journal_id = _journal_id) THEN
    RAISE EXCEPTION 'journal % already reversed', v_orig.entry_no USING ERRCODE='23505';
  END IF;

  v_jno := public.generate_journal_no(v_orig.tenant_id);
  INSERT INTO public.journal_entries(
    tenant_id, entry_no, entry_date, notes, ref_table, ref_id, ref_no,
    posted_by, branch_id, posted, is_reversal, reversed_journal_id, reversal_reason
  ) VALUES (
    v_orig.tenant_id, v_jno, CURRENT_DATE,
    'Reversal of ' || v_orig.entry_no || COALESCE(' — '||_reason,''),
    v_orig.ref_table, v_orig.ref_id, v_orig.ref_no,
    auth.uid(), v_orig.branch_id, true, true, _journal_id, _reason
  ) RETURNING * INTO v_rev;

  FOR v_line IN SELECT * FROM public.journal_lines WHERE journal_id = _journal_id LOOP
    INSERT INTO public.journal_lines(tenant_id, journal_id, account_id, debit, credit, description)
    VALUES (v_orig.tenant_id, v_rev.id, v_line.account_id, v_line.credit, v_line.debit,
            'REV: ' || COALESCE(v_line.description,''));
  END LOOP;

  PERFORM public.audit_log_event(v_orig.tenant_id, 'journal.reversal', 'journal_entries', v_rev.id, NULL,
    jsonb_build_object('original_journal_id', _journal_id, 'reason', _reason));
  RETURN v_rev.id;
END $$;

-- =========================================================================
-- 7) record_supplier_payment RPC
-- =========================================================================
CREATE OR REPLACE FUNCTION public.record_supplier_payment(
  _tenant_id uuid, _supplier_id uuid, _amount numeric,
  _method text DEFAULT 'cash', _reference text DEFAULT NULL,
  _notes text DEFAULT NULL, _payment_date date DEFAULT NULL,
  _register_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_no text;
  v_je public.journal_entries;
  v_jno text;
  v_method_pm public.payment_method;
  v_branch uuid;
  v_reg public.cash_registers;
  v_ref_id uuid := gen_random_uuid();
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0' USING ERRCODE='22023'; END IF;

  v_method_pm := COALESCE(lower(_method),'cash')::public.payment_method;
  v_no := 'SPY-' || to_char(now(),'YYYYMMDDHH24MISS') || '-' || substr(v_ref_id::text,1,4);

  IF _register_id IS NOT NULL THEN
    SELECT * INTO v_reg FROM public.cash_registers WHERE id=_register_id AND tenant_id=_tenant_id;
    v_branch := v_reg.branch_id;
  ELSE
    v_branch := public.resolve_user_branch(_tenant_id, auth.uid());
  END IF;

  -- Supplier ledger
  PERFORM public.post_ledger_entry(
    _tenant_id, 'supplier'::public.party_type, _supplier_id, 'payment'::public.ledger_entry_type,
    _amount, 0, 'supplier_payments', v_ref_id, v_no,
    'Supplier payment [' || _method || ']' || COALESCE(' — '||_notes,''));

  -- Cash register
  IF _register_id IS NOT NULL AND v_reg.status = 'open' THEN
    INSERT INTO public.cash_register_transactions(
      tenant_id, register_id, transaction_type, amount, payment_method, notes,
      reference_table, reference_id, reference_no, created_by
    ) VALUES (_tenant_id, _register_id, 'supplier_payment', _amount, _method,
              COALESCE(_notes,'Supplier payment'), 'supplier_payments', v_ref_id, v_no, auth.uid());
  END IF;

  -- Journal: DR AP / CR cash-or-wallet
  v_jno := public.generate_journal_no(_tenant_id);
  v_je := public.post_journal(_tenant_id, v_jno, COALESCE(_payment_date, CURRENT_DATE),
    'Supplier payment ' || v_no, 'supplier_payments', v_ref_id, v_no,
    jsonb_build_array(
      jsonb_build_object('account_code','2000','debit',_amount,'credit',0,'description','AP settled'),
      jsonb_build_object('account_code', public.payment_method_account_code(_method),
                         'debit',0,'credit',_amount,'description','Paid via ' || _method)));
  UPDATE public.journal_entries SET branch_id = v_branch WHERE id = v_je.id;

  PERFORM public.audit_log_event(_tenant_id, 'journal.supplier_payment', 'journal_entries', v_je.id, NULL,
    jsonb_build_object('supplier_id',_supplier_id,'amount',_amount,'method',_method,'ref_no',v_no));
  RETURN v_je.id;
END $$;

GRANT EXECUTE ON FUNCTION public.record_supplier_payment(uuid,uuid,numeric,text,text,text,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_journal(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_opening_stock_journal(uuid,uuid) TO authenticated;

-- =========================================================================
-- 8) WIRE cancel_sale_invoice → reverse_journal
-- =========================================================================
CREATE OR REPLACE FUNCTION public.cancel_sale_journals(_tenant_id uuid, _sale_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_j record;
BEGIN
  FOR v_j IN SELECT id FROM public.journal_entries
              WHERE tenant_id = _tenant_id AND ref_table='sales' AND ref_id=_sale_id
                AND NOT is_reversal
                AND NOT EXISTS (SELECT 1 FROM public.journal_entries r WHERE r.reversed_journal_id = journal_entries.id)
  LOOP
    PERFORM public.reverse_journal(v_j.id, COALESCE(_reason,'sale_cancelled'));
  END LOOP;
END $$;

-- Trigger: when a sale flips to status='void', reverse all its journals
CREATE OR REPLACE FUNCTION public.trg_reverse_sale_journal()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'void' AND OLD.status IS DISTINCT FROM 'void' THEN
    PERFORM public.cancel_sale_journals(NEW.tenant_id, NEW.id, NEW.cancellation_reason);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_je_sale_cancel ON public.sales;
CREATE TRIGGER trg_je_sale_cancel
  AFTER UPDATE OF status ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.trg_reverse_sale_journal();
