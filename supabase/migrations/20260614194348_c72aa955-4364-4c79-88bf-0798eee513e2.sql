
REVOKE ALL ON FUNCTION public.enforce_product_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_user_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_limits(public.tenant_plan) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_plan_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_limits(public.tenant_plan) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_plan_usage(uuid) TO authenticated;
