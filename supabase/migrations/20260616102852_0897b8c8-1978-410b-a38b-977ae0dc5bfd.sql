
REVOKE EXECUTE ON FUNCTION public.get_active_subscription(uuid)   FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_subscription_active(uuid)    FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.can_create_resource(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_trial_subscription()  FROM public, anon;

GRANT EXECUTE ON FUNCTION public.get_active_subscription(uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_subscription_active(uuid)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_create_resource(uuid, text) TO authenticated, service_role;
