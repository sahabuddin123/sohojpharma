REVOKE EXECUTE ON FUNCTION public.is_branch_admin(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_branch_admin(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_branch_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_branch_admin(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.user_can_access_branch(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.user_can_access_branch(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_branch(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_branch(uuid, uuid) TO service_role;