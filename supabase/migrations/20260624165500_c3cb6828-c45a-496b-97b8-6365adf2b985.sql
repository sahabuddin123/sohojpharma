CREATE OR REPLACE FUNCTION public.feature_flag_enabled(
  _features jsonb,
  _key text,
  _default boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _features IS NULL OR NOT (_features ? _key) THEN _default
    WHEN jsonb_typeof(_features -> _key) = 'boolean' THEN (_features ->> _key)::boolean
    WHEN jsonb_typeof(_features -> _key) = 'number' THEN ((_features ->> _key)::numeric <> 0)
    WHEN jsonb_typeof(_features -> _key) = 'string' THEN
      COALESCE(
        lower(nullif(_features ->> _key, '')) NOT IN ('false', '0', 'no', 'off', 'disabled', 'none', 'null'),
        false
      )
    WHEN jsonb_typeof(_features -> _key) = 'array' THEN jsonb_array_length(_features -> _key) > 0
    WHEN jsonb_typeof(_features -> _key) = 'object' THEN (_features -> _key) <> '{}'::jsonb
    ELSE _default
  END
$$;

GRANT EXECUTE ON FUNCTION public.feature_flag_enabled(jsonb, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.feature_flag_enabled(jsonb, text, boolean) TO service_role;

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
  v_plan public.plans%ROWTYPE;
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
      'sms', COALESCE(v_plan.sms_enabled, true),
      'mobile_app', true,
      'api_access', COALESCE(v_plan.api_enabled, true)
    );
  END IF;

  v_features := COALESCE(v_plan.features, '{}'::jsonb);

  RETURN jsonb_build_object(
    'pos', public.feature_flag_enabled(v_features, 'pos', true),
    'inventory', public.feature_flag_enabled(v_features, 'inventory', true),
    'purchase', public.feature_flag_enabled(v_features, 'purchase', true),
    'sales', public.feature_flag_enabled(v_features, 'sales', true),
    'reports', public.feature_flag_enabled(v_features, 'reports', true),
    'crm', public.feature_flag_enabled(v_features, 'crm', false),
    'accounting', public.feature_flag_enabled(v_features, 'accounting', false),
    'prescription', public.feature_flag_enabled(v_features, 'prescription', false),
    'mobile_app', public.feature_flag_enabled(v_features, 'mobile_app', false),
    'sms', COALESCE(v_plan.sms_enabled, false) OR public.feature_flag_enabled(v_features, 'sms', false),
    'api_access', COALESCE(v_plan.api_enabled, false)
      OR public.feature_flag_enabled(v_features, 'api_access', false)
      OR public.feature_flag_enabled(v_features, 'api', false)
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.tenant_features(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_features(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.has_tenant_feature(_tenant uuid, _feature text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((public.tenant_features(_tenant) ->> _feature)::boolean, false)
$$;

GRANT EXECUTE ON FUNCTION public.has_tenant_feature(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tenant_feature(uuid, text) TO service_role;