-- Admin-scoped store creation RPC. Mirrors register_pharmacy_store but
-- accepts an explicit owner user id (admin already created the auth user)
-- plus optional initial status/plan. Idempotent on the owner already
-- having a tenant (returns it).

CREATE OR REPLACE FUNCTION public.admin_register_pharmacy_store(
  _owner_user_id uuid,
  _pharmacy_name text,
  _owner_name    text,
  _mobile        text,
  _email         text,
  _address       text DEFAULT NULL,
  _district      text DEFAULT NULL,
  _trade_license text DEFAULT NULL,
  _initial_status text DEFAULT 'pending',
  _initial_plan   text DEFAULT 'free'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tenant uuid;
  v_slug text;
BEGIN
  IF v_caller IS NULL OR NOT public.is_app_admin(v_caller) THEN
    RAISE EXCEPTION 'forbidden_not_admin' USING ERRCODE = '42501';
  END IF;
  IF _owner_user_id IS NULL THEN
    RAISE EXCEPTION 'owner_user_id_required' USING ERRCODE = '22023';
  END IF;
  IF _initial_status NOT IN ('pending','active') THEN
    RAISE EXCEPTION 'invalid_initial_status' USING ERRCODE = '22023';
  END IF;

  -- Idempotency: if the target user already owns a tenant, return it.
  SELECT ur.tenant_id INTO v_tenant
    FROM public.user_roles ur
   WHERE ur.user_id = _owner_user_id AND ur.role = 'owner'
   LIMIT 1;
  IF v_tenant IS NOT NULL THEN
    RETURN v_tenant;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants
              WHERE lower(email) = lower(_email) AND status <> 'rejected') THEN
    RAISE EXCEPTION 'duplicate_email' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants
              WHERE mobile = _mobile AND status <> 'rejected') THEN
    RAISE EXCEPTION 'duplicate_mobile' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants
              WHERE lower(name) = lower(_pharmacy_name) AND status <> 'rejected') THEN
    RAISE EXCEPTION 'duplicate_pharmacy_name' USING ERRCODE = '23505';
  END IF;

  v_slug := lower(regexp_replace(_pharmacy_name, '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(gen_random_uuid()::text, 1, 8);

  INSERT INTO public.tenants(
    name, slug, owner_name, mobile, email, address_line, district,
    trade_license_no, status, plan
  )
  VALUES (
    _pharmacy_name, v_slug, _owner_name, _mobile, lower(_email),
    _address, _district, _trade_license, _initial_status, _initial_plan
  )
  RETURNING id INTO v_tenant;

  INSERT INTO public.tenant_members(tenant_id, user_id, is_default)
  VALUES (v_tenant, _owner_user_id, true)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  INSERT INTO public.user_roles(user_id, tenant_id, role)
  VALUES (_owner_user_id, v_tenant, 'owner')
  ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

  INSERT INTO public.approval_logs(tenant_id, action, to_status, approved_by, remarks)
  VALUES (v_tenant, 'admin_create', _initial_status, v_caller, 'Created by SaaS Admin');

  INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
  VALUES (v_tenant, v_caller, 'store_admin_created', 'tenants', v_tenant,
          jsonb_build_object('name', _pharmacy_name, 'owner_user_id', _owner_user_id,
                             'email', _email, 'status', _initial_status, 'plan', _initial_plan));

  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_register_pharmacy_store(
  uuid,text,text,text,text,text,text,text,text,text
) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_register_pharmacy_store(
  uuid,text,text,text,text,text,text,text,text,text
) TO authenticated;