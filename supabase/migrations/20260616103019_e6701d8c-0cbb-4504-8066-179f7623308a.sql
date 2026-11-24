
-- ============================================================
-- 1) Branch limit trigger (matches enforce_product_limit pattern)
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_branch_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_plan_code text; v_max int; v_count int;
BEGIN
  SELECT t.plan::text INTO v_plan_code FROM public.tenants t WHERE t.id = NEW.tenant_id;
  SELECT max_branches INTO v_max FROM public.plans WHERE code = v_plan_code;
  IF v_max IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_count FROM public.branches WHERE tenant_id = NEW.tenant_id;
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'plan_limit_exceeded: plan % allows max % branches (current=%)', v_plan_code, v_max, v_count
      USING ERRCODE='P0001', HINT='Upgrade your subscription plan to add more branches';
  END IF;
  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.enforce_branch_limit() FROM public, anon;

DROP TRIGGER IF EXISTS branches_enforce_limit ON public.branches;
CREATE TRIGGER branches_enforce_limit
  BEFORE INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_limit();

-- ============================================================
-- 2) Read-only-mode RESTRICTIVE RLS on write tables
-- ============================================================
-- Helper macro via DO block to apply the same 3 policies to many tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'sales','sale_items','sale_payments',
    'purchases','purchase_items',
    'purchase_orders','purchase_order_items',
    'goods_receipts','goods_receipt_items',
    'products','batches',
    'tenant_members','branches'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "subscription_active_insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "subscription_active_update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "subscription_active_delete" ON public.%I', t);

    EXECUTE format($f$
      CREATE POLICY "subscription_active_insert"
        ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (public.is_subscription_active(tenant_id))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "subscription_active_update"
        ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated
        USING (public.is_subscription_active(tenant_id))
        WITH CHECK (public.is_subscription_active(tenant_id))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "subscription_active_delete"
        ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated
        USING (public.is_subscription_active(tenant_id))
    $f$, t);
  END LOOP;
END $$;
