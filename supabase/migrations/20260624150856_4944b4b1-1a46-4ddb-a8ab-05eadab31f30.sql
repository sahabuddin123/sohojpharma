
-- 1. Status RPC
CREATE OR REPLACE FUNCTION public.get_store_setup_status(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_branches jsonb;
  v_warehouses jsonb;
  v_default_branch uuid;
  v_member_branch uuid;
  v_register_count int;
BEGIN
  IF NOT (
    public.is_tenant_member(auth.uid(), _tenant_id)
    OR public.is_app_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'code', code, 'address', address, 'phone', phone,
    'is_main', is_main
  ) ORDER BY is_main DESC, name), '[]'::jsonb)
    INTO v_branches
    FROM public.branches
   WHERE tenant_id = _tenant_id AND deleted_at IS NULL AND is_active = true;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'code', code, 'branch_id', branch_id, 'is_default', is_default
  ) ORDER BY is_default DESC, name), '[]'::jsonb)
    INTO v_warehouses
    FROM public.warehouses
   WHERE tenant_id = _tenant_id AND deleted_at IS NULL AND is_active = true;

  SELECT id INTO v_default_branch
    FROM public.branches
   WHERE tenant_id = _tenant_id AND deleted_at IS NULL AND is_main = true
   LIMIT 1;

  SELECT default_branch_id INTO v_member_branch
    FROM public.tenant_members
   WHERE tenant_id = _tenant_id AND user_id = auth.uid()
   LIMIT 1;

  SELECT count(*) INTO v_register_count
    FROM public.cash_registers
   WHERE tenant_id = _tenant_id;

  RETURN jsonb_build_object(
    'branches', v_branches,
    'warehouses', v_warehouses,
    'default_branch_id', v_default_branch,
    'member_default_branch_id', v_member_branch,
    'register_count', v_register_count,
    'complete', (
      jsonb_array_length(v_branches) > 0
      AND jsonb_array_length(v_warehouses) > 0
      AND v_member_branch IS NOT NULL
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_store_setup_status(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_store_setup_status(uuid) FROM anon, public;

-- 2. Setup RPC
CREATE OR REPLACE FUNCTION public.setup_store_basics(
  _tenant_id uuid,
  _branch_id uuid,            -- existing branch to use; if NULL a new one is created
  _branch_name text,
  _branch_address text,
  _branch_phone text,
  _warehouse_id uuid,         -- existing warehouse to mark as default; if NULL a new one is created
  _warehouse_name text,
  _create_register boolean,
  _register_name text,
  _register_opening numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_branch uuid := _branch_id;
  v_warehouse uuid := _warehouse_id;
  v_register uuid;
  v_role_id uuid;
  v_code text;
BEGIN
  IF NOT (
    public.is_tenant_member(v_uid, _tenant_id)
    OR public.is_app_admin(v_uid)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  -- BRANCH
  IF v_branch IS NULL THEN
    v_code := upper(left(regexp_replace(coalesce(_branch_name, 'MAIN'), '[^A-Za-z0-9]', '', 'g'), 6));
    IF v_code = '' THEN v_code := 'MAIN'; END IF;
    -- ensure unique-ish code per tenant
    IF EXISTS (SELECT 1 FROM public.branches WHERE tenant_id=_tenant_id AND code=v_code) THEN
      v_code := v_code || '-' || substr(gen_random_uuid()::text, 1, 4);
    END IF;
    INSERT INTO public.branches(tenant_id, code, name, address, phone, is_main, is_active)
      VALUES (_tenant_id, v_code, coalesce(nullif(trim(_branch_name),''),'Main Branch'),
              nullif(trim(_branch_address),''), nullif(trim(_branch_phone),''),
              NOT EXISTS (SELECT 1 FROM public.branches WHERE tenant_id=_tenant_id AND is_main=true AND deleted_at IS NULL),
              true)
      RETURNING id INTO v_branch;
  ELSE
    UPDATE public.branches
       SET name = coalesce(nullif(trim(_branch_name),''), name),
           address = coalesce(nullif(trim(_branch_address),''), address),
           phone = coalesce(nullif(trim(_branch_phone),''), phone),
           updated_at = now()
     WHERE id = v_branch AND tenant_id = _tenant_id;
    -- guarantee at least one main branch
    IF NOT EXISTS (SELECT 1 FROM public.branches WHERE tenant_id=_tenant_id AND is_main=true AND deleted_at IS NULL) THEN
      UPDATE public.branches SET is_main = true WHERE id = v_branch;
    END IF;
  END IF;

  -- WAREHOUSE
  IF v_warehouse IS NULL THEN
    v_code := upper(left(regexp_replace(coalesce(_warehouse_name, 'MAIN'), '[^A-Za-z0-9]', '', 'g'), 6));
    IF v_code = '' THEN v_code := 'MAIN'; END IF;
    IF EXISTS (SELECT 1 FROM public.warehouses WHERE tenant_id=_tenant_id AND code=v_code) THEN
      v_code := v_code || '-' || substr(gen_random_uuid()::text, 1, 4);
    END IF;
    INSERT INTO public.warehouses(tenant_id, branch_id, code, name, is_default, is_active)
      VALUES (_tenant_id, v_branch, v_code, coalesce(nullif(trim(_warehouse_name),''),'Main Warehouse'),
              NOT EXISTS (SELECT 1 FROM public.warehouses WHERE tenant_id=_tenant_id AND is_default=true AND deleted_at IS NULL),
              true)
      RETURNING id INTO v_warehouse;
  ELSE
    UPDATE public.warehouses
       SET branch_id = coalesce(branch_id, v_branch),
           name = coalesce(nullif(trim(_warehouse_name),''), name),
           updated_at = now()
     WHERE id = v_warehouse AND tenant_id = _tenant_id;
    -- guarantee at least one default warehouse
    IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE tenant_id=_tenant_id AND is_default=true AND deleted_at IS NULL) THEN
      UPDATE public.warehouses SET is_default = true WHERE id = v_warehouse;
    END IF;
  END IF;

  -- USER → BRANCH ASSIGNMENT (tenant_members.default_branch_id)
  UPDATE public.tenant_members
     SET default_branch_id = v_branch
   WHERE tenant_id = _tenant_id AND user_id = v_uid;

  -- Mirror into user_role_assignments so RLS that checks per-branch roles passes.
  -- Pick any existing role this user already has in this tenant, or the first role
  -- in the tenant — we don't change role membership, we only scope it to the branch.
  SELECT role_id INTO v_role_id
    FROM public.user_role_assignments
   WHERE tenant_id = _tenant_id AND user_id = v_uid
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_role_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_role_assignments
       WHERE tenant_id = _tenant_id AND user_id = v_uid
         AND role_id = v_role_id AND branch_id = v_branch
    ) THEN
      INSERT INTO public.user_role_assignments(tenant_id, user_id, role_id, branch_id, warehouse_id, assigned_by)
        VALUES (_tenant_id, v_uid, v_role_id, v_branch, v_warehouse, v_uid);
    END IF;
  END IF;

  -- OPTIONAL CASH REGISTER
  IF _create_register THEN
    -- close any orphan open registers for this user/branch first? No — just create another open one
    INSERT INTO public.cash_registers(tenant_id, branch_id, user_id, register_name, opening_amount, status, opened_at)
      VALUES (_tenant_id, v_branch, v_uid,
              coalesce(nullif(trim(_register_name),''),'Main Counter'),
              coalesce(_register_opening, 0), 'open', now())
      RETURNING id INTO v_register;
  END IF;

  RETURN jsonb_build_object(
    'branch_id', v_branch,
    'warehouse_id', v_warehouse,
    'register_id', v_register
  );
END $$;

GRANT EXECUTE ON FUNCTION public.setup_store_basics(uuid,uuid,text,text,text,uuid,text,boolean,text,numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.setup_store_basics(uuid,uuid,text,text,text,uuid,text,boolean,text,numeric) FROM anon, public;
