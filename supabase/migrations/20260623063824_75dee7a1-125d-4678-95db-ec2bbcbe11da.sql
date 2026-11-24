
-- PHASE 5.1 — Store registration & tenant provisioning

-- 1) Duplicate prevention on tenants (case-insensitive, ignores rejected)
CREATE UNIQUE INDEX IF NOT EXISTS tenants_email_unique_active
  ON public.tenants (lower(email))
  WHERE email IS NOT NULL AND status <> 'rejected';

CREATE UNIQUE INDEX IF NOT EXISTS tenants_mobile_unique_active
  ON public.tenants (mobile)
  WHERE mobile IS NOT NULL AND status <> 'rejected';

CREATE UNIQUE INDEX IF NOT EXISTS tenants_name_unique_active
  ON public.tenants (lower(name))
  WHERE status <> 'rejected';

-- 2) register_pharmacy_store: SECURITY DEFINER. Caller must be authenticated.
-- Creates tenant (pending), tenant_members, owner role. Idempotent on rerun.
CREATE OR REPLACE FUNCTION public.register_pharmacy_store(
  _pharmacy_name text,
  _owner_name    text,
  _mobile        text,
  _email         text,
  _address       text DEFAULT NULL,
  _district      text DEFAULT NULL,
  _trade_license text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tenant uuid;
  v_slug text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;

  -- Idempotency: if this user already owns a tenant, return it
  SELECT ur.tenant_id INTO v_tenant
    FROM public.user_roles ur
   WHERE ur.user_id = v_user AND ur.role = 'owner'
   LIMIT 1;
  IF v_tenant IS NOT NULL THEN
    RETURN v_tenant;
  END IF;

  -- Duplicate checks (mirrors unique indexes for nicer errors)
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
    _pharmacy_name, v_slug, _owner_name, _mobile, lower(_email), _address, _district,
    _trade_license, 'pending', 'free'
  )
  RETURNING id INTO v_tenant;

  INSERT INTO public.tenant_members(tenant_id, user_id, is_default)
  VALUES (v_tenant, v_user, true)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  INSERT INTO public.user_roles(user_id, tenant_id, role)
  VALUES (v_user, v_tenant, 'owner')
  ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

  INSERT INTO public.approval_logs(tenant_id, action, to_status, approved_by, remarks)
  VALUES (v_tenant, 'register', 'pending', v_user, 'Store self-registered');

  INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
  VALUES (v_tenant, v_user, 'store_registered', 'tenants', v_tenant,
          jsonb_build_object('name', _pharmacy_name, 'owner', _owner_name, 'email', _email));

  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.register_pharmacy_store(text,text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_pharmacy_store(text,text,text,text,text,text,text) TO authenticated;

-- 3) provision_tenant: SECURITY DEFINER. Idempotent. Creates default resources.
CREATE OR REPLACE FUNCTION public.provision_tenant(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch uuid;
  v_warehouse uuid;
  v_register uuid;
  v_subscription uuid;
  v_owner uuid;
  v_plan uuid;
  v_trial_days integer;
  v_created jsonb := '{}'::jsonb;
BEGIN
  -- caller authorization: app admin or owner of this tenant
  IF NOT (public.is_app_admin(auth.uid())
          OR public.has_role(auth.uid(), _tenant_id, 'owner')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '28000';
  END IF;

  SELECT user_id INTO v_owner
    FROM public.user_roles
   WHERE tenant_id = _tenant_id AND role = 'owner'
   ORDER BY created_at ASC
   LIMIT 1;

  -- a) Head Office branch
  SELECT id INTO v_branch
    FROM public.branches
   WHERE tenant_id = _tenant_id AND branch_role = 'head_office' AND deleted_at IS NULL
   LIMIT 1;
  IF v_branch IS NULL THEN
    INSERT INTO public.branches(tenant_id, code, name, is_main, branch_role)
    VALUES (_tenant_id, 'HQ', 'Head Office', true, 'head_office')
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_branch;
    v_created := v_created || jsonb_build_object('branch', v_branch);
  END IF;

  -- b) Main warehouse
  SELECT id INTO v_warehouse
    FROM public.warehouses
   WHERE tenant_id = _tenant_id AND is_hq = true AND deleted_at IS NULL
   LIMIT 1;
  IF v_warehouse IS NULL THEN
    INSERT INTO public.warehouses(tenant_id, branch_id, code, name, is_default, is_hq)
    VALUES (_tenant_id, v_branch, 'MAIN', 'Main Warehouse', true, true)
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_warehouse;
    v_created := v_created || jsonb_build_object('warehouse', v_warehouse);
  END IF;

  -- c) Branch settings
  INSERT INTO public.branch_settings(tenant_id, branch_id)
  VALUES (_tenant_id, v_branch)
  ON CONFLICT DO NOTHING;

  -- d) Default tax profile
  INSERT INTO public.tax_profiles(tenant_id, name, rate, type)
  VALUES (_tenant_id, 'VAT 0%', 0, 'standard')
  ON CONFLICT (tenant_id, name) DO NOTHING;

  -- e) Number series seeds
  INSERT INTO public.number_series_counters(tenant_id, doc_type, current_value)
  VALUES
    (_tenant_id, 'invoice',  0),
    (_tenant_id, 'purchase', 0),
    (_tenant_id, 'grn',      0),
    (_tenant_id, 'transfer', 0),
    (_tenant_id, 'quotation',0)
  ON CONFLICT (tenant_id, doc_type) DO NOTHING;

  -- f) Default subscription (free trial)
  SELECT id INTO v_subscription FROM public.subscriptions
   WHERE tenant_id = _tenant_id LIMIT 1;
  IF v_subscription IS NULL THEN
    SELECT id, COALESCE(trial_days, 14) INTO v_plan, v_trial_days
      FROM public.plans WHERE code = 'free' AND is_active = true LIMIT 1;
    IF v_plan IS NOT NULL THEN
      INSERT INTO public.subscriptions(
        tenant_id, plan_id, status, starts_at, trial_ends_at,
        current_period_start, current_period_end, expires_at, billing_cycle
      )
      VALUES (
        _tenant_id, v_plan, 'trial', now(), now() + (v_trial_days || ' days')::interval,
        now(), now() + (v_trial_days || ' days')::interval,
        now() + (v_trial_days || ' days')::interval, 'monthly'
      )
      RETURNING id INTO v_subscription;
      v_created := v_created || jsonb_build_object('subscription', v_subscription);
    END IF;
  END IF;

  -- g) Cash register for owner (skip if cash_registers table not used yet for them)
  IF v_owner IS NOT NULL THEN
    SELECT id INTO v_register FROM public.cash_registers
     WHERE tenant_id = _tenant_id AND user_id = v_owner AND status = 'open' LIMIT 1;
    IF v_register IS NULL THEN
      INSERT INTO public.cash_registers(
        tenant_id, branch_id, user_id, register_name, opening_amount, status
      )
      VALUES (_tenant_id, v_branch, v_owner, 'Main Register', 0, 'open')
      RETURNING id INTO v_register;
      v_created := v_created || jsonb_build_object('cash_register', v_register);
    END IF;
  END IF;

  -- h) Audit
  INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
  VALUES (_tenant_id, auth.uid(), 'tenant_provisioned', 'tenants', _tenant_id, v_created);

  RETURN jsonb_build_object(
    'tenant_id', _tenant_id,
    'branch_id', v_branch,
    'warehouse_id', v_warehouse,
    'subscription_id', v_subscription,
    'cash_register_id', v_register,
    'created', v_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_tenant(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.provision_tenant(uuid) TO authenticated;
