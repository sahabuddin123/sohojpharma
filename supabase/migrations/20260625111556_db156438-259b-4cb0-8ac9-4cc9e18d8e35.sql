CREATE OR REPLACE FUNCTION public.user_can_access_branch(_tenant_id uuid, _branch_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Platform admins bypass branch scoping when impersonating a tenant
  IF public.is_app_admin(auth.uid()) THEN
    RETURN true;
  END IF;

  IF NOT public.is_tenant_member(auth.uid(), _tenant_id) THEN
    RETURN false;
  END IF;

  IF _branch_id IS NULL THEN
    RETURN true;
  END IF;

  IF public.is_branch_admin(auth.uid(), _tenant_id) THEN
    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.tenant_id = _tenant_id
      AND s.user_id = auth.uid()
      AND s.branch_id IS NOT NULL
      AND COALESCE(s.status, 'active') <> 'inactive'
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.tenant_id = _tenant_id
      AND s.user_id = auth.uid()
      AND s.branch_id = _branch_id
      AND COALESCE(s.status, 'active') <> 'inactive'
  );
END;
$function$;