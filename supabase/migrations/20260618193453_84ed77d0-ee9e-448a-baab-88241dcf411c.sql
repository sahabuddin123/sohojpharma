CREATE OR REPLACE FUNCTION public.journal_assert_balanced()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_d numeric;
  v_c numeric;
BEGIN
  SELECT COALESCE(sum(debit),0), COALESCE(sum(credit),0)
    INTO v_d, v_c
    FROM public.journal_lines
   WHERE journal_id = NEW.id;

  IF round(v_d,4) <> round(v_c,4) THEN
    RAISE EXCEPTION 'journal % is unbalanced: debit=% credit=%', NEW.entry_no, v_d, v_c
      USING ERRCODE='22023';
  END IF;

  IF round(COALESCE(NEW.total_debit,0),4) <> round(v_d,4)
     OR round(COALESCE(NEW.total_credit,0),4) <> round(v_c,4) THEN
    RAISE EXCEPTION 'journal % header totals do not match lines: header debit=% credit=% line debit=% credit=%',
      NEW.entry_no, NEW.total_debit, NEW.total_credit, v_d, v_c
      USING ERRCODE='22023';
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.post_journal(_tenant_id uuid, _entry_no text, _entry_date date, _notes text, _ref_table text, _ref_id uuid, _ref_no text, _lines jsonb)
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
    total_debit, total_credit, posted_by
  ) VALUES (
    _tenant_id, _entry_no, COALESCE(_entry_date, CURRENT_DATE), _notes,
    _ref_table, _ref_id, _ref_no, v_total_debit, v_total_credit, auth.uid()
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

CREATE OR REPLACE FUNCTION public.reverse_journal(_journal_id uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_orig public.journal_entries;
  v_rev public.journal_entries;
  v_jno text;
  v_line record;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
BEGIN
  SELECT * INTO v_orig
    FROM public.journal_entries
   WHERE id = _journal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'journal not found' USING ERRCODE='23503';
  END IF;

  IF NOT public.is_tenant_member(auth.uid(), v_orig.tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE reversed_journal_id = _journal_id) THEN
    RAISE EXCEPTION 'journal % already reversed', v_orig.entry_no USING ERRCODE='23505';
  END IF;

  SELECT COALESCE(sum(credit),0), COALESCE(sum(debit),0)
    INTO v_total_debit, v_total_credit
    FROM public.journal_lines
   WHERE journal_id = _journal_id;

  IF round(v_total_debit,4) <> round(v_total_credit,4) THEN
    RAISE EXCEPTION 'cannot reverse unbalanced journal %: reversal debit=% credit=%', v_orig.entry_no, v_total_debit, v_total_credit
      USING ERRCODE='22023';
  END IF;

  v_jno := public.generate_journal_no(v_orig.tenant_id);

  INSERT INTO public.journal_entries(
    tenant_id, entry_no, entry_date, notes, ref_table, ref_id, ref_no,
    total_debit, total_credit, posted_by, branch_id, posted,
    is_reversal, reversed_journal_id, reversal_reason
  ) VALUES (
    v_orig.tenant_id, v_jno, CURRENT_DATE,
    'Reversal of ' || v_orig.entry_no || COALESCE(' — ' || _reason, ''),
    v_orig.ref_table, v_orig.ref_id, v_orig.ref_no,
    v_total_debit, v_total_credit, auth.uid(), v_orig.branch_id, true,
    true, _journal_id, _reason
  ) RETURNING * INTO v_rev;

  FOR v_line IN SELECT * FROM public.journal_lines WHERE journal_id = _journal_id LOOP
    INSERT INTO public.journal_lines(tenant_id, journal_id, account_id, debit, credit, description)
    VALUES (
      v_orig.tenant_id, v_rev.id, v_line.account_id, v_line.credit, v_line.debit,
      'REV: ' || COALESCE(v_line.description, '')
    );
  END LOOP;

  PERFORM public.audit_log_event(v_orig.tenant_id, 'journal.reversal', 'journal_entries', v_rev.id, NULL,
    jsonb_build_object('original_journal_id', _journal_id, 'reason', _reason));

  RETURN v_rev.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.edit_sale_invoice(_tenant_id uuid, _original_sale_id uuid, _customer_id uuid, _cashier_id uuid, _discount numeric DEFAULT 0, _notes text DEFAULT NULL::text, _client_op_id uuid DEFAULT NULL::uuid, _items jsonb DEFAULT '[]'::jsonb, _payments jsonb DEFAULT '[]'::jsonb, _register_id uuid DEFAULT NULL::uuid)
RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_orig public.sales;
  v_new public.sales;
  v_existing public.sales;
  v_item record;
  v_qty numeric;
  v_batch_id uuid;
  v_items_out jsonb := '[]'::jsonb;
  v_in jsonb;
  v_pid uuid;
  v_override_products uuid[] := ARRAY[]::uuid[];
  v_merged jsonb;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF _client_op_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.sales
     WHERE tenant_id = _tenant_id
       AND client_op_id = _client_op_id
     LIMIT 1;

    IF FOUND THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_orig
    FROM public.sales
   WHERE id = _original_sale_id
     AND tenant_id = _tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'original invoice not found' USING ERRCODE='23503';
  END IF;

  IF v_orig.status IN ('void','returned','partially_returned') THEN
    RAISE EXCEPTION 'invoice cannot be edited (status: %)', v_orig.status USING ERRCODE='22023';
  END IF;

  IF COALESCE(v_orig.is_return, false) THEN
    RAISE EXCEPTION 'return invoices cannot be edited' USING ERRCODE='22023';
  END IF;

  PERFORM public.cancel_sale_journals(_tenant_id, _original_sale_id, 'Invoice edited');

  SELECT COALESCE(array_agg(DISTINCT product_id), ARRAY[]::uuid[])
    INTO v_override_products
    FROM public.sale_items
   WHERE sale_id = _original_sale_id
     AND tenant_id = _tenant_id
     AND batch_id IS NULL;

  FOR v_item IN
    SELECT id, product_id, batch_id, qty, returned_qty
      FROM public.sale_items
     WHERE sale_id = _original_sale_id
       AND tenant_id = _tenant_id
  LOOP
    v_qty := GREATEST(v_item.qty - COALESCE(v_item.returned_qty, 0), 0);

    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    IF v_item.batch_id IS NULL THEN
      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, movement_type, qty_change,
        qty_after, reference_table, reference_id, reference_no, user_id, notes
      ) VALUES (
        _tenant_id, v_item.product_id, NULL, 'adjustment', v_qty,
        0, 'sales', _original_sale_id, v_orig.invoice_no, auth.uid(),
        'Invoice edited — override line reversed (no batch)'
      );
      CONTINUE;
    END IF;

    v_batch_id := v_item.batch_id;

    UPDATE public.batches
       SET qty_on_hand = qty_on_hand + v_qty
     WHERE id = v_batch_id;

    INSERT INTO public.stock_movements(
      tenant_id, product_id, batch_id, movement_type, qty_change,
      qty_after, reference_table, reference_id, reference_no, user_id, notes
    ) SELECT
      _tenant_id, v_item.product_id, v_batch_id, 'adjustment', v_qty,
      qty_on_hand, 'sales', _original_sale_id, v_orig.invoice_no, auth.uid(),
      'Invoice edited — stock reversed before replacement'
    FROM public.batches
    WHERE id = v_batch_id;
  END LOOP;

  DELETE FROM public.cash_register_transactions
   WHERE tenant_id = _tenant_id
     AND reference_table = 'sales'
     AND reference_id = _original_sale_id;

  UPDATE public.sales
     SET status = 'void',
         cancellation_reason = 'Replaced by invoice edit',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         due = 0
   WHERE id = _original_sale_id;

  IF v_orig.customer_id IS NOT NULL AND v_orig.due > 0 THEN
    BEGIN
      PERFORM public.post_ledger_entry(
        _tenant_id, 'customer'::public.party_type, v_orig.customer_id,
        'adjustment'::public.ledger_entry_type,
        0, v_orig.due, 'sales', _original_sale_id, v_orig.invoice_no,
        'Invoice edited — original due reversed'
      );
    EXCEPTION WHEN undefined_function THEN
      NULL;
    END;
  END IF;

  FOR v_in IN SELECT * FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb)) LOOP
    v_pid := (v_in->>'product_id')::uuid;

    IF v_pid = ANY(v_override_products) THEN
      v_merged := v_in || jsonb_build_object('allow_stock_override', true);
    ELSE
      v_merged := v_in;
    END IF;

    v_items_out := v_items_out || jsonb_build_array(v_merged);
  END LOOP;

  SELECT * INTO v_new
    FROM public.pos_checkout(
      _tenant_id, _customer_id, _cashier_id, NULL::text, _discount, _notes,
      _client_op_id, v_items_out, _payments, _register_id
    );

  UPDATE public.sales
     SET notes = trim(both E'\n' from COALESCE(notes,'') || E'\n[Replaces ' || v_orig.invoice_no || ']')
   WHERE id = v_new.id;

  UPDATE public.sales
     SET cancellation_reason = 'Replaced by invoice edit → ' || v_new.invoice_no
   WHERE id = _original_sale_id;

  INSERT INTO public.audit_log(
    tenant_id, user_id, action, entity_table, entity_id, before_data, after_data
  ) VALUES (
    _tenant_id, auth.uid(), 'invoice.edited', 'sales', v_new.id,
    jsonb_build_object(
      'original_id', _original_sale_id,
      'original_no', v_orig.invoice_no,
      'original_total', v_orig.total,
      'original_paid', v_orig.paid,
      'original_due', v_orig.due,
      'override_products', to_jsonb(v_override_products)
    ),
    jsonb_build_object(
      'new_id', v_new.id,
      'new_no', v_new.invoice_no,
      'new_total', v_new.total,
      'new_paid', v_new.paid,
      'new_due', v_new.due
    )
  );

  RETURN v_new;
END;
$function$;