CREATE OR REPLACE FUNCTION public.auto_provision_tenant_catalog_via_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.provision_catalog_for_tenant(NEW.tenant_id, NEW.id, 5000);
  RETURN NEW;
END;
$$;

DROP FUNCTION public.provision_catalog_for_tenant(uuid, uuid);

REVOKE ALL ON FUNCTION public.provision_catalog_for_tenant(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_catalog_for_tenant(uuid, uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.auto_provision_tenant_catalog_via_branch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_provision_tenant_catalog_via_branch() TO service_role;