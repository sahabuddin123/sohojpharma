CREATE OR REPLACE FUNCTION public.post_journal_with_branch(_tenant_id uuid, _entry_no text, _entry_date date, _notes text, _ref_table text, _ref_id uuid, _ref_no text, _lines jsonb, _branch_id uuid)
RETURNS journal_entries
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_je public.journal_entries;
  v_line jsonb;
  v_acc uuid;
  v_d numeric;
  v_c numeric;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF jsonb_array_length(COALESCE(_lines, '[]'::jsonb)) < 2 THEN
    RAISE EXCEPTION 'journal needs at least 2 lines' USING ERRCODE='22023';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_d := COALESCE((v_line->>'debit')::numeric, 0);
    v_c := COALESCE((v_line->>'credit')::numeric, 0);
    v_total_debit := v_total_debit + v_d;
    v_total_credit := v_total_credit + v_c;
  END LOOP;

  IF round(v_total_debit,4) <> round(v_total_credit,4) THEN
    RAISE EXCEPTION 'journal % is unbalanced: debit=% credit=%', _entry_no, v_total_debit, v_total_credit
      USING ERRCODE='22023';
  END IF;

  INSERT INTO public.journal_entries(
    tenant_id, entry_no, entry_date, notes, ref_table, ref_id, ref_no,
    total_debit, total_credit, posted_by, branch_id
  ) VALUES (
    _tenant_id, _entry_no, COALESCE(_entry_date, CURRENT_DATE), _notes,
    _ref_table, _ref_id, _ref_no, v_total_debit, v_total_credit, auth.uid(), _branch_id
  ) RETURNING * INTO v_je;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    SELECT id INTO v_acc
      FROM public.chart_of_accounts
     WHERE tenant_id = _tenant_id
       AND code = v_line->>'account_code'
       AND is_active;

    IF v_acc IS NULL THEN
      RAISE EXCEPTION 'unknown account code: %', v_line->>'account_code' USING ERRCODE='23503';
    END IF;

    v_d := COALESCE((v_line->>'debit')::numeric, 0);
    v_c := COALESCE((v_line->>'credit')::numeric, 0);

    INSERT INTO public.journal_lines(tenant_id, journal_id, account_id, debit, credit, description)
    VALUES (_tenant_id, v_je.id, v_acc, v_d, v_c, v_line->>'description');
  END LOOP;

  RETURN v_je;
END
$function$;

CREATE OR REPLACE FUNCTION public.post_sale_journal(_tenant_id uuid, _sale_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale public.sales;
  v_pay record;
  v_lines jsonb := '[]'::jsonb;
  v_cogs numeric := 0;
  v_je public.journal_entries;
  v_cogs_je public.journal_entries;
  v_jno text;
  v_branch uuid;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = _sale_id AND tenant_id = _tenant_id;

  IF NOT FOUND OR v_sale.total <= 0 OR v_sale.status = 'void' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.journal_entries
     WHERE tenant_id = _tenant_id
       AND ref_table = 'sales'
       AND ref_id = _sale_id
       AND NOT is_reversal
  ) THEN
    RETURN NULL;
  END IF;

  v_branch := public.resolve_user_branch(_tenant_id, v_sale.cashier_id);

  FOR v_pay IN
    SELECT method::text AS method, SUM(amount) AS amt
      FROM public.sale_payments
     WHERE sale_id = _sale_id
     GROUP BY method
  LOOP
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', public.payment_method_account_code(v_pay.method),
      'debit', v_pay.amt,
      'credit', 0,
      'description', 'Sale ' || v_sale.invoice_no || ' — ' || v_pay.method
    ));
  END LOOP;

  IF v_sale.due > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', '1100',
      'debit', v_sale.due,
      'credit', 0,
      'description', 'Sale ' || v_sale.invoice_no || ' — on account'
    ));
  END IF;

  IF COALESCE(v_sale.discount,0) > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', '4090',
      'debit', v_sale.discount,
      'credit', 0,
      'description', 'Discount allowed on ' || v_sale.invoice_no
    ));
  END IF;

  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_code', '4000',
    'debit', 0,
    'credit', v_sale.subtotal,
    'description', 'Sales revenue ' || v_sale.invoice_no
  ));

  IF COALESCE(v_sale.vat,0) > 0 THEN
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_code', '2100',
      'debit', 0,
      'credit', v_sale.vat,
      'description', 'Output VAT ' || v_sale.invoice_no
    ));
  END IF;

  v_jno := public.generate_journal_no(_tenant_id);
  v_je := public.post_journal_with_branch(
    _tenant_id, v_jno, v_sale.sale_date::date,
    'Sale ' || v_sale.invoice_no,
    'sales'::text, _sale_id, v_sale.invoice_no,
    v_lines, v_branch
  );

  SELECT COALESCE(SUM(COALESCE(unit_cost,0) * qty),0) INTO v_cogs
    FROM public.sale_items
   WHERE sale_id = _sale_id;

  IF v_cogs > 0 THEN
    v_jno := public.generate_journal_no(_tenant_id);
    v_cogs_je := public.post_journal_with_branch(
      _tenant_id, v_jno, v_sale.sale_date::date,
      'COGS for ' || v_sale.invoice_no,
      'sales'::text, _sale_id, v_sale.invoice_no,
      jsonb_build_array(
        jsonb_build_object('account_code','5000','debit',v_cogs,'credit',0,'description','COGS ' || v_sale.invoice_no),
        jsonb_build_object('account_code','1200','debit',0,'credit',v_cogs,'description','Inventory out ' || v_sale.invoice_no)
      ),
      v_branch
    );
  ELSE
    PERFORM public.audit_log_event(_tenant_id, 'journal.cogs_skipped', 'sales', _sale_id, NULL,
      jsonb_build_object('sale_id', _sale_id, 'reason','missing_cost'));
  END IF;

  PERFORM public.audit_log_event(_tenant_id, 'journal.sale', 'journal_entries', v_je.id, NULL,
    jsonb_build_object(
      'sale_id', _sale_id,
      'invoice_no', v_sale.invoice_no,
      'total', v_sale.total,
      'cogs', v_cogs,
      'branch_id', v_branch
    ));

  RETURN v_je.id;
END
$function$;