CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.is_app_admin(_user_id), false)
      OR EXISTS (
        SELECT 1
        FROM public.tenant_members
        WHERE user_id = _user_id
          AND tenant_id = _tenant_id
      )
$function$;

CREATE OR REPLACE FUNCTION public.user_branch_ids(_user uuid, _tenant uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(public.is_app_admin(_user), false) OR EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE ura.user_id = _user
      AND ura.tenant_id = _tenant
      AND r.code IN ('owner','corporate_admin','auditor','regional_manager')
  ) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = _user AND tm.tenant_id = _tenant
      AND tm.default_branch_id IS NULL
  ) THEN
    RETURN QUERY
      SELECT b.id FROM public.branches b
      WHERE b.tenant_id = _tenant AND b.deleted_at IS NULL;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT tm.default_branch_id
    FROM public.tenant_members tm
    WHERE tm.user_id = _user AND tm.tenant_id = _tenant
      AND tm.default_branch_id IS NOT NULL;
END;
$function$;