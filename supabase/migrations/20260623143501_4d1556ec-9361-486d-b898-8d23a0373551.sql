
CREATE OR REPLACE FUNCTION public.tenant_features(_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_status text;
  v_plan   public.plans%ROWTYPE;
  v_features jsonb;
  v_is_admin boolean;
  v_member boolean;
BEGIN
  v_is_admin := COALESCE(public.is_app_admin(auth.uid()), false);
  IF NOT v_is_admin THEN
    SELECT EXISTS(
      SELECT 1 FROM public.tenant_members
      WHERE tenant_id = _tenant AND user_id = auth.uid()
    ) INTO v_member;
    IF NOT COALESCE(v_member, false) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT s.status, s.plan_id
    INTO v_status, v_plan_id
    FROM public.subscriptions s
   WHERE s.tenant_id = _tenant
   ORDER BY s.updated_at DESC
   LIMIT 1;

  IF v_plan_id IS NULL OR v_status IN ('cancelled','expired','suspended') THEN
    RETURN jsonb_build_object(
      'pos', false, 'inventory', false, 'purchase', false, 'sales', false,
      'crm', false, 'accounting', false, 'reports', false, 'prescription', false,
      'sms', false, 'mobile_app', false, 'api_access', false
    );
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = v_plan_id;

  IF COALESCE(v_plan.is_unlimited, false) THEN
    RETURN jsonb_build_object(
      'pos', true, 'inventory', true, 'purchase', true, 'sales', true,
      'crm', true, 'accounting', true, 'reports', true, 'prescription', true,
      'sms',        COALESCE(v_plan.sms_enabled, true),
      'mobile_app', true,
      'api_access', COALESCE(v_plan.api_enabled, true)
    );
  END IF;

  v_features := COALESCE(v_plan.features, '{}'::jsonb);

  RETURN jsonb_build_object(
    'pos',          COALESCE((v_features->>'pos')::boolean, true),
    'inventory',    COALESCE((v_features->>'inventory')::boolean, true),
    'purchase',     COALESCE((v_features->>'purchase')::boolean, true),
    'sales',        COALESCE((v_features->>'sales')::boolean, true),
    'reports',      COALESCE((v_features->>'reports')::boolean, true),
    'crm',          COALESCE((v_features->>'crm')::boolean, false),
    'accounting',   COALESCE((v_features->>'accounting')::boolean, false),
    'prescription', COALESCE((v_features->>'prescription')::boolean, false),
    'mobile_app',   COALESCE((v_features->>'mobile_app')::boolean, false),
    'sms',          COALESCE(v_plan.sms_enabled, false),
    'api_access',   COALESCE(v_plan.api_enabled, false)
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.tenant_features(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_tenant_feature(_tenant uuid, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE( (public.tenant_features(_tenant) ->> _feature)::boolean, false )
$$;

GRANT EXECUTE ON FUNCTION public.has_tenant_feature(uuid, text) TO authenticated, service_role;
