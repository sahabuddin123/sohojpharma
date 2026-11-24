CREATE OR REPLACE FUNCTION public.resolve_user_branch(_tenant_id uuid, _user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT cr.branch_id FROM public.cash_registers cr
      WHERE cr.tenant_id = _tenant_id AND cr.user_id = _user_id AND cr.branch_id IS NOT NULL
      ORDER BY cr.opened_at DESC NULLS LAST LIMIT 1),
    (SELECT tm.default_branch_id FROM public.tenant_members tm
      WHERE tm.tenant_id = _tenant_id AND tm.user_id = _user_id AND tm.default_branch_id IS NOT NULL
      LIMIT 1),
    (SELECT s.branch_id FROM public.staff s
      WHERE s.tenant_id = _tenant_id AND s.user_id = _user_id AND s.branch_id IS NOT NULL
      LIMIT 1),
    (SELECT b.id FROM public.branches b
      WHERE b.tenant_id = _tenant_id AND b.deleted_at IS NULL AND b.is_active = true
      ORDER BY b.is_main DESC NULLS LAST, b.created_at ASC LIMIT 1),
    (SELECT b.id FROM public.branches b
      WHERE b.tenant_id = _tenant_id
      ORDER BY b.created_at ASC LIMIT 1)
  )
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_user_branch(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_user_branch(uuid, uuid) TO authenticated, service_role;