
-- =============================================================
-- BLOCKER #4 — BRANCH ISOLATION
-- =============================================================

-- Backfill batches.branch_id from warehouse
UPDATE public.batches b
   SET branch_id = w.branch_id
  FROM public.warehouses w
 WHERE b.warehouse_id = w.id
   AND b.branch_id IS NULL
   AND w.branch_id IS NOT NULL;

-- Backfill stock_movements.warehouse_id (best-effort from batch then sale)
UPDATE public.stock_movements sm
   SET warehouse_id = b.warehouse_id
  FROM public.batches b
 WHERE sm.warehouse_id IS NULL
   AND sm.batch_id = b.id
   AND b.warehouse_id IS NOT NULL;

UPDATE public.stock_movements sm
   SET warehouse_id = s.warehouse_id
  FROM public.sales s
 WHERE sm.warehouse_id IS NULL
   AND sm.reference_table = 'sales'
   AND sm.reference_id = s.id
   AND s.warehouse_id IS NOT NULL;

-- Lock branch_id on batches
ALTER TABLE public.batches ALTER COLUMN branch_id SET NOT NULL;

-- Remove the permissive RLS policy that bypassed branch scoping
DROP POLICY IF EXISTS batch_tenant_all ON public.batches;

-- =============================================================
-- BLOCKER #3 — REPLACE STALE INVENTORY TABLE WITH LIVE VIEW
-- =============================================================
DROP TABLE IF EXISTS public.inventory;

CREATE VIEW public.inventory AS
SELECT
  b.tenant_id,
  b.branch_id,
  b.warehouse_id,
  b.product_id,
  COALESCE(SUM(b.qty_on_hand), 0)::numeric                       AS qty_on_hand,
  0::numeric                                                     AS qty_reserved,
  COALESCE(SUM(b.qty_on_hand * b.purchase_price), 0)::numeric    AS stock_value,
  MIN(b.expiry_date)                                             AS earliest_expiry,
  COUNT(*) FILTER (WHERE b.qty_on_hand > 0)::int                 AS batch_count
FROM public.batches b
WHERE b.deleted_at IS NULL
GROUP BY b.tenant_id, b.branch_id, b.warehouse_id, b.product_id;

GRANT SELECT ON public.inventory TO authenticated, service_role;

-- =============================================================
-- BLOCKER #1 — SALE CANCEL RPC
-- =============================================================
CREATE OR REPLACE FUNCTION public.sale_cancel_rpc(
  _tenant_id uuid,
  _sale_id   uuid,
  _reason    text DEFAULT NULL
)
RETURNS public.sales
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_sale  public.sales;
  v_si    record;
  v_after numeric;
BEGIN
  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_sale FROM public.sales
   WHERE id = _sale_id AND tenant_id = _tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sale not found' USING ERRCODE = '23503';
  END IF;

  -- Idempotency: already void
  IF v_sale.status = 'void' THEN
    RETURN v_sale;
  END IF;

  IF v_sale.status IN ('returned', 'partially_returned') THEN
    RAISE EXCEPTION 'cannot cancel a sale that has returns; reverse returns first'
      USING ERRCODE = '22023';
  END IF;

  -- Restore stock per sale_items row + write reversal movement
  FOR v_si IN
    SELECT id, product_id, batch_id, qty, warehouse_id
      FROM public.sale_items
     WHERE sale_id = _sale_id AND tenant_id = _tenant_id
     ORDER BY id
  LOOP
    IF v_si.batch_id IS NOT NULL AND v_si.qty > 0 THEN
      UPDATE public.batches
         SET qty_on_hand = qty_on_hand + v_si.qty
       WHERE id = v_si.batch_id AND tenant_id = _tenant_id
       RETURNING qty_on_hand INTO v_after;

      INSERT INTO public.stock_movements(
        tenant_id, product_id, batch_id, warehouse_id, movement_type,
        qty_change, qty_after, reference_table, reference_id, reference_no,
        user_id, notes
      ) VALUES (
        _tenant_id, v_si.product_id, v_si.batch_id, v_si.warehouse_id,
        'sales_return', v_si.qty, v_after,
        'sales', v_sale.id, v_sale.invoice_no, auth.uid(),
        'sale_cancel: ' || COALESCE(_reason, 'cancelled')
      );
    END IF;
  END LOOP;

  -- Reverse GL journals via existing helper
  PERFORM public.cancel_sale_journals(_tenant_id, _sale_id, COALESCE(_reason, 'cancelled'));

  UPDATE public.sales
     SET status = 'void',
         notes  = COALESCE(notes, '') || E'\n[CANCELLED] ' || COALESCE(_reason, '')
   WHERE id = _sale_id
   RETURNING * INTO v_sale;

  PERFORM public.audit_log_event(
    _tenant_id, 'sale.cancelled', 'sales', _sale_id, NULL,
    jsonb_build_object('invoice_no', v_sale.invoice_no, 'reason', _reason)
  );

  RETURN v_sale;
END $$;

-- =============================================================
-- BLOCKER #2 — INVENTORY ACCOUNTING CONSISTENCY
-- =============================================================

-- 2a. Seed the five inventory accounts into every existing tenant.
DO $$
DECLARE
  t record;
  v record;
BEGIN
  FOR t IN SELECT id FROM public.tenants LOOP
    FOR v IN
      SELECT * FROM (VALUES
        ('1300', 'Inventory Asset',           'asset'::text),
        ('5510', 'Damage Expense',            'expense'::text),
        ('5520', 'Expiry Loss',               'expense'::text),
        ('5530', 'Inventory Adjustment',      'expense'::text),
        ('1305', 'Inter-Branch Clearing',     'asset'::text)
      ) AS s(code, name, type)
    LOOP
      INSERT INTO public.chart_of_accounts (tenant_id, code, name, type, is_system, is_active)
      SELECT t.id, v.code, v.name, v.type::public.account_type, true, true
       WHERE NOT EXISTS (
         SELECT 1 FROM public.chart_of_accounts
          WHERE tenant_id = t.id AND code = v.code
       );
    END LOOP;
  END LOOP;
END $$;

-- 2b. Account resolver
CREATE OR REPLACE FUNCTION public.resolve_inventory_account(_tenant uuid, _kind text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT id FROM public.chart_of_accounts
   WHERE tenant_id = _tenant AND is_active = true
     AND code = CASE _kind
       WHEN 'inventory_asset'     THEN '1300'
       WHEN 'damage_expense'      THEN '5510'
       WHEN 'expiry_loss'         THEN '5520'
       WHEN 'adjustment_expense'  THEN '5530'
       WHEN 'transfer_clearing'   THEN '1305'
     END
   LIMIT 1;
$$;

-- 2c. Posting helper
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
  v_asset_acct    uuid;
  v_contra_acct   uuid;
  v_kind          text;
  v_dr_acct       uuid;
  v_cr_acct       uuid;
  v_lines         jsonb;
  v_entry_no      text;
  v_branch        uuid := _branch_id;
BEGIN
  IF _value IS NULL OR _value <= 0 THEN RETURN NULL; END IF;

  -- Map movement_type → contra account kind
  v_kind := CASE _movement_type
    WHEN 'damage'        THEN 'damage_expense'
    WHEN 'expiry'        THEN 'expiry_loss'
    WHEN 'adjustment'    THEN 'adjustment_expense'
    WHEN 'transfer_in'   THEN 'transfer_clearing'
    WHEN 'transfer_out'  THEN 'transfer_clearing'
    ELSE NULL
  END;
  IF v_kind IS NULL THEN RETURN NULL; END IF;

  v_asset_acct  := public.resolve_inventory_account(_tenant_id, 'inventory_asset');
  v_contra_acct := public.resolve_inventory_account(_tenant_id, v_kind);

  IF v_asset_acct IS NULL OR v_contra_acct IS NULL THEN
    RAISE WARNING 'inventory journal skipped: tenant % missing account (asset=%, contra=% kind=%)',
      _tenant_id, v_asset_acct, v_contra_acct, v_kind;
    RETURN NULL;
  END IF;

  -- Resolve branch fallback so post_journal_with_branch (NOT NULL) succeeds
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
    v_dr_acct := v_contra_acct; v_cr_acct := v_asset_acct;
  ELSE
    v_dr_acct := v_asset_acct;  v_cr_acct := v_contra_acct;
  END IF;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_dr_acct, 'debit',  _value, 'credit', 0, 'description', _memo),
    jsonb_build_object('account_id', v_cr_acct, 'debit',  0,      'credit', _value, 'description', _memo)
  );

  v_entry_no := 'INV-ADJ-' || to_char(now(),'YYYYMMDDHH24MISS') || '-' || substr(_movement_id::text,1,4);

  RETURN public.post_journal_with_branch(
    _tenant_id, v_entry_no, CURRENT_DATE, _memo,
    _ref_table, _ref_id, _ref_no, v_lines, v_branch
  );
END $$;

-- 2d. Trigger: post journal after every adjustment / damage / expiry / transfer stock movement
CREATE OR REPLACE FUNCTION public.tg_stock_movement_post_journal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_cost   numeric;
  v_value  numeric;
  v_branch uuid;
BEGIN
  IF NEW.movement_type NOT IN ('damage','expiry','adjustment','transfer_in','transfer_out') THEN
    RETURN NEW;
  END IF;

  -- Derive unit cost from the batch (or product fallback)
  IF NEW.batch_id IS NOT NULL THEN
    SELECT purchase_price, branch_id INTO v_cost, v_branch
      FROM public.batches WHERE id = NEW.batch_id;
  END IF;
  IF v_cost IS NULL OR v_cost = 0 THEN
    SELECT purchase_price INTO v_cost
      FROM public.products WHERE id = NEW.product_id;
  END IF;

  v_value := ROUND(ABS(NEW.qty_change) * COALESCE(v_cost, 0), 2);
  IF v_value <= 0 THEN RETURN NEW; END IF;

  PERFORM public.post_inventory_adjustment_journal(
    NEW.tenant_id, NEW.id, v_branch,
    NEW.movement_type::text, NEW.qty_change, v_value,
    NEW.reference_table, NEW.reference_id, NEW.reference_no,
    COALESCE(NEW.notes,'') || ' [' || NEW.movement_type || ']'
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stock_movement_post_journal ON public.stock_movements;
CREATE TRIGGER trg_stock_movement_post_journal
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.tg_stock_movement_post_journal();
