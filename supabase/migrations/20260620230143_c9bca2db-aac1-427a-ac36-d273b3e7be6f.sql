
-- 1) tenant_settings.subscription column
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS subscription jsonb NOT NULL DEFAULT jsonb_build_object(
    'plan_visibility', true,
    'usage_warnings', true,
    'renewal_reminders', true,
    'grace_period_days', 7,
    'allow_overage', false
  );

-- 2) has_feature(_tenant_id, _feature_code)
CREATE OR REPLACE FUNCTION public.has_feature(_tenant_id uuid, _feature_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.tenant_id = _tenant_id
      AND s.status IN ('active','trialing','grace')
      AND (
        (p.features ? _feature_code AND (p.features ->> _feature_code)::boolean = true)
        OR (p.features -> 'enabled' ? _feature_code)
      )
  );
$$;

-- 3) check_plan_limit(_tenant_id, _resource)
CREATE OR REPLACE FUNCTION public.check_plan_limit(_tenant_id uuid, _resource text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_used  integer := 0;
  v_plan  record;
  v_allow_overage boolean;
BEGIN
  SELECT p.* INTO v_plan
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.tenant_id = _tenant_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT COALESCE((subscription->>'allow_overage')::boolean, false)
    INTO v_allow_overage
  FROM public.tenant_settings WHERE tenant_id = _tenant_id;

  IF _resource = 'products' THEN
    v_limit := v_plan.max_products;
    SELECT COUNT(*) INTO v_used FROM public.products WHERE tenant_id = _tenant_id;
  ELSIF _resource = 'users' THEN
    v_limit := v_plan.max_users;
    SELECT COUNT(*) INTO v_used FROM public.tenant_members WHERE tenant_id = _tenant_id;
  ELSIF _resource = 'branches' THEN
    v_limit := v_plan.max_branches;
    SELECT COUNT(*) INTO v_used FROM public.branches WHERE tenant_id = _tenant_id;
  ELSIF _resource = 'warehouses' THEN
    v_limit := NULL;
    SELECT COUNT(*) INTO v_used FROM public.warehouses WHERE tenant_id = _tenant_id;
  ELSIF _resource = 'customers' THEN
    v_limit := NULL;
    SELECT COUNT(*) INTO v_used FROM public.customers WHERE tenant_id = _tenant_id;
  ELSIF _resource = 'suppliers' THEN
    v_limit := NULL;
    SELECT COUNT(*) INTO v_used FROM public.suppliers WHERE tenant_id = _tenant_id;
  ELSIF _resource = 'devices' THEN
    v_limit := NULL;
    SELECT COUNT(*) INTO v_used FROM public.registered_devices WHERE tenant_id = _tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'resource', _resource,
    'used', v_used,
    'limit', v_limit,
    'allow_overage', COALESCE(v_allow_overage, false),
    'over_limit', (v_limit IS NOT NULL AND v_used >= v_limit),
    'can_create', (v_limit IS NULL OR v_used < v_limit OR COALESCE(v_allow_overage,false))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_feature(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_plan_limit(uuid, text) TO authenticated, service_role;
