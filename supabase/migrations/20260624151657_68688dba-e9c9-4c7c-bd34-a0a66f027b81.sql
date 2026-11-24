
CREATE OR REPLACE FUNCTION public.setup_store_basics(
  _tenant_id uuid,
  _branch_id uuid,
  _branch_name text,
  _branch_address text,
  _branch_phone text,
  _warehouse_id uuid,
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
    IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE tenant_id=_tenant_id AND is_default=true AND deleted_at IS NULL) THEN
      UPDATE public.warehouses SET is_default = true WHERE id = v_warehouse;
    END IF;
  END IF;

  -- USER ASSIGNMENT
  UPDATE public.tenant_members SET default_branch_id = v_branch
   WHERE tenant_id = _tenant_id AND user_id = v_uid;

  SELECT role_id INTO v_role_id
    FROM public.user_role_assignments
   WHERE tenant_id = _tenant_id AND user_id = v_uid
   ORDER BY created_at ASC LIMIT 1;

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

  -- CASH REGISTER — only when user has no open register, to satisfy
  -- cash_registers_one_open_per_user unique constraint.
  IF _create_register THEN
    SELECT id INTO v_register
      FROM public.cash_registers
     WHERE tenant_id = _tenant_id AND user_id = v_uid AND status = 'open'
     LIMIT 1;

    IF v_register IS NULL THEN
      INSERT INTO public.cash_registers(tenant_id, branch_id, user_id, register_name, opening_amount, status, opened_at)
        VALUES (_tenant_id, v_branch, v_uid,
                coalesce(nullif(trim(_register_name),''),'Main Counter'),
                coalesce(_register_opening, 0), 'open', now())
        RETURNING id INTO v_register;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'branch_id', v_branch,
    'warehouse_id', v_warehouse,
    'register_id', v_register
  );
END $$;
