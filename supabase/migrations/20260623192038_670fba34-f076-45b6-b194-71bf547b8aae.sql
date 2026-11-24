
CREATE TABLE IF NOT EXISTS public.admin_tenant_impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  action text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.admin_tenant_impersonation_log TO authenticated;
GRANT ALL ON public.admin_tenant_impersonation_log TO service_role;

ALTER TABLE public.admin_tenant_impersonation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "App admins can read impersonation log" ON public.admin_tenant_impersonation_log;
CREATE POLICY "App admins can read impersonation log"
ON public.admin_tenant_impersonation_log
FOR SELECT TO authenticated
USING (public.is_app_admin(auth.uid()));

DROP POLICY IF EXISTS "App admins can insert impersonation log" ON public.admin_tenant_impersonation_log;
CREATE POLICY "App admins can insert impersonation log"
ON public.admin_tenant_impersonation_log
FOR INSERT TO authenticated
WITH CHECK (public.is_app_admin(auth.uid()) AND admin_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.admin_list_tenants()
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  status text,
  type tenant_type,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.slug, t.status, t.type, t.created_at
  FROM public.tenants t
  ORDER BY t.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_tenants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_tenants() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_switch_tenant(_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  status text,
  type tenant_type
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.tenants WHERE tenants.id = _tenant_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  INSERT INTO public.admin_tenant_impersonation_log (admin_user_id, tenant_id, action)
  VALUES (auth.uid(), _tenant_id, 'switch');

  RETURN QUERY
  SELECT t.id, t.name, t.slug, t.status, t.type
  FROM public.tenants t
  WHERE t.id = _tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_switch_tenant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_switch_tenant(uuid) TO authenticated;
