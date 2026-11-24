
-- 1) Add security jsonb to tenant_settings
ALTER TABLE public.tenant_settings
  ADD COLUMN IF NOT EXISTS security jsonb NOT NULL DEFAULT jsonb_build_object(
    'require_2fa', false,
    'password_min_length', 8,
    'password_require_uppercase', true,
    'password_require_lowercase', true,
    'password_require_number', true,
    'password_require_special', false,
    'session_timeout_minutes', 60,
    'max_failed_logins', 5,
    'lockout_minutes', 15,
    'allow_multiple_devices', true,
    'max_devices_per_user', 3,
    'ip_whitelist_enabled', false,
    'login_alerts', true,
    'role_change_alerts', true,
    'permission_change_alerts', true,
    'device_registration_required', true
  );

-- 2) IP whitelist table
CREATE TABLE IF NOT EXISTS public.allowed_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ip_address inet NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ip_address)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allowed_ips TO authenticated;
GRANT ALL ON public.allowed_ips TO service_role;
ALTER TABLE public.allowed_ips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allowed_ips select" ON public.allowed_ips;
CREATE POLICY "allowed_ips select" ON public.allowed_ips FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members tm
                 WHERE tm.tenant_id = allowed_ips.tenant_id AND tm.user_id = auth.uid()));

DROP POLICY IF EXISTS "allowed_ips write" ON public.allowed_ips;
CREATE POLICY "allowed_ips write" ON public.allowed_ips FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
    OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'::app_role)
    OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
    OR public.has_role(auth.uid(), tenant_id, 'corporate_admin'::app_role)
    OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
  );

-- 3) Password policy validator
CREATE OR REPLACE FUNCTION public.validate_password_policy(
  _tenant_id uuid, _password text
) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s jsonb;
  _violations text[] := '{}';
  _min int;
BEGIN
  SELECT security INTO _s FROM public.tenant_settings WHERE tenant_id = _tenant_id;
  IF _s IS NULL THEN _s := '{}'::jsonb; END IF;

  _min := COALESCE((_s->>'password_min_length')::int, 8);
  IF length(_password) < _min THEN
    _violations := _violations || ARRAY['Password must be at least ' || _min || ' characters'];
  END IF;

  IF COALESCE((_s->>'password_require_uppercase')::boolean, true)
     AND _password !~ '[A-Z]' THEN
    _violations := _violations || ARRAY['Password must contain an uppercase letter'];
  END IF;

  IF COALESCE((_s->>'password_require_lowercase')::boolean, true)
     AND _password !~ '[a-z]' THEN
    _violations := _violations || ARRAY['Password must contain a lowercase letter'];
  END IF;

  IF COALESCE((_s->>'password_require_number')::boolean, true)
     AND _password !~ '[0-9]' THEN
    _violations := _violations || ARRAY['Password must contain a number'];
  END IF;

  IF COALESCE((_s->>'password_require_special')::boolean, false)
     AND _password !~ '[^A-Za-z0-9]' THEN
    _violations := _violations || ARRAY['Password must contain a special character'];
  END IF;

  RETURN _violations;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_password_policy(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_password_policy(uuid, text) TO authenticated, service_role;

-- 4) Device policy validator (count active devices, compare to limit)
CREATE OR REPLACE FUNCTION public.validate_device_policy(
  _tenant_id uuid, _user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _s jsonb; _max int; _count int; _multi boolean;
BEGIN
  SELECT security INTO _s FROM public.tenant_settings WHERE tenant_id = _tenant_id;
  _multi := COALESCE((_s->>'allow_multiple_devices')::boolean, true);
  _max   := COALESCE((_s->>'max_devices_per_user')::int, 3);
  IF NOT _multi THEN _max := 1; END IF;
  SELECT count(*) INTO _count
    FROM public.registered_devices
    WHERE tenant_id = _tenant_id AND user_id = _user_id;
  RETURN jsonb_build_object(
    'allowed', _count < _max,
    'current', _count,
    'max', _max
  );
END;
$$;
REVOKE ALL ON FUNCTION public.validate_device_policy(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_device_policy(uuid, uuid) TO authenticated, service_role;
