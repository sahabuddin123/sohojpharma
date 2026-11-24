REVOKE EXECUTE ON FUNCTION public.list_public_trusted_tenants(int) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_landing_cms() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_blog_view(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_trusted_tenants(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_landing_cms() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_blog_view(text) TO authenticated, service_role;