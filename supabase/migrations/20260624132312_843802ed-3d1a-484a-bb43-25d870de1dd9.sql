CREATE OR REPLACE FUNCTION public.admin_list_warehouses(_tenant_id uuid)
RETURNS TABLE(id uuid, name text, branch_id uuid, branch_name text, is_default boolean, status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.name,
    w.branch_id,
    b.name AS branch_name,
    w.is_default,
    CASE WHEN w.is_active THEN 'active' ELSE 'inactive' END AS status
  FROM public.warehouses w
  LEFT JOIN public.branches b ON b.id = w.branch_id
  WHERE w.tenant_id = _tenant_id
    AND w.deleted_at IS NULL
  ORDER BY w.name ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_list_warehouses(uuid) TO authenticated;