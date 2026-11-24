REVOKE EXECUTE ON FUNCTION public.provision_catalog_for_tenant(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.provision_catalog_for_tenant(uuid, uuid) TO service_role;