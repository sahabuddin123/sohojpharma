CREATE OR REPLACE FUNCTION public.post_inventory_adjustment_journal(_tenant_id uuid, _movement_id uuid, _branch_id uuid, _movement_type text, _qty_change numeric, _value numeric, _ref_table text, _ref_id uuid, _ref_no text, _memo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset_code    text := '1300';
  v_contra_code   text;
  v_kind          text;
  v_asset_acct    uuid;
  v_contra_acct   uuid;
  v_dr_code       text;
  v_cr_code       text;
  v_lines         jsonb;
  v_entry_no      text;
  v_branch        uuid := _branch_id;
  v_entry         public.journal_entries;
BEGIN
  IF _value IS NULL OR _value <= 0 THEN RETURN NULL; END IF;

  v_kind := CASE _movement_type
    WHEN 'damage'        THEN 'damage_expense'
    WHEN 'expiry'        THEN 'expiry_loss'
    WHEN 'adjustment'    THEN 'adjustment_expense'
    WHEN 'transfer_in'   THEN 'transfer_clearing'
    WHEN 'transfer_out'  THEN 'transfer_clearing'
    ELSE NULL
  END;
  IF v_kind IS NULL THEN RETURN NULL; END IF;

  v_contra_code := CASE v_kind
    WHEN 'damage_expense'     THEN '5510'
    WHEN 'expiry_loss'        THEN '5520'
    WHEN 'adjustment_expense' THEN '5530'
    WHEN 'transfer_clearing'  THEN '1305'
    ELSE NULL
  END;

  v_asset_acct  := public.resolve_inventory_account(_tenant_id, 'inventory_asset');
  v_contra_acct := public.resolve_inventory_account(_tenant_id, v_kind);

  IF v_asset_acct IS NULL OR v_contra_acct IS NULL OR v_contra_code IS NULL THEN
    RAISE WARNING 'inventory journal skipped: tenant % missing account (asset=%, contra=% kind=% code=%)',
      _tenant_id, v_asset_acct, v_contra_acct, v_kind, v_contra_code;
    RETURN NULL;
  END IF;

  IF v_branch IS NULL THEN
    SELECT branch_id INTO v_branch FROM public.batches
     WHERE id = (SELECT batch_id FROM public.stock_movements WHERE id = _movement_id);
  END IF;
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM public.branches WHERE tenant_id = _tenant_id LIMIT 1;
  END IF;
  IF v_branch IS NULL THEN
    RAISE WARNING 'inventory journal skipped: no branch resolvable for tenant %', _tenant_id;
    RETURN NULL;
  END IF;

  IF _qty_change < 0 THEN
    v_dr_code := v_contra_code; v_cr_code := v_asset_code;
  ELSE
    v_dr_code := v_asset_code;  v_cr_code := v_contra_code;
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_dr_code, 'debit',  _value, 'credit', 0,      'description', _memo),
    jsonb_build_object('account_code', v_cr_code, 'debit',  0,      'credit', _value, 'description', _memo)
  );

  v_entry_no := 'INV-ADJ-' || to_char(now(),'YYYYMMDDHH24MISS') || '-' || substr(_movement_id::text,1,4);

  v_entry := public.post_journal_with_branch(
    _tenant_id, v_entry_no, CURRENT_DATE, _memo,
    _ref_table, _ref_id, _ref_no, v_lines, v_branch
  );

  RETURN v_entry.id;
END $function$;