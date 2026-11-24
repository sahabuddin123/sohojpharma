CREATE OR REPLACE FUNCTION public.admin_auto_sync_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v jsonb; v_total bigint;
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(*) INTO v_total FROM public.global_medicines WHERE approved = true;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object(
      'tenant_id', t.id,
      'name', t.name,
      'auto_sync', t.auto_sync_global_catalog,
      'linked', (SELECT count(*) FROM public.products p
                  WHERE p.tenant_id = t.id AND p.deleted_at IS NULL AND p.global_medicine_id IS NOT NULL),
      'total_approved', v_total
    ) AS x
    FROM public.tenants t
    WHERE coalesce(t.status, 'active') <> 'deleted'
  ) s;

  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_tenant_auto_sync(_tenant_id uuid, _enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.tenants SET auto_sync_global_catalog = _enabled WHERE id = _tenant_id;
  RETURN _enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_auto_sync_overview() FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_set_tenant_auto_sync(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_auto_sync_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_auto_sync(uuid, boolean) TO authenticated;