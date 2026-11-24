-- Fix stock adjustment failure: post_inventory_adjustment_journal was sending
-- journal line payloads with account_id, while post_journal_with_branch resolves
-- lines by account_code. That produced: unknown account code: <NULL>.

-- Ensure every tenant has the inventory accounting accounts used by stock
-- adjustments/transfers. This is idempotent and preserves existing accounts.
INSERT INTO public.chart_of_accounts(tenant_id, code, name, type, is_system, is_active)
SELECT t.id, v.code, v.name, v.type::public.account_type, true, true
FROM public.tenants t
CROSS JOIN (VALUES
  ('1300', 'Inventory Asset',           'asset'),
  ('5510', 'Damage Expense',            'expense'),
  ('5520', 'Expiry Loss',               'expense'),
  ('5530', 'Inventory Adjustment',      'expense'),
  ('1305', 'Inter-Branch Clearing',     'asset')
) AS v(code, name, type)
ON CONFLICT (tenant_id, code) DO UPDATE
SET name = EXCLUDED.name,
    type = EXCLUDED.type,
    is_system = true,
    is_active = true;

CREATE OR REPLACE FUNCTION public.post_inventory_adjustment_journal(
  _tenant_id   uuid,
  _movement_id uuid,
  _branch_id   uuid,
  _movement_type text,
  _qty_change  numeric,
  _value       numeric,
  _ref_table   text,
  _ref_id      uuid,
  _ref_no      text,
  _memo        text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
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
BEGIN
  IF _value IS NULL OR _value <= 0 THEN RETURN NULL; END IF;

  -- Map movement_type → contra account kind/code.
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

  -- Resolve branch fallback so post_journal_with_branch succeeds.
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

  -- Direction:
  --   qty_change < 0 (stock leaves)  → DR contra (expense/clearing), CR asset
  --   qty_change > 0 (stock arrives) → DR asset, CR contra
  IF _qty_change < 0 THEN
    v_dr_code := v_contra_code; v_cr_code := v_asset_code;
  ELSE
    v_dr_code := v_asset_code;  v_cr_code := v_contra_code;
  END IF;

  -- post_journal_with_branch resolves accounts by account_code, not account_id.
  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', v_dr_code, 'debit',  _value, 'credit', 0,      'description', _memo),
    jsonb_build_object('account_code', v_cr_code, 'debit',  0,      'credit', _value, 'description', _memo)
  );

  v_entry_no := 'INV-ADJ-' || to_char(now(),'YYYYMMDDHH24MISS') || '-' || substr(_movement_id::text,1,4);

  RETURN public.post_journal_with_branch(
    _tenant_id, v_entry_no, CURRENT_DATE, _memo,
    _ref_table, _ref_id, _ref_no, v_lines, v_branch
  );
END $$;

-- Keep future tenant chart seeding aligned with inventory posting.
CREATE OR REPLACE FUNCTION public.seed_default_chart(_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.chart_of_accounts(tenant_id, code, name, type, is_system, is_active) VALUES
    (_tenant_id,'1000','Cash on Hand','asset',true,true),
    (_tenant_id,'1010','Bank Account','asset',true,true),
    (_tenant_id,'1020','bKash','asset',true,true),
    (_tenant_id,'1030','Nagad','asset',true,true),
    (_tenant_id,'1040','Rocket Wallet','asset',true,true),
    (_tenant_id,'1050','Card Clearing Account','asset',true,true),
    (_tenant_id,'1100','Accounts Receivable','asset',true,true),
    (_tenant_id,'1200','Inventory','asset',true,true),
    (_tenant_id,'1300','Inventory Asset','asset',true,true),
    (_tenant_id,'1305','Inter-Branch Clearing','asset',true,true),
    (_tenant_id,'2000','Accounts Payable','liability',true,true),
    (_tenant_id,'2100','Output VAT Payable','liability',true,true),
    (_tenant_id,'2200','Input VAT Receivable','asset',true,true),
    (_tenant_id,'3000','Owner Equity','equity',true,true),
    (_tenant_id,'3100','Opening Stock Equity','equity',true,true),
    (_tenant_id,'4000','Sales Revenue','income',true,true),
    (_tenant_id,'4050','Sales Return','income',true,true),
    (_tenant_id,'4090','Discount Allowed','income',true,true),
    (_tenant_id,'4100','Other Income','income',true,true),
    (_tenant_id,'5000','Cost of Goods Sold','cogs',true,true),
    (_tenant_id,'5090','Discount Received','cogs',true,true),
    (_tenant_id,'5510','Damage Expense','expense',true,true),
    (_tenant_id,'5520','Expiry Loss','expense',true,true),
    (_tenant_id,'5530','Inventory Adjustment','expense',true,true),
    (_tenant_id,'6000','Salary Expense','expense',true,true),
    (_tenant_id,'6100','Rent Expense','expense',true,true),
    (_tenant_id,'6200','Utilities Expense','expense',true,true),
    (_tenant_id,'6300','Marketing Expense','expense',true,true),
    (_tenant_id,'6900','Miscellaneous Expense','expense',true,true)
  ON CONFLICT (tenant_id, code) DO UPDATE
  SET name = EXCLUDED.name,
      type = EXCLUDED.type,
      is_system = true,
      is_active = true;
END $function$;

REVOKE ALL ON FUNCTION public.seed_default_chart(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_default_chart(uuid) TO authenticated, service_role;