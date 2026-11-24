REVOKE EXECUTE ON FUNCTION public.get_product_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_tenant_product_capacity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_stats(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_product_capacity(uuid) TO authenticated, service_role;