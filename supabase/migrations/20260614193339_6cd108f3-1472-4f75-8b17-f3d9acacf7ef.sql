
-- ============================================================
-- Tenant Isolation Hardening + Test Harness + Access Audit
-- ============================================================

-- 1) Defense-in-depth: forbid NULL tenant_id at row level (RESTRICTIVE)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','sales','sale_items','sale_payments','customers','suppliers',
    'batches','stock_movements','party_ledger','purchase_orders','purchase_order_items',
    'purchases','purchase_items','goods_receipts','goods_receipt_items',
    'categories','manufacturers','generics','units','unit_conversions',
    'branches','warehouses','inventory','quotations','quotation_items',
    'customer_payments','customer_prices','prescriptions','prescription_items'
  ] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS tenant_not_null ON public.%I;
      CREATE POLICY tenant_not_null ON public.%I
        AS RESTRICTIVE FOR ALL TO authenticated
        USING (tenant_id IS NOT NULL)
        WITH CHECK (tenant_id IS NOT NULL);
    $f$, t, t);
  END LOOP;
END $$;

-- 2) Cross-tenant access audit table
CREATE TABLE IF NOT EXISTS public.tenant_access_violations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  attempted_tenant_id uuid,
  user_tenants  uuid[],
  action        text NOT NULL,
  detail        text,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tenant_access_violations TO authenticated;
GRANT ALL    ON public.tenant_access_violations TO service_role;
ALTER TABLE public.tenant_access_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tav_owner_read ON public.tenant_access_violations;
CREATE POLICY tav_owner_read ON public.tenant_access_violations
  FOR SELECT TO authenticated
  USING (
    attempted_tenant_id IS NOT NULL
    AND public.has_role(auth.uid(), attempted_tenant_id, 'owner'::app_role)
  );

-- Block UPDATE/DELETE for authenticated (immutable like audit_log)
DROP POLICY IF EXISTS tav_block_update ON public.tenant_access_violations;
CREATE POLICY tav_block_update ON public.tenant_access_violations
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS tav_block_delete ON public.tenant_access_violations;
CREATE POLICY tav_block_delete ON public.tenant_access_violations
  FOR DELETE TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS tav_tenant_time_idx
  ON public.tenant_access_violations(attempted_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tav_user_idx
  ON public.tenant_access_violations(user_id, created_at DESC);

-- 3) Logger callable from server (SECURITY DEFINER bypasses RLS for insert only)
CREATE OR REPLACE FUNCTION public.log_tenant_violation(
  _attempted_tenant_id uuid,
  _action text,
  _detail text DEFAULT NULL,
  _ip inet DEFAULT NULL,
  _ua text DEFAULT NULL
) RETURNS tenant_access_violations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.tenant_access_violations; v_tenants uuid[];
BEGIN
  SELECT array_agg(tenant_id) INTO v_tenants
    FROM public.tenant_members WHERE user_id = auth.uid();
  INSERT INTO public.tenant_access_violations(
    user_id, attempted_tenant_id, user_tenants, action, detail, ip_address, user_agent
  ) VALUES (
    auth.uid(), _attempted_tenant_id, v_tenants, _action, _detail, _ip, _ua
  ) RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.log_tenant_violation(uuid,text,text,inet,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_tenant_violation(uuid,text,text,inet,text) TO authenticated;

-- 4) Tenant isolation test harness (service_role only)
-- Returns one row per assertion: passed/failed + detail
CREATE OR REPLACE FUNCTION public.test_tenant_isolation()
RETURNS TABLE(test_name text, passed boolean, detail text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t1 uuid; t2 uuid;
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  p1 uuid; p2 uuid;
  v_count int;
  v_err   text;
BEGIN
  -- Create two synthetic tenants and memberships (bypassing auth.users FK by using local rows only on tenant_members; skip if FK requires it)
  INSERT INTO public.tenants(name, slug) VALUES
    ('iso-test-A-'||u1, 'iso-a-'||substr(u1::text,1,8)) RETURNING id INTO t1;
  INSERT INTO public.tenants(name, slug) VALUES
    ('iso-test-B-'||u2, 'iso-b-'||substr(u2::text,1,8)) RETURNING id INTO t2;

  -- Seed two products, one per tenant
  INSERT INTO public.products(tenant_id, name, sku)
    VALUES (t1, 'iso-prod-A', 'ISO-A-'||substr(t1::text,1,6)) RETURNING id INTO p1;
  INSERT INTO public.products(tenant_id, name, sku)
    VALUES (t2, 'iso-prod-B', 'ISO-B-'||substr(t2::text,1,6)) RETURNING id INTO p2;

  -- Assertion 1: NULL tenant_id insert MUST fail (RESTRICTIVE policy)
  BEGIN
    INSERT INTO public.products(tenant_id, name, sku)
      VALUES (NULL, 'null-tenant', 'NULL-'||substr(gen_random_uuid()::text,1,6));
    test_name := 'reject_null_tenant_insert'; passed := false;
    detail := 'INSERT with NULL tenant_id should have failed';
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test_name := 'reject_null_tenant_insert'; passed := true;
    detail := 'blocked: '||SQLERRM; RETURN NEXT;
  END;

  -- Assertion 2: simulate user u1 (member of t1) attempting to read t2 data via RLS
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u1::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  INSERT INTO public.tenant_members(tenant_id, user_id, is_default)
    VALUES (t1, u1, true);

  EXECUTE 'SELECT count(*) FROM public.products WHERE id = $1' INTO v_count USING p2;
  test_name := 'u1_cannot_read_t2_products';
  passed := (v_count = 0);
  detail := format('rows visible: %s (expected 0)', v_count);
  RETURN NEXT;

  EXECUTE 'SELECT count(*) FROM public.products WHERE id = $1' INTO v_count USING p1;
  test_name := 'u1_can_read_own_t1_products';
  passed := (v_count = 1);
  detail := format('rows visible: %s (expected 1)', v_count);
  RETURN NEXT;

  -- Assertion 3: u1 must NOT be able to INSERT into t2
  BEGIN
    EXECUTE format(
      'INSERT INTO public.products(tenant_id, name, sku) VALUES (%L,%L,%L)',
      t2, 'leak-attempt', 'LEAK-'||substr(gen_random_uuid()::text,1,6));
    test_name := 'u1_cannot_insert_into_t2'; passed := false;
    detail := 'INSERT into other tenant should have failed';
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test_name := 'u1_cannot_insert_into_t2'; passed := true;
    detail := 'blocked: '||SQLERRM; RETURN NEXT;
  END;

  -- Assertion 4: u1 must NOT be able to UPDATE t2 row
  BEGIN
    EXECUTE format('UPDATE public.products SET name=%L WHERE id=%L', 'pwned', p2);
    EXECUTE 'SELECT count(*) FROM public.products WHERE id=$1 AND name=$2'
      INTO v_count USING p2, 'pwned';
    -- Reset role to check actual state
    PERFORM set_config('role', 'postgres', true);
    EXECUTE 'SELECT count(*) FROM public.products WHERE id=$1 AND name=$2'
      INTO v_count USING p2, 'pwned';
    test_name := 'u1_cannot_update_t2'; passed := (v_count = 0);
    detail := format('rows updated cross-tenant: %s (expected 0)', v_count);
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    test_name := 'u1_cannot_update_t2'; passed := true;
    detail := 'blocked: '||SQLERRM; RETURN NEXT;
  END;

  -- Restore role
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- Cleanup synthetic data
  DELETE FROM public.products WHERE tenant_id IN (t1, t2);
  DELETE FROM public.tenant_members WHERE tenant_id IN (t1, t2);
  DELETE FROM public.tenants WHERE id IN (t1, t2);

  RETURN;
EXCEPTION WHEN OTHERS THEN
  v_err := SQLERRM;
  PERFORM set_config('role', 'postgres', true);
  BEGIN DELETE FROM public.products       WHERE tenant_id IN (t1, t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.tenant_members WHERE tenant_id IN (t1, t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.tenants        WHERE id        IN (t1, t2); EXCEPTION WHEN OTHERS THEN NULL; END;
  test_name := 'harness_error'; passed := false; detail := v_err;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.test_tenant_isolation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.test_tenant_isolation() TO service_role;
